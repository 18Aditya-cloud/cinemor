"""
Runs a request against this same app, in-process, as the owner of an organization project's
workspace: /api/employee/projects/{id}/work/<path>  ->  /api/individual/projects/{workspace}/<path>.

The existing individual routes then do all the AI work unchanged. Permissions are checked
before (EmployeeWorkflowService.check_work).

The answer is returned as soon as the inner route has sent its response; work the route
started in the background (video generation) keeps running after that.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import Request
from fastapi.responses import Response

from app.core.security import create_access_token

# inner requests that are still running background work after answering
_RUNNING: set[asyncio.Task] = set()

_PASS_HEADERS = {"content-type", "accept", "accept-language"}
_DROP_RESPONSE_HEADERS = {"content-length", "transfer-encoding", "connection", "content-encoding"}


def _finished(task: asyncio.Task) -> None:
    _RUNNING.discard(task)
    if not task.cancelled():
        task.exception()  # already answered as a 500 by the app; read it so asyncio does not warn


async def forward_to_workspace(
    request: Request,
    *,
    individual_project_id: int,
    owner_user_id: int,
    subpath: str,
    project_id: int | None = None,
) -> Response:
    path = f"/api/individual/projects/{individual_project_id}"
    if subpath.strip("/"):
        path += "/" + subpath.strip("/")

    token = create_access_token(user_id=owner_user_id)
    headers = [
        (key.encode("latin-1"), value.encode("latin-1"))
        for key, value in request.headers.items()
        if key.lower() in _PASS_HEADERS
    ]
    headers.append((b"authorization", f"Bearer {token}".encode("latin-1")))
    body = await request.body()
    # bodies that name the project (video generation) name the workspace inside
    if body and "json" in (request.headers.get("content-type") or ""):
        try:
            data = json.loads(body)
        except ValueError:
            data = None
        if isinstance(data, dict) and data.get("project_id") is not None:
            data["project_id"] = individual_project_id
            body = json.dumps(data).encode("utf-8")
    headers.append((b"content-length", str(len(body)).encode("latin-1")))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": request.method,
        "scheme": request.url.scheme,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "root_path": "",
        "query_string": request.url.query.encode("latin-1"),
        "headers": headers,
        "client": request.client and (request.client.host, request.client.port),
        "server": ("cinemor-internal", 80),
        "state": dict(request.scope.get("state") or {}),
    }

    status_code = 500
    response_headers: list[tuple[bytes, bytes]] = []
    chunks: list[bytes] = []
    answered = asyncio.Event()
    sent_body = False

    async def receive():
        nonlocal sent_body
        if not sent_body:
            sent_body = True
            return {"type": "http.request", "body": body, "more_body": False}
        # nothing more will come; wait (a route that listens for a disconnect never gets one)
        await asyncio.Event().wait()

    async def send(message):
        nonlocal status_code, response_headers
        if message["type"] == "http.response.start":
            status_code = message["status"]
            response_headers = list(message.get("headers") or [])
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                answered.set()

    app = request.app
    task = asyncio.create_task(app(scope, receive, send))
    _RUNNING.add(task)
    task.add_done_callback(_finished)

    waiter = asyncio.create_task(answered.wait())
    try:
        await asyncio.wait({task, waiter}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        if not waiter.done():
            waiter.cancel()

    if not answered.is_set():
        error = task.exception() if task.done() and not task.cancelled() else None
        raise RuntimeError("The inner request ended without an answer.") from error

    content = b"".join(chunks)
    # the project itself (GET .../work): answer with the organization project's id, so the pages keep using it
    if project_id is not None and not subpath.strip("/") and status_code == 200:
        try:
            data = json.loads(content)
        except ValueError:
            data = None
        if isinstance(data, dict) and "id" in data:
            data["id"] = project_id
            content = json.dumps(data).encode("utf-8")

    out_headers = {
        key.decode("latin-1"): value.decode("latin-1")
        for key, value in response_headers
        if key.decode("latin-1").lower() not in _DROP_RESPONSE_HEADERS
    }
    return Response(content=content, status_code=status_code, headers=out_headers)

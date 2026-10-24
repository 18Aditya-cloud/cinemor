"""
Lightweight per-IP, per-route rate limiting.

A fixed-window counter kept in process memory. This is enough to blunt
brute-force and abuse on a single-instance deployment. For multiple
instances/workers, back this with Redis instead (the interface stays the same).

The client IP is taken from X-Forwarded-For *only* when the app is run behind a
trusted proxy (uvicorn --proxy-headers / --forwarded-allow-ips); otherwise it is
the socket peer. Never trust X-Forwarded-For without such a proxy.
"""

from __future__ import annotations

import threading
import time

from fastapi import HTTPException, Request, status

from app.core.config import settings

_lock = threading.Lock()
_hits: dict[tuple[str, str], list[float]] = {}


def _client_ip(request: Request) -> str:
    """
    The caller's IP for rate limiting.

    Behind a proxy (Render, Railway, Nginx, Cloudflare...) set TRUSTED_PROXY_HOPS
    to the number of proxies in front of the app. Each proxy APPENDS the address
    it saw to X-Forwarded-For, so the trustworthy entry is counted from the
    RIGHT; anything further left was written by the client and can be faked.
    (Do not rely on uvicorn --forwarded-allow-ips="*": that trusts the left-most,
    client-controlled entry.)
    """
    hops = settings.TRUSTED_PROXY_HOPS
    if hops > 0:
        forwarded = request.headers.get("x-forwarded-for", "")
        parts = [part.strip() for part in forwarded.split(",") if part.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


def rate_limit(*, limit: int, window_seconds: int):
    """Return a FastAPI dependency allowing `limit` requests per window per IP."""

    def dependency(request: Request) -> None:
        key = (request.url.path, _client_ip(request))
        now = time.monotonic()
        cutoff = now - window_seconds
        with _lock:
            bucket = [t for t in _hits.get(key, ()) if t > cutoff]
            if len(bucket) >= limit:
                retry = int(window_seconds - (now - bucket[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please slow down and try again shortly.",
                    headers={"Retry-After": str(max(retry, 1))},
                )
            bucket.append(now)
            _hits[key] = bucket

    return dependency

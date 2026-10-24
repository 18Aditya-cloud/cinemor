"""
Security headers on every API response.

A plain ASGI middleware (not BaseHTTPMiddleware), so file and video
responses keep streaming normally.

Cross-Origin-Resource-Policy is deliberately NOT set: the frontend usually
lives on another origin (app.example.com vs api.example.com) and must still
be able to load images and videos from this API.
"""

from __future__ import annotations

from app.core.config import settings

_ALWAYS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
]

# Production only: HSTS needs HTTPS, and the strict CSP would block the
# interactive /docs page that exists only in debug.
_PRODUCTION = [
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
]


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app
        self.headers = _ALWAYS + ([] if settings.DEBUG else _PRODUCTION)

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                present = {key.lower() for key, _ in headers}
                for key, value in self.headers:
                    if key not in present:
                        headers.append((key, value))
                message["headers"] = headers
            await send(message)

        return await self.app(scope, receive, send_with_headers)

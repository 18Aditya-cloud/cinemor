"""
Cinemor Backend Entry Point.

This file allows the Story Service to be started directly
from the backend root directory.

Command:

    py -3.10 -m uvicorn main:app --reload
"""

import sys
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# Backend Paths
# ============================================================

BACKEND_ROOT = Path(__file__).resolve().parent

STORY_SERVICE_PATH = (
    BACKEND_ROOT
    / "services"
    / "story-service"
)

# Make the Story Service importable from the backend root.
if str(STORY_SERVICE_PATH) not in sys.path:
    sys.path.insert(
        0,
        str(STORY_SERVICE_PATH),
    )


# ============================================================
# Story Service Application
# ============================================================

from app.main import app  # noqa: E402


# ============================================================
# CORS
# ============================================================
#
# The frontend runs through Vite during development.
# Both localhost and 127.0.0.1 are supported because browsers
# treat them as different origins.
#
# Credentials are enabled because Cinemor uses an HttpOnly
# refresh-token cookie.
#

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Accept",
        "Authorization",
        "Content-Type",
        "Origin",
        "X-Requested-With",
    ],
)


# ============================================================
# Public Export
# ============================================================

__all__ = [
    "app",
]
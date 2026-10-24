"""rotate the shared dummy password hash of existing Google (OAuth) users

Revision ID: f4a7c1e9b3d5
Revises: e9b4c2d8f1a6
Create Date: 2026-10-24 20:20:00

Before the security fix, every user created through "Sign in with Google" was
stored with password_hash = DUMMY_PASSWORD_HASH. The documented way to make
that hash used the public plaintext "cinemor-dummy-password", so anyone could
log in to those accounts with email + that password.

New Google users already get a random, unknowable hash. This migration gives
the same treatment to the Google users that already exist. They keep signing
in with Google exactly as before; only the unusable password changes.

A hash is replaced when it equals the configured DUMMY_PASSWORD_HASH, or when
it verifies against the known dummy plaintext. Real passwords cannot match:
sign-up requires upper case, a digit and a symbol, which that plaintext lacks.
Safe to run more than once.
"""

from __future__ import annotations

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pwdlib import PasswordHash


revision: str = "f4a7c1e9b3d5"
down_revision: Union[str, Sequence[str], None] = "e9b4c2d8f1a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KNOWN_DUMMY_PLAINTEXTS = ("cinemor-dummy-password",)


def _configured_dummy_hash() -> str | None:
    try:
        from app.core.config import settings

        return settings.DUMMY_PASSWORD_HASH or None
    except Exception:  # noqa: BLE001 - settings are optional here
        return None


def upgrade() -> None:
    hasher = PasswordHash.recommended()
    connection = op.get_bind()

    rows = connection.execute(sa.text("SELECT id, password_hash FROM users")).fetchall()
    configured = _configured_dummy_hash()

    # Users created from one dummy hash share the very same hash string, so
    # each distinct value only needs to be checked once.
    verdict: dict[str, bool] = {}
    to_rotate: list[int] = []

    for user_id, password_hash in rows:
        if not password_hash:
            continue
        if password_hash not in verdict:
            matches = configured is not None and password_hash == configured
            if not matches:
                for plaintext in KNOWN_DUMMY_PLAINTEXTS:
                    try:
                        if hasher.verify(plaintext, password_hash):
                            matches = True
                            break
                    except Exception:  # noqa: BLE001 - unreadable hash: leave it
                        pass
            verdict[password_hash] = matches
        if verdict[password_hash]:
            to_rotate.append(user_id)

    # Existing sessions are left alone, so nobody is logged out by this
    # deploy (the app was never public, so no session can come from the hole).
    for user_id in to_rotate:
        connection.execute(
            sa.text("UPDATE users SET password_hash = :h WHERE id = :id"),
            {"h": hasher.hash(secrets.token_urlsafe(32)), "id": user_id},
        )

    print(f"[migration] rotated dummy password hash for {len(to_rotate)} user(s)")


def downgrade() -> None:
    # The old hash was a security hole; it is intentionally not restored.
    pass

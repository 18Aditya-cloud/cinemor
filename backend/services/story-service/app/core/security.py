"""
Authentication security utilities for Cinemor.

Responsibilities:
- Password hashing and verification using Argon2.
- RS256 JWT access-token creation and verification.
- Cryptographically secure refresh-token generation.
- Refresh-token hashing for database storage.

This module contains cryptographic/security primitives only.
Authentication business logic belongs in auth_service.py.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import settings


# ============================================================
# Password Hashing
# ============================================================

_password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """
    Hash a plaintext password using the recommended pwdlib
    password hashing configuration.

    Argon2 is used by pwdlib's recommended configuration.
    """

    if not password:
        raise ValueError("Password cannot be empty.")

    return _password_hasher.hash(password)


def verify_password(
    password: str,
    password_hash: str,
) -> bool:
    """
    Verify a plaintext password against a stored password hash.

    Returns:
        True when the password matches.
        False otherwise.
    """

    if not password or not password_hash:
        return False

    return _password_hasher.verify(
        password,
        password_hash,
    )


def verify_password_with_dummy_hash(
    password: str,
    password_hash: str | None,
) -> bool:
    """
    Verify a password while protecting the login flow against
    username-enumeration timing differences.

    When no real user exists, the configured dummy Argon2 hash
    is used so the server still performs an expensive password
    verification operation.
    """

    hash_to_verify = (
        password_hash
        if password_hash
        else settings.DUMMY_PASSWORD_HASH
    )

    return _password_hasher.verify(
        password,
        hash_to_verify,
    )


# ============================================================
# Time Utilities
# ============================================================

def utc_now() -> datetime:
    """
    Return the current UTC time as a timezone-aware datetime.
    """

    return datetime.now(timezone.utc)


# ============================================================
# Access Token
# ============================================================

def create_access_token(
    *,
    user_id: int,
    role: str | None = None,
    organization_id: int | None = None,
) -> str:
    """
    Create a short-lived RS256 JWT access token.

    Claims:
        sub:
            User ID.

        type:
            Identifies this as an access token.

        iat:
            Issued-at timestamp.

        exp:
            Expiration timestamp.

        jti:
            Unique token identifier.

        role:
            Organization role when applicable.

        organization_id:
            Organization ID when applicable.
    """

    now = utc_now()

    expires_at = (
        now
        + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(32),
    }

    if role is not None:
        payload["role"] = role

    if organization_id is not None:
        payload["organization_id"] = organization_id

    return jwt.encode(
        payload,
        settings.JWT_PRIVATE_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


# ============================================================
# Access Token Verification
# ============================================================

def decode_access_token(
    token: str,
) -> dict[str, Any]:
    """
    Decode and verify an access token.

    The token must:
    - be correctly signed with the configured RSA private key
    - use RS256
    - not be expired
    - contain the expected access-token type

    Raises:
        jwt.InvalidTokenError:
            When the token is invalid.
    """

    if not token:
        raise jwt.InvalidTokenError(
            "Access token is empty."
        )

    payload = jwt.decode(
        token,
        settings.JWT_PUBLIC_KEY,
        algorithms=["RS256"],
        options={
            "require": [
                "sub",
                "type",
                "iat",
                "exp",
                "jti",
            ],
        },
    )

    if payload.get("type") != "access":
        raise jwt.InvalidTokenError(
            "Invalid token type."
        )

    return payload


# ============================================================
# Refresh Token
# ============================================================

def generate_refresh_token() -> str:
    """
    Generate a cryptographically secure opaque refresh token.

    The raw token is returned to the client but must never be
    stored directly in the database.
    """

    return secrets.token_urlsafe(64)


def hash_refresh_token(
    refresh_token: str,
) -> str:
    """
    SHA-256 hash a refresh token before database storage.

    The database therefore never contains the raw refresh token.
    """

    if not refresh_token:
        raise ValueError(
            "Refresh token cannot be empty."
        )

    return hashlib.sha256(
        refresh_token.encode("utf-8")
    ).hexdigest()


# ============================================================
# Refresh Token Expiration
# ============================================================

def get_refresh_token_expiry() -> datetime:
    """
    Calculate the expiration timestamp for a refresh session.
    """

    return (
        utc_now()
        + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
    )


# ============================================================
# Refresh Token Comparison
# ============================================================

def verify_refresh_token_hash(
    refresh_token: str,
    stored_token_hash: str,
) -> bool:
    """
    Compare a raw refresh token with its stored SHA-256 hash.

    compare_digest is used for constant-time comparison.
    """

    if not refresh_token or not stored_token_hash:
        return False

    calculated_hash = hash_refresh_token(
        refresh_token
    )

    return secrets.compare_digest(
        calculated_hash,
        stored_token_hash,
    )


# ============================================================
# Token Expiration Helper
# ============================================================

def is_expired(
    expires_at: datetime,
) -> bool:
    """
    Determine whether a timezone-aware expiration timestamp
    has passed.
    """

    now = utc_now()

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    return expires_at <= now
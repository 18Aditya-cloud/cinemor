"""
Outgoing email for Cinemor, in one place.

Provider (EMAIL_PROVIDER):
    smtp    any SMTP server, e.g. Gmail with an App Password (fine for testing)
    resend  the Resend HTTP API (recommended for production)

Two ways to send:
    send_email_now(...)         waits for delivery (with retries); raises
                                EmailDeliveryError if every attempt fails.
                                Used for admin actions (invitations) so the
                                admin learns about a failure.
    send_email_background(...)  returns immediately; delivery (with retries)
                                happens on a worker thread and failures are
                                only logged. Used for public endpoints
                                (sign-up, resend, forgot password) so response
                                time never reveals whether an account exists.
"""

from __future__ import annotations

import logging
import smtplib
import time
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_ATTEMPTS = 3
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="cinemor-email")


class EmailDeliveryError(Exception):
    """Every delivery attempt failed."""


# ============================================================
# Providers
# ============================================================

def _deliver_smtp(*, to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
        server.starttls()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)


def _deliver_resend(*, to_email: str, subject: str, body: str) -> None:
    if not settings.RESEND_API_KEY:
        raise EmailDeliveryError("RESEND_API_KEY is not set.")
    response = httpx.post(
        settings.RESEND_API_URL,
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": subject,
            "text": body,
        },
        timeout=20,
    )
    response.raise_for_status()


def _deliver_once(*, to_email: str, subject: str, body: str) -> None:
    provider = (settings.EMAIL_PROVIDER or "smtp").strip().lower()
    if provider == "resend":
        _deliver_resend(to_email=to_email, subject=subject, body=body)
    elif provider == "smtp":
        _deliver_smtp(to_email=to_email, subject=subject, body=body)
    else:
        raise EmailDeliveryError(f"Unknown EMAIL_PROVIDER: {provider!r}")


# ============================================================
# Sending
# ============================================================

def send_email_now(*, to_email: str, subject: str, body: str) -> None:
    """Deliver with retries (1s, 2s back-off). Raises EmailDeliveryError."""
    last_error: Exception | None = None
    for attempt in range(1, _ATTEMPTS + 1):
        try:
            _deliver_once(to_email=to_email, subject=subject, body=body)
            return
        except Exception as exc:  # noqa: BLE001 - every provider error is retried
            last_error = exc
            logger.warning(
                "Email delivery attempt %s/%s failed (%s): %s",
                attempt, _ATTEMPTS, subject, exc,
            )
            if attempt < _ATTEMPTS:
                time.sleep(attempt)
    raise EmailDeliveryError(str(last_error)) from last_error


def _deliver_logged(to_email: str, subject: str, body: str) -> None:
    try:
        send_email_now(to_email=to_email, subject=subject, body=body)
    except EmailDeliveryError:
        logger.exception("Email could not be delivered (%s).", subject)


def send_email_background(*, to_email: str, subject: str, body: str) -> None:
    """Queue delivery on a worker thread and return immediately."""
    _pool.submit(_deliver_logged, to_email, subject, body)


# Backwards-compatible name used elsewhere in the code base (waits, raises).
def _send_email(*, to_email: str, subject: str, body: str) -> None:
    send_email_now(to_email=to_email, subject=subject, body=body)


# ============================================================
# Messages
# ============================================================

def send_invitation_email(to_email: str, invitation_link: str) -> None:
    """Employee invitation. Waits, so the inviting admin sees a failure."""
    send_email_now(
        to_email=to_email,
        subject="You're invited to Cinemor",
        body=f"""
You're invited to Cinemor.

You have been invited to join Cinemor.

Click the link below to accept your invitation
and create your password:

{invitation_link}

If you did not expect this invitation, you can safely ignore this email.
""",
    )


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    send_email_background(
        to_email=to_email,
        subject="Reset your Cinemor password",
        body=f"""
Hello,

We received a request to reset your Cinemor password.

Click the link below to create a new password:

{reset_link}

This password reset link will expire in 30 minutes.

If you did not request a password reset, you can safely ignore this email.

Regards,
Cinemor AI
""",
    )


def send_verification_email(to_email: str, verify_link: str) -> None:
    hours = settings.EMAIL_VERIFICATION_EXPIRE_HOURS
    send_email_background(
        to_email=to_email,
        subject="Confirm your email for Cinemor",
        body=f"""
Hello,

Please confirm that this is your email address to finish creating
your Cinemor account:

{verify_link}

This link works for {hours} hours. If you did not sign up for Cinemor,
you can ignore this email and no account will be activated.

Regards,
Cinemor AI
""",
    )


def send_existing_account_email(to_email: str, login_link: str, reset_link: str) -> None:
    """Someone tried to sign up with an email that already has an account."""
    send_email_background(
        to_email=to_email,
        subject="Someone tried to sign up to Cinemor with your email",
        body=f"""
Hello,

Someone tried to create a new Cinemor account with this email address,
but you already have an account.

If it was you, just log in:
{login_link}

Forgot your password? Reset it here:
{reset_link}

If it was not you, you can ignore this email. Your account is unchanged.

Regards,
Cinemor AI
""",
    )

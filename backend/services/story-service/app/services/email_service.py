import smtplib
from email.message import EmailMessage

from app.core.config import settings


def _send_email(
    *,
    to_email: str,
    subject: str,
    body: str,
) -> None:
    message = EmailMessage()

    message["Subject"] = subject
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email

    message.set_content(body)

    with smtplib.SMTP(
        settings.SMTP_HOST,
        settings.SMTP_PORT,
    ) as server:
        server.starttls()

        server.login(
            settings.SMTP_USERNAME,
            settings.SMTP_PASSWORD,
        )

        server.send_message(message)


def send_invitation_email(
    to_email: str,
    invitation_link: str,
) -> None:
    _send_email(
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


def send_password_reset_email(
    to_email: str,
    reset_link: str,
) -> None:
    _send_email(
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
from __future__ import annotations
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    get_refresh_token_expiry,
    hash_password,
    hash_refresh_token,
    is_expired,
    utc_now,
    verify_password_with_dummy_hash,
    verify_refresh_token_hash,
)
from app.models.membership import OrganizationRole
from app.models.user import AccountType
from app.repositories.auth_repository import AuthRepository
from app.constants.cinemor_features import CINEMOR_FEATURES
from app.services.email_service import (
    send_existing_account_email,
    send_password_reset_email,
    send_verification_email,
)


class AuthService:
    """
    Business logic for authentication and organization onboarding.

    Employee-specific production information is stored in Employee:

        - max_concurrent_projects
        - is_team_leader
        - is_reviewer

    Job roles are stored through EmployeeJobRole.

    OrganizationMembership stores:

        - organization membership
        - system RBAC role
        - active/inactive status
        - team_leader_id
    """

    GENERIC_LOGIN_ERROR = "Invalid email or password."

    INVITATION_EXPIRE_DAYS = 7

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AuthRepository(db)

    # ========================================================
    # Internal Helpers
    # ========================================================

    @staticmethod
    def _normalize_email(email: str) -> str:
        normalized = email.strip().lower()

        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email cannot be empty.",
            )

        return normalized

    @staticmethod
    def _validate_password(
        password: str,
    ) -> None:

        if not password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password cannot be empty.",
            )

        if len(password) < 12:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must contain at least 12 characters.",
            )

        if len(password) > 128:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must not exceed 128 characters.",
            )

        if not any(character.islower() for character in password):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must contain at least one lowercase letter.",
            )

        if not any(character.isupper() for character in password):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must contain at least one uppercase letter.",
            )

        if not any(character.isdigit() for character in password):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must contain at least one number.",
            )

        if not any(
            not character.isalnum()
            for character in password
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must contain at least one special character.",
            )

    @classmethod
    def _validate_password_confirmation(
        cls,
        password: str,
        confirm_password: str,
    ) -> None:

        cls._validate_password(password)

        if password != confirm_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Passwords do not match.",
            )

    def forgot_password(
        self,
        *,
        email: str,
    ):
        """
        Create a password reset token and send
        the reset link to the user's email.
        """

        normalized_email = email.strip().lower()

        user = self.repository.get_user_by_email(
            email=normalized_email,
        )

        generic_message = (
            "If an account exists for this email, "
            "a password reset link has been sent."
        )

        # Do not reveal whether the email exists.
        if user is None:
            return {
                "message": generic_message,
            }

        raw_token = secrets.token_urlsafe(48)

        token_hash = hashlib.sha256(
            raw_token.encode("utf-8")
        ).hexdigest()

        expires_at = (
            datetime.now(timezone.utc)
            + timedelta(minutes=30)
        )

        self.repository.create_password_reset_token(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        reset_link = (
            f"{settings.FRONTEND_URL}"
            f"/reset-password?token={raw_token}"
        )

        # Persist the token first, then attempt delivery. A delivery failure
        # must NOT change the response or status code, otherwise the endpoint
        # would reveal whether the email belongs to a real account.
        self.db.commit()

        try:
            send_password_reset_email(
                to_email=normalized_email,
                reset_link=reset_link,
            )
        except Exception:
            # Swallow and log server-side; never surface to the caller.
            logging.getLogger(__name__).exception(
                "Password reset email delivery failed."
            )

        return {
            "message": generic_message,
        }


    def reset_password(
        self,
        *,
        token: str,
        new_password: str,
        confirm_password: str,
    ):
        """
        Reset the user's password using a valid
        password reset token.
        """

        if new_password != confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match.",
            )

        # Use the same password validation already
        # used during registration/password changes.
        self._validate_password(
            new_password,
        )

        token_hash = hashlib.sha256(
            token.encode("utf-8")
        ).hexdigest()

        reset_token = (
            self.repository.get_password_reset_token(
                token_hash=token_hash,
            )
        )

        if reset_token is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired password reset token.",
            )

        now = datetime.now(timezone.utc)

        if reset_token.used_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This password reset token has already been used.",
            )

        if reset_token.expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired password reset token.",
            )

        user = self.repository.get_user_by_id(
            reset_token.user_id,
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to reset password.",
            )

        try:
            user.password_hash = hash_password(
                new_password,
            )

            # The reset link was delivered to this inbox, so opening it
            # proves the email too. This is also how the real owner takes
            # back an email someone else signed up with but never confirmed.
            if not user.is_email_verified:
                user.is_email_verified = True
                self.repository.retire_email_verification_tokens(
                    user_id=user.id,
                    at=now,
                )

            user.failed_login_attempts = 0
            user.locked_until = None

            self.repository.mark_password_reset_token_used(
                reset_token=reset_token,
                used_at=now,
            )

            # A reset invalidates every existing session, so a thief who
            # still holds an old refresh token is logged out.
            self.repository.revoke_all_user_refresh_sessions(
                user_id=user.id,
            )

            self.db.commit()

        except Exception:
            self.db.rollback()
            raise

        return {
            "message": "Password reset successfully.",
        }

    def change_password(
        self,
        *,
        user_id: int,
        current_password: str,
        new_password: str,
        confirm_password: str,
    ):
        if new_password != confirm_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Passwords do not match.",
            )

        self._validate_password(
            new_password,
        )

        user = self.repository.get_user_by_id(
            user_id,
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found.",
            )

        password_valid = (
            verify_password_with_dummy_hash(
                current_password,
                user.password_hash,
            )
        )

        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect.",
            )

        user.password_hash = hash_password(
            new_password,
        )

        self.repository.revoke_all_user_refresh_sessions(
            user_id=user.id,
        )

        self.db.commit()

        return {
            "message": "Password updated successfully.",
        }

    @staticmethod
    def _validate_project_limit(
        max_concurrent_projects: int | None,
    ) -> None:

        if max_concurrent_projects is None:
            return

        if max_concurrent_projects < 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Maximum concurrent projects must be at least 1.",
            )

        if max_concurrent_projects > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Maximum concurrent projects must not exceed 100.",
            )

    @staticmethod
    def _validate_system_role(
        system_role: str,
    ) -> OrganizationRole:

        normalized = system_role.strip().lower()

        try:
            return OrganizationRole(normalized)

        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid organization role: {system_role}.",
            ) from exc

    def _get_token_context(
        self,
        *,
        user_id: int,
    ) -> tuple[str | None, int | None, Any | None]:

        memberships = (
            self.repository.get_active_user_memberships(
                user_id
            )
        )

        if not memberships:
            return None, None, None

        if len(memberships) > 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "User belongs to multiple active organizations. "
                    "Organization selection is required."
                ),
            )

        membership = memberships[0]

        organization = (
            self.repository.get_organization_by_id(
                membership.organization_id
            )
        )

        if (
            organization is None
            or not organization.is_active
        ):
            return None, None, None

        return (
            membership.role.value,
            membership.organization_id,
            membership,
        )

    # ========================================================
    # Supabase OAuth
    # ========================================================

    @staticmethod
    def _get_supabase_user(
        *,
        access_token: str,
    ) -> dict[str, Any]:
        """
        Validate a Supabase access token through Supabase Auth and
        return the authenticated Supabase user payload.

        The frontend is never trusted for identity information.
        Supabase is the identity provider, and this backend endpoint
        uses the Supabase Auth /user endpoint as the source of truth.
        """
        if not access_token or not access_token.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase access token is required.",
            )

        if not settings.SUPABASE_URL:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase authentication is not configured.",
            )

        if not settings.SUPABASE_ANON_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase authentication is not configured.",
            )

        supabase_url = settings.SUPABASE_URL.rstrip("/")
        endpoint = f"{supabase_url}/auth/v1/user"

        request = Request(
            endpoint,
            headers={
                "Authorization": f"Bearer {access_token.strip()}",
                "apikey": settings.SUPABASE_ANON_KEY,
                "Accept": "application/json",
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=10) as response:
                response_body = response.read().decode("utf-8")
                payload = json.loads(response_body)

        except HTTPError as exc:
            if exc.code in (400, 401, 403):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Supabase access token.",
                ) from exc

            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to validate the Supabase session.",
            ) from exc

        except (URLError, TimeoutError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach Supabase authentication service.",
            ) from exc

        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Invalid response from Supabase authentication service.",
            ) from exc

        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Invalid response from Supabase authentication service.",
            )

        return payload

    @staticmethod
    def _ensure_google_supabase_user(
        supabase_user: dict[str, Any],
    ) -> str:
        """
        Extract and validate the email belonging to a Google identity
        authenticated by Supabase.
        """
        email = supabase_user.get("email")

        if not isinstance(email, str) or not email.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The Google account does not have a usable email address.",
            )

        identities = supabase_user.get("identities") or []
        identity_providers = {
            identity.get("provider")
            for identity in identities
            if isinstance(identity, dict)
        }

        app_metadata = supabase_user.get("app_metadata") or {}
        metadata_provider = (
            app_metadata.get("provider")
            if isinstance(app_metadata, dict)
            else None
        )

        if (
            "google" not in identity_providers
            and metadata_provider != "google"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This endpoint only accepts Google OAuth accounts.",
            )

        # Google must vouch for the address: Supabase sets email_confirmed_at
        # when the provider reports a verified email, and Google's own claim
        # is copied into user_metadata.email_verified.
        user_metadata = supabase_user.get("user_metadata") or {}
        google_says_verified = (
            isinstance(user_metadata, dict)
            and user_metadata.get("email_verified") is True
        ) or any(
            isinstance(identity, dict)
            and identity.get("provider") == "google"
            and isinstance(identity.get("identity_data"), dict)
            and identity["identity_data"].get("email_verified") is True
            for identity in identities
        )

        if not (supabase_user.get("email_confirmed_at") or google_says_verified):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Google has not verified this email address.",
            )

        return email.strip().lower()

    def login_with_supabase(
        self,
        *,
        access_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> dict[str, Any]:
        """
        Exchange a validated Supabase Google session for a Cinemor session.

        New OAuth users intentionally keep account_type NULL so that
        the frontend can route them through /choose-account.
        """
        supabase_user = self._get_supabase_user(
            access_token=access_token,
        )

        email = self._ensure_google_supabase_user(
            supabase_user,
        )

        user = self.repository.get_user_by_email_for_update(email)

        try:
            if user is None:
                # OAuth users have no password. Store a hash of a random,
                # unknowable secret so that no shared/guessable value (such as
                # the dummy-hash plaintext) can be used to log in as them.
                user = self.repository.create_user(
                    email=email,
                    password_hash=hash_password(secrets.token_urlsafe(32)),
                )
            elif not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is inactive.",
                )
            elif not user.is_email_verified:
                # An unconfirmed password sign-up exists for this email, and
                # Google has now proven who owns the inbox. Drop the unproven
                # password so whoever typed it cannot use the account.
                self._reset_unconfirmed_user(
                    user,
                    password_hash=hash_password(secrets.token_urlsafe(32)),
                )

            # Google verified the address.
            user.is_email_verified = True

            role, organization_id, membership = self._get_token_context(
                user_id=user.id,
            )

            access_token = create_access_token(
                user_id=user.id,
                role=role,
                organization_id=organization_id,
            )

            refresh_token = generate_refresh_token()

            refresh_session = self.repository.create_refresh_session(
                user_id=user.id,
                token_hash=hash_refresh_token(refresh_token),
                expires_at=get_refresh_token_expiry(),
                user_agent=user_agent,
                ip_address=ip_address,
            )

            self.db.commit()

            self.db.refresh(user)
            self.db.refresh(refresh_session)

            if membership is not None:
                self.db.refresh(membership)

            return {
                "user": user,
                "membership": membership,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "refresh_session": refresh_session,
            }

        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unable to create or authenticate the Cinemor account.",
            ) from exc

    # ========================================================
    # Account Type Selection
    # ========================================================

    def set_account_type(
        self,
        *,
        user_id: int,
        account_type: str,
    ) -> dict[str, Any]:

        normalized = account_type.strip().lower()

        try:
            selected_type = AccountType(normalized)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Invalid account type. "
                    "Choose 'individual' or 'organization'."
                ),
            ) from exc

        user = self.repository.get_user_by_id(user_id)

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive.",
            )

        # Account type is a one-time onboarding decision.
        if user.account_type is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account type has already been selected.",
            )

        # A user with an existing organization membership should
        # already have an organization-related account type.
        existing_memberships = (
            self.repository.get_active_user_memberships(user.id)
        )

        if existing_memberships:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This account is already associated "
                    "with an organization."
                ),
            )

        organization = None
        membership = None

        try:
            if selected_type == AccountType.INDIVIDUAL:
                user.account_type = AccountType.INDIVIDUAL

            elif selected_type == AccountType.ORGANIZATION:
                user.account_type = AccountType.ORGANIZATION

                organization = (
                    self.repository.create_organization()
                )

                membership = (
                    self.repository.create_membership(
                        organization_id=organization.id,
                        user_id=user.id,
                        role=OrganizationRole.ADMIN,
                    )
                )

            self.db.commit()

            self.db.refresh(user)

            if organization is not None:
                self.db.refresh(organization)

            if membership is not None:
                self.db.refresh(membership)

            return {
                "user": user,
                "organization": organization,
                "membership": membership,
            }

        except IntegrityError as exc:
            self.db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unable to save account type.",
            ) from exc

    # ========================================================
    # Individual Registration
    # ========================================================

    def register_individual(
        self,
        *,
        email: str,
        password: str,
        confirm_password: str,
    ) -> dict[str, Any]:
        """
        Start an Individual sign-up. The account cannot be used until the
        email is confirmed through the link we send. The response never
        reveals whether the email already had an account.
        """
        return self._register(
            email=email,
            password=password,
            confirm_password=confirm_password,
            account_type=AccountType.INDIVIDUAL,
        )

    # ========================================================
    # Organization Registration
    # ========================================================

    def register_organization(
        self,
        *,
        email: str,
        password: str,
        confirm_password: str,
    ) -> dict[str, Any]:
        """
        Start an Organization sign-up (the user becomes the administrator of a
        new organization once the email is confirmed).
        """
        return self._register(
            email=email,
            password=password,
            confirm_password=confirm_password,
            account_type=AccountType.ORGANIZATION,
        )

    # ========================================================
    # Sign-up + Email Verification
    # ========================================================

    SIGNUP_MESSAGE = (
        "Check your inbox. We've sent a link to confirm your email "
        "and finish creating your account."
    )
    VERIFICATION_RESEND_COOLDOWN_SECONDS = 60

    def _register(
        self,
        *,
        email: str,
        password: str,
        confirm_password: str,
        account_type: AccountType,
    ) -> dict[str, Any]:
        email = self._normalize_email(email)

        self._validate_password_confirmation(
            password,
            confirm_password,
        )

        # Hash first on every path, so the response time does not reveal
        # whether the email already belongs to an account.
        password_hash = hash_password(password)

        existing_user = self.repository.get_user_by_email_for_update(email)

        if existing_user is not None and existing_user.is_email_verified:
            # A confirmed account already uses this email. Tell its owner
            # (by email) instead of telling the person filling in the form.
            self.db.rollback()
            base = settings.FRONTEND_URL.rstrip("/")
            send_existing_account_email(
                existing_user.email,
                f"{base}/login",
                f"{base}/forgot-password",
            )
            return {"message": self.SIGNUP_MESSAGE, "email": email}

        try:
            if existing_user is None:
                user = self.repository.create_user(
                    email=email,
                    password_hash=password_hash,
                )
            else:
                # An unconfirmed account has no proven owner. The newest
                # sign-up replaces it; only whoever opens the link in this
                # inbox can activate it, with the password chosen here.
                user = existing_user
                self._reset_unconfirmed_user(user, password_hash=password_hash)

            user.account_type = account_type
            user.is_email_verified = False

            if account_type == AccountType.ORGANIZATION:
                self._ensure_admin_membership(user)
            else:
                self.repository.deactivate_user_memberships(user_id=user.id)

            raw_token = self._issue_email_verification(user)

            self.db.commit()

        except IntegrityError:
            # Another sign-up for the same email committed at the same moment;
            # that request sends the link.
            self.db.rollback()
            return {"message": self.SIGNUP_MESSAGE, "email": email}

        send_verification_email(user.email, self._verification_link(raw_token))

        return {"message": self.SIGNUP_MESSAGE, "email": email}

    def _ensure_admin_membership(self, user) -> None:
        memberships = self.repository.get_active_user_memberships(user.id)
        if any(m.role == OrganizationRole.ADMIN for m in memberships):
            return
        self.repository.deactivate_user_memberships(user_id=user.id)
        organization = self.repository.create_organization()
        self.repository.create_membership(
            organization_id=organization.id,
            user_id=user.id,
            role=OrganizationRole.ADMIN,
        )

    def _reset_unconfirmed_user(self, user, *, password_hash: str) -> None:
        """Wipe whatever an earlier, unconfirmed sign-up left behind."""
        user.password_hash = password_hash
        user.failed_login_attempts = 0
        user.locked_until = None
        self.repository.revoke_all_user_refresh_sessions(user_id=user.id)
        self.repository.retire_email_verification_tokens(user_id=user.id, at=utc_now())

    def _issue_email_verification(self, user) -> str:
        now = utc_now()
        self.repository.retire_email_verification_tokens(user_id=user.id, at=now)
        raw_token = secrets.token_urlsafe(48)
        self.repository.create_email_verification_token(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=now + timedelta(hours=settings.EMAIL_VERIFICATION_EXPIRE_HOURS),
        )
        return raw_token

    @staticmethod
    def _verification_link(raw_token: str) -> str:
        return f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={raw_token}"

    def verify_email(self, *, token: str) -> dict[str, Any]:
        invalid = HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This confirmation link is not valid.",
        )
        if not token or not token.strip():
            raise invalid

        record = self.repository.get_email_verification_token_for_update(
            token_hash=hash_refresh_token(token.strip()),
        )
        if record is None:
            raise invalid

        user = self.repository.get_user_by_id(record.user_id)
        if user is None or not user.is_active:
            raise invalid

        if record.used_at is not None:
            if user.is_email_verified:
                # Opening the same link twice is harmless.
                return {
                    "message": "Your email is already confirmed. You can log in.",
                    "email": user.email,
                    "already_verified": True,
                }
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This link was replaced by a newer one. "
                    "Use the most recent email we sent, or ask for a new link."
                ),
            )

        if is_expired(record.expires_at):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This link has expired. Ask for a new one.",
            )

        now = utc_now()
        user.is_email_verified = True
        record.used_at = now
        self.repository.retire_email_verification_tokens(user_id=user.id, at=now)
        self.db.commit()

        return {
            "message": "Email confirmed. You can log in now.",
            "email": user.email,
            "already_verified": False,
        }

    def resend_verification(self, *, email: str) -> dict[str, Any]:
        generic = {
            "message": (
                "If that email has an account waiting for confirmation, "
                "we've sent a new link."
            )
        }

        try:
            normalized = self._normalize_email(email)
        except HTTPException:
            return generic

        user = self.repository.get_user_by_email_for_update(normalized)
        if user is None or user.is_email_verified or not user.is_active:
            self.db.rollback()
            return generic

        latest = self.repository.get_latest_email_verification_token(user_id=user.id)
        if latest is not None and latest.created_at is not None:
            created = latest.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age = (utc_now() - created).total_seconds()
            if age < self.VERIFICATION_RESEND_COOLDOWN_SECONDS:
                self.db.rollback()
                return generic

        raw_token = self._issue_email_verification(user)
        self.db.commit()
        send_verification_email(user.email, self._verification_link(raw_token))
        return generic

    # ========================================================
    # Login
    # ========================================================

    def login(
        self,
        *,
        email: str,
        password: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> dict[str, Any]:

        email = self._normalize_email(email)

        user = (
            self.repository
            .get_user_by_email_for_update(email)
        )

        password_valid = (
            verify_password_with_dummy_hash(
                password,
                user.password_hash
                if user is not None
                else None,
            )
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=self.GENERIC_LOGIN_ERROR,
            )

        now = utc_now()

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive.",
            )

        if (
            user.locked_until is not None
            and user.locked_until > now
        ):
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=(
                    "Account temporarily locked due to "
                    "multiple failed login attempts."
                ),
            )

        if not password_valid:
            user.failed_login_attempts += 1

            if (
                user.failed_login_attempts
                >= settings.MAX_LOGIN_ATTEMPTS
            ):
                user.locked_until = (
                    now
                    + timedelta(
                        minutes=settings.LOGIN_LOCKOUT_MINUTES
                    )
                )

                user.failed_login_attempts = 0

            self.db.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=self.GENERIC_LOGIN_ERROR,
            )

        user.failed_login_attempts = 0
        user.locked_until = None

        # Checked only after the password was proven, so this answer is
        # never given to someone who does not know the password.
        if not user.is_email_verified:
            self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "email_not_verified",
                    "message": (
                        "Please confirm your email first. Open the link we "
                        "sent you, or ask for a new one."
                    ),
                },
            )

        role, organization_id, membership = (
            self._get_token_context(
                user_id=user.id
            )
        )

        access_token = create_access_token(
            user_id=user.id,
            role=role,
            organization_id=organization_id,
        )

        refresh_token = generate_refresh_token()

        refresh_session = (
            self.repository.create_refresh_session(
                user_id=user.id,
                token_hash=hash_refresh_token(
                    refresh_token
                ),
                expires_at=get_refresh_token_expiry(),
                user_agent=user_agent,
                ip_address=ip_address,
            )
        )

        self.db.commit()

        self.db.refresh(user)
        self.db.refresh(refresh_session)

        if membership is not None:
            self.db.refresh(membership)

        return {
            "user": user,
            "membership": membership,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "refresh_session": refresh_session,
        }

    # ========================================================
    # Employee Invitation
    # ========================================================

    def invite_employee(
        self,
        *,
        organization_id: int,
        email: str,
        job_role_id: int,
        system_role: str = "employee",
        max_concurrent_projects: int | None = None,
    ) -> tuple[Any, str]:

        email = self._normalize_email(email)

        organization = (
            self.repository.get_organization_by_id(
                organization_id
            )
        )

        if organization is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found.",
            )

        if not organization.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization is inactive.",
            )

        role = self._validate_system_role(system_role)

        if role != OrganizationRole.EMPLOYEE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Employee invitations can only create "
                    "employee memberships."
                ),
            )

        job_role = (
            self.repository.get_organization_job_role(
                organization_id=organization_id,
                job_role_id=job_role_id,
            )
        )

        if job_role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job role not found in this organization.",
            )

        self._validate_project_limit(
            max_concurrent_projects
        )

        existing_invitation = (
            self.repository
            .get_pending_invitation_by_email(
                organization_id=organization_id,
                email=email,
            )
        )

        if existing_invitation is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A pending invitation already exists "
                    "for this email."
                ),
            )

        existing_user = (
            self.repository.get_user_by_email(email)
        )

        # An unconfirmed sign-up has no proven owner; it must not block the
        # real owner from being invited (the invitation link proves the inbox).
        if existing_user is not None and existing_user.is_email_verified:

            existing_membership = (
                self.repository.get_membership(
                    user_id=existing_user.id,
                    organization_id=organization_id,
                )
            )

            if existing_membership is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "This user is already a member "
                        "of the organization."
                    ),
                )

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "An account already exists with "
                    "this email."
                ),
            )

        raw_token = generate_refresh_token()

        token_hash = hash_refresh_token(
            raw_token
        )

        expires_at = (
            utc_now()
            + timedelta(
                days=self.INVITATION_EXPIRE_DAYS
            )
        )

        try:
            invitation = (
                self.repository
                .create_employee_invitation(
                    organization_id=organization_id,
                    email=email,
                    job_role_id=job_role_id,
                    system_role=role.value,
                    max_concurrent_projects=(
                        max_concurrent_projects
                    ),
                    token_hash=token_hash,
                    expires_at=expires_at,
                )
            )

            self.db.commit()
            self.db.refresh(invitation)

            return invitation, raw_token

        except IntegrityError as exc:
            self.db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unable to create employee invitation.",
            ) from exc

    # ========================================================
    # Accept Employee Invitation
    # ========================================================

    def accept_employee_invitation(
        self,
        *,
        token: str,
        password: str,
        confirm_password: str,
    ) -> dict[str, Any]:

        if not token or not token.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation token is required.",
            )

        self._validate_password_confirmation(
            password,
            confirm_password,
        )
        self._validate_password(password)

        token_hash = hash_refresh_token(token)

        invitation = (
            self.repository
            .get_invitation_by_token_hash(
                token_hash=token_hash
            )
        )

        if invitation is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid invitation token.",
            )

        now = utc_now()

        if invitation.is_accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This invitation has already been accepted.",
            )

        if invitation.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This invitation has been revoked.",
            )

        if is_expired(invitation.expires_at):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This invitation has expired.",
            )

        organization = (
            self.repository.get_organization_by_id(
                invitation.organization_id
            )
        )

        if organization is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization no longer exists.",
            )

        if not organization.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization is inactive.",
            )

        job_role = (
            self.repository.get_organization_job_role(
                organization_id=invitation.organization_id,
                job_role_id=invitation.job_role_id,
            )
        )

        if job_role is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned job role is no longer available.",
            )

        system_role = self._validate_system_role(
            invitation.system_role
        )

        if system_role != OrganizationRole.EMPLOYEE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid employee invitation role.",
            )

        email = self._normalize_email(
            invitation.email
        )

        existing_user = (
            self.repository.get_user_by_email(email)
        )

        if existing_user is not None and existing_user.is_email_verified:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "An account already exists with "
                    "the invited email."
                ),
            )

        password_hash = hash_password(password)

        try:

            # ------------------------------------------------
            # User
            # ------------------------------------------------

            if existing_user is None:
                user = self.repository.create_user(
                    email=email,
                    password_hash=password_hash,
                )
            else:
                # An earlier, unconfirmed sign-up with this email: the
                # invitation link proves the inbox, so take that account over
                # cleanly instead of refusing the invitation.
                user = existing_user
                self._reset_unconfirmed_user(user, password_hash=password_hash)
                self.repository.deactivate_user_memberships(user_id=user.id)

            user.account_type = AccountType.ORGANIZATION
            # The invitation link was delivered to this inbox.
            user.is_email_verified = True

            # ------------------------------------------------
            # Organization Membership
            #
            # Only organization-level information goes here.
            # ------------------------------------------------

            membership = (
                self.repository.create_membership(
                    organization_id=invitation.organization_id,
                    user_id=user.id,
                    role=system_role,
                    team_leader_id=None,
                )
            )

            # ------------------------------------------------
            # Employee
            # ------------------------------------------------

            employee = (
                self.repository.create_employee(
                    organization_id=invitation.organization_id,
                    user_id=user.id,
                    max_concurrent_projects=(
                        invitation.max_concurrent_projects
                    ),
                    is_team_leader=False,
                    is_reviewer=False,
                )
            )

            # ------------------------------------------------
            # Employee Job Role
            # ------------------------------------------------

            employee_job_role = (
                self.repository.create_employee_job_role(
                    employee_id=employee.id,
                    job_role_id=invitation.job_role_id,
                )
            )

            # ------------------------------------------------
            # Mark invitation accepted
            # ------------------------------------------------

            self.repository.accept_employee_invitation(
                invitation=invitation,
                accepted_at=now,
            )

            # ------------------------------------------------
            # Tokens
            # ------------------------------------------------

            access_token = create_access_token(
                user_id=user.id,
                role=system_role.value,
                organization_id=invitation.organization_id,
            )

            refresh_token = generate_refresh_token()

            refresh_session = (
                self.repository.create_refresh_session(
                    user_id=user.id,
                    token_hash=hash_refresh_token(
                        refresh_token
                    ),
                    expires_at=get_refresh_token_expiry(),
                )
            )

            self.db.commit()

            self.db.refresh(user)
            self.db.refresh(membership)
            self.db.refresh(employee)
            self.db.refresh(employee_job_role)
            self.db.refresh(invitation)
            self.db.refresh(refresh_session)

            return {
                "user": user,
                "organization": organization,
                "membership": membership,
                "employee": employee,
                "employee_job_role": employee_job_role,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "refresh_session": refresh_session,
            }

        except IntegrityError as exc:
            self.db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unable to create the employee account.",
            ) from exc

    # ========================================================
    # Refresh Access Token
    # ========================================================

    def refresh_access_token(
        self,
        *,
        refresh_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> dict[str, Any]:

        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token is required.",
            )

        token_hash = hash_refresh_token(
            refresh_token
        )

        session = (
            self.repository
            .get_refresh_session_by_hash_for_update(
                token_hash
            )
        )

        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token.",
            )

        now = utc_now()

        if session.revoked_at is not None:

            self.repository.revoke_all_user_refresh_sessions(
                user_id=session.user_id
            )

            self.db.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    "Refresh token reuse detected. "
                    "Please log in again."
                ),
            )

        if is_expired(session.expires_at):

            self.repository.revoke_refresh_session(
                refresh_session=session,
                revoked_at=now,
            )

            self.db.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has expired.",
            )

        if not verify_refresh_token_hash(
            refresh_token,
            session.token_hash,
        ):

            self.repository.revoke_all_user_refresh_sessions(
                user_id=session.user_id
            )

            self.db.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token.",
            )

        user = self.repository.get_user_by_id(
            session.user_id
        )

        if (
            user is None
            or not user.is_active
            or not user.is_email_verified
        ):

            self.repository.revoke_refresh_session(
                refresh_session=session,
                revoked_at=now,
            )

            self.db.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is unavailable.",
            )

        role, organization_id, membership = (
            self._get_token_context(
                user_id=user.id
            )
        )

        new_access_token = create_access_token(
            user_id=user.id,
            role=role,
            organization_id=organization_id,
        )

        new_refresh_token = generate_refresh_token()

        new_token_hash = hash_refresh_token(
            new_refresh_token
        )

        new_session = (
            self.repository.create_refresh_session(
                user_id=user.id,
                token_hash=new_token_hash,
                expires_at=get_refresh_token_expiry(),
                user_agent=user_agent,
                ip_address=ip_address,
            )
        )

        self.repository.revoke_refresh_session(
            refresh_session=session,
            replaced_by_token_hash=new_token_hash,
            revoked_at=now,
        )

        self.db.commit()

        self.db.refresh(user)
        self.db.refresh(new_session)

        if membership is not None:
            self.db.refresh(membership)

        return {
            "user": user,
            "membership": membership,
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "refresh_session": new_session,
        }

    # ========================================================
    # Logout
    # ========================================================

    def logout(
        self,
        *,
        refresh_token: str,
    ) -> None:

        if not refresh_token:
            return

        token_hash = hash_refresh_token(
            refresh_token
        )

        session = (
            self.repository
            .get_refresh_session_by_hash_for_update(
                token_hash
            )
        )

        if session is None:
            return

        if session.revoked_at is None:
            self.repository.revoke_refresh_session(
                refresh_session=session,
                revoked_at=utc_now(),
            )

        self.db.commit()

    # ========================================================
    # Logout All Devices
    # ========================================================

    def logout_all(
        self,
        *,
        user_id: int,
    ) -> int:

        count = (
            self.repository
            .revoke_all_user_refresh_sessions(
                user_id=user_id
            )
        )

        self.db.commit()

        return count

    # ========================================================
    # Get User Membership
    # ========================================================

    def get_user_membership(
        self,
        *,
        user_id: int,
        organization_id: int,
    ):

        membership = (
            self.repository.get_active_membership(
                user_id=user_id,
                organization_id=organization_id,
            )
        )

        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active membership not found.",
            )

        organization = (
            self.repository.get_organization_by_id(
                organization_id
            )
        )

        if (
            organization is None
            or not organization.is_active
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization is unavailable.",
            )

        return membership

    # ========================================================
    # Change Member System Role
    # ========================================================

    def change_member_role(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
        role: str,
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can change member roles."
                ),
            )

        if actor_user_id == target_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "An administrator cannot change "
                    "their own role through this operation."
                ),
            )

        new_role = self._validate_system_role(role)

        if new_role == OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Organization administrator roles "
                    "cannot be assigned through member "
                    "role management."
                ),
            )

        target_membership = (
            self.repository.get_membership_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if target_membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "Target user is not a member "
                    "of this organization."
                ),
            )

        if not target_membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target membership is inactive.",
            )

        self.repository.update_membership_role(
            membership=target_membership,
            role=new_role,
        )

        self.db.commit()
        self.db.refresh(target_membership)

        return target_membership

    # ========================================================
    # Update Employee Responsibilities
    # ========================================================

    def update_employee_responsibilities(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
        is_team_leader: bool | None = None,
        is_reviewer: bool | None = None,
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can update employee responsibilities."
                ),
            )

        employee = (
            self.repository.get_employee_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found.",
            )

        if is_team_leader is not None:
            employee.is_team_leader = is_team_leader

        if is_reviewer is not None:
            employee.is_reviewer = is_reviewer

        self.db.commit()
        self.db.refresh(employee)

        return employee

    # ========================================================
    # Update Employee Project Capacity
    # ========================================================

    def update_employee_project_capacity(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
        max_concurrent_projects: int | None,
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can update project capacity."
                ),
            )

        self._validate_project_limit(
            max_concurrent_projects
        )

        employee = (
            self.repository.get_employee_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found.",
            )

        employee.max_concurrent_projects = (
            max_concurrent_projects
        )

        self.db.commit()
        self.db.refresh(employee)

        return employee

    # ========================================================
    # Update Employee Job Roles
    # ========================================================

    def update_employee_job_roles(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
        job_role_ids: list[int],
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can update employee job roles."
                ),
            )

        employee = (
            self.repository.get_employee_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found.",
            )

        unique_role_ids = list(dict.fromkeys(job_role_ids))

        job_roles = (
            self.repository.get_job_roles_by_ids(
                organization_id=organization_id,
                job_role_ids=unique_role_ids,
            )
        )

        if len(job_roles) != len(unique_role_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "One or more job roles do not "
                    "belong to this organization."
                ),
            )

        self.repository.replace_employee_job_roles(
            employee=employee,
            job_role_ids=unique_role_ids,
        )

        self.db.commit()
        self.db.refresh(employee)

        return employee

    # ========================================================
    # Update Team Leader
    # ========================================================

    def update_employee_team_leader(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
        team_leader_id: int | None,
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can assign team leaders."
                ),
            )

        target_membership = (
            self.repository.get_membership_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if target_membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target employee membership not found.",
            )

        if team_leader_id is not None:

            leader_employee = (
                self.repository.get_employee(
                    user_id=team_leader_id,
                    organization_id=organization_id,
                )
            )

            if leader_employee is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Team leader employee not found.",
                )

            if not leader_employee.is_team_leader:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Selected employee is not a "
                        "team leader."
                    ),
                )

            if team_leader_id == target_user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "An employee cannot be their "
                        "own team leader."
                    ),
                )

        target_membership.team_leader_id = team_leader_id

        self.db.commit()
        self.db.refresh(target_membership)

        return target_membership

    # ========================================================
    # Deactivate Member
    # ========================================================

    def deactivate_member(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can deactivate members."
                ),
            )

        if actor_user_id == target_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "An administrator cannot deactivate "
                    "their own membership."
                ),
            )

        target_membership = (
            self.repository.get_membership_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if target_membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user is not a member of this organization.",
            )

        if not target_membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Membership is already inactive.",
            )

        self.repository.deactivate_membership(
            target_membership
        )

        self.db.commit()
        self.db.refresh(target_membership)

        return target_membership

    # ========================================================
    # Activate Member
    # ========================================================

    def activate_member(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        target_user_id: int,
    ):

        actor_membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if actor_membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not an active member of this organization.",
            )

        if actor_membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can activate members."
                ),
            )

        target_membership = (
            self.repository.get_membership_for_update(
                user_id=target_user_id,
                organization_id=organization_id,
            )
        )

        if target_membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user is not a member of this organization.",
            )

        if target_membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Membership is already active.",
            )

        self.repository.activate_membership(
            target_membership
        )

        self.db.commit()
        self.db.refresh(target_membership)

        return target_membership

    # ========================================================
    # Organization Members
    # ========================================================

    def get_organization_members(
        self,
        *,
        organization_id: int,
        active_only: bool = True,
    ):

        organization = (
            self.repository.get_organization_by_id(
                organization_id
            )
        )

        if organization is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found.",
            )

        if not organization.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization is inactive.",
            )

        if active_only:
            return (
                self.repository
                .get_active_organization_members(
                    organization_id
                )
            )

        return (
            self.repository
            .get_organization_members(
                organization_id
            )
        )

    # ========================================================
    # Organization Job Roles
    # ========================================================

    def create_job_role(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        name: str,
        description: str | None = None,
        tool_ids: list[int] | None = None,
        feature_keys: list[str] | None = None,
    ):
        membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can create job roles."
                ),
            )

        name = name.strip()

        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Job role name cannot be empty.",
            )

        existing_role = (
            self.repository.get_job_role_by_name(
                organization_id=organization_id,
                name=name,
            )
        )

        if existing_role is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Job role '{name}' already exists "
                    "in this organization."
                ),
            )

        # ------------------------------------------------------------
        # Normalize tool IDs
        # ------------------------------------------------------------

        normalized_tool_ids = list(
            dict.fromkeys(tool_ids or [])
        )

        if any(
            not isinstance(tool_id, int) or tool_id <= 0
            for tool_id in normalized_tool_ids
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Tool IDs must be positive integers.",
            )

        # ------------------------------------------------------------
        # Validate organization tools
        # ------------------------------------------------------------

        organization_tools = (
            self.repository.get_organization_tools_by_ids(
                organization_id=organization_id,
                tool_ids=normalized_tool_ids,
            )
        )

        if len(organization_tools) != len(normalized_tool_ids):
            found_tool_ids = {
                tool.id
                for tool in organization_tools
            }

            invalid_tool_ids = [
                tool_id
                for tool_id in normalized_tool_ids
                if tool_id not in found_tool_ids
            ]

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "One or more selected tools are invalid, "
                    "inactive, or do not belong to this organization: "
                    f"{invalid_tool_ids}"
                ),
            )

        # ------------------------------------------------------------
        # Normalize feature keys
        # ------------------------------------------------------------

        normalized_feature_keys = []

        for feature_key in feature_keys or []:
            if not isinstance(feature_key, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Feature keys must be strings.",
                )

            normalized_feature_key = feature_key.strip().lower()

            if normalized_feature_key:
                normalized_feature_keys.append(
                    normalized_feature_key
                )

        normalized_feature_keys = list(
            dict.fromkeys(normalized_feature_keys)
        )

        # ------------------------------------------------------------
        # Validate Cinemor features
        # ------------------------------------------------------------

        valid_feature_keys = {
            feature["key"]
            for feature in CINEMOR_FEATURES
        }

        invalid_feature_keys = [
            feature_key
            for feature_key in normalized_feature_keys
            if feature_key not in valid_feature_keys
        ]

        if invalid_feature_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "One or more selected Cinemor features are invalid: "
                    f"{invalid_feature_keys}"
                ),
            )

        # ------------------------------------------------------------
        # Create role + assignments in one transaction
        # ------------------------------------------------------------

        try:
            job_role = self.repository.create_job_role(
                organization_id=organization_id,
                name=name,
                description=description,
            )

            self.repository.create_job_role_tool_assignments(
                job_role_id=job_role.id,
                tool_ids=normalized_tool_ids,
            )

            self.repository.create_job_role_feature_assignments(
                job_role_id=job_role.id,
                feature_keys=normalized_feature_keys,
            )

            self.db.commit()
            self.db.refresh(job_role)

            return job_role

        except IntegrityError as exc:
            self.db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Unable to create job role '{name}'."
                ),
            ) from exc

    def get_job_roles(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
    ):
        membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        job_roles = self.repository.get_organization_job_roles(
            organization_id=organization_id,
        )

        feature_map = {
            feature["key"]: feature
            for feature in CINEMOR_FEATURES
        }

        response = []

        for job_role in job_roles:
            tools = [
                {
                    "id": assignment.tool.id,
                    "name": assignment.tool.name,
                }
                for assignment in job_role.tool_assignments
                if assignment.tool is not None
            ]

            features = []

            for assignment in job_role.feature_assignments:
                feature = feature_map.get(
                    assignment.feature_key
                )

                if feature is not None:
                    features.append(feature)

            response.append(
                {
                    "id": job_role.id,
                    "organization_id": job_role.organization_id,
                    "name": job_role.name,
                    "description": job_role.description,
                    "created_at": job_role.created_at,
                    "tool_ids": [
                        tool["id"]
                        for tool in tools
                    ],
                    "feature_keys": [
                        feature["key"]
                        for feature in features
                    ],
                    "tools": tools,
                    "features": features,
                }
            )

        return response

    def update_job_role(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        job_role_id: int,
        name: str,
        description: str | None = None,
        tool_ids: list[int] | None = None,
        feature_keys: list[str] | None = None,
    ):
        # ------------------------------------------------------------
        # Authorization
        # ------------------------------------------------------------

        membership = (
            self.repository.get_active_membership(
                user_id=actor_user_id,
                organization_id=organization_id,
            )
        )

        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization.",
            )

        if membership.role != OrganizationRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only organization administrators "
                    "can update job roles."
                ),
            )

        # ------------------------------------------------------------
        # Get Job Role
        # ------------------------------------------------------------

        job_role = (
            self.repository.get_organization_job_role(
                organization_id=organization_id,
                job_role_id=job_role_id,
            )
        )

        if job_role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job role not found in this organization.",
            )

        # ------------------------------------------------------------
        # Validate name
        # ------------------------------------------------------------

        name = name.strip()

        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Job role name cannot be empty.",
            )

        # ------------------------------------------------------------
        # Check duplicate name
        # ------------------------------------------------------------

        existing_role = (
            self.repository.get_job_role_by_name(
                organization_id=organization_id,
                name=name,
            )
        )

        if (
            existing_role is not None
            and existing_role.id != job_role.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Job role '{name}' already exists "
                    "in this organization."
                ),
            )

        # ------------------------------------------------------------
        # Normalize tool IDs
        # ------------------------------------------------------------

        normalized_tool_ids = list(
            dict.fromkeys(tool_ids or [])
        )

        if any(
            not isinstance(tool_id, int) or tool_id <= 0
            for tool_id in normalized_tool_ids
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Tool IDs must be positive integers.",
            )

        # ------------------------------------------------------------
        # Validate organization tools
        # ------------------------------------------------------------

        organization_tools = (
            self.repository.get_organization_tools_by_ids(
                organization_id=organization_id,
                tool_ids=normalized_tool_ids,
            )
        )

        if len(organization_tools) != len(normalized_tool_ids):
            found_tool_ids = {
                tool.id
                for tool in organization_tools
            }

            invalid_tool_ids = [
                tool_id
                for tool_id in normalized_tool_ids
                if tool_id not in found_tool_ids
            ]

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "One or more selected tools are invalid, "
                    "inactive, or do not belong to this organization: "
                    f"{invalid_tool_ids}"
                ),
            )

        # ------------------------------------------------------------
        # Normalize feature keys
        # ------------------------------------------------------------

        normalized_feature_keys = []

        for feature_key in feature_keys or []:
            if not isinstance(feature_key, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Feature keys must be strings.",
                )

            normalized_feature_key = (
                feature_key.strip().lower()
            )

            if normalized_feature_key:
                normalized_feature_keys.append(
                    normalized_feature_key
                )

        normalized_feature_keys = list(
            dict.fromkeys(normalized_feature_keys)
        )

        # ------------------------------------------------------------
        # Validate Cinemor features
        # ------------------------------------------------------------

        valid_feature_keys = {
            feature["key"]
            for feature in CINEMOR_FEATURES
        }

        invalid_feature_keys = [
            feature_key
            for feature_key in normalized_feature_keys
            if feature_key not in valid_feature_keys
        ]

        if invalid_feature_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "One or more selected Cinemor features "
                    "are invalid: "
                    f"{invalid_feature_keys}"
                ),
            )

        # ------------------------------------------------------------
        # Update role + assignments
        # ------------------------------------------------------------

        try:
            job_role.name = name
            job_role.description = description

            self.repository.replace_job_role_tool_assignments(
                job_role_id=job_role.id,
                tool_ids=normalized_tool_ids,
            )

            self.repository.replace_job_role_feature_assignments(
                job_role_id=job_role.id,
                feature_keys=normalized_feature_keys,
            )

            self.db.commit()
            self.db.refresh(job_role)

            return job_role

        except IntegrityError as exc:
            self.db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Unable to update job role '{name}'."
                ),
            ) from exc
            
    
    def get_employee_invitations(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
    ) -> list[dict[str, Any]]:
        membership = self.get_user_membership(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        if membership.role.value != "organization_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization administrators can view invitations.",
            )

        invitations = self.repository.get_pending_employee_invitations(
            organization_id=organization_id,
        )

        return [
            {
                "id": invitation.id,
                "organization_id": invitation.organization_id,
                "email": invitation.email,
                "job_role_id": invitation.job_role_id,
                "system_role": invitation.system_role,
                "expires_at": invitation.expires_at,
            }
            for invitation in invitations
        ]


    def revoke_employee_invitation(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        invitation_id: int,
    ) -> dict[str, Any]:
        membership = self.get_user_membership(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        if membership.role.value != "organization_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization administrators can revoke invitations.",
            )

        invitation = self.repository.get_invitation_by_id_for_update(
            organization_id=organization_id,
            invitation_id=invitation_id,
        )

        if invitation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found.",
            )

        if invitation.is_accepted:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An accepted invitation cannot be revoked.",
            )

        if invitation.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This invitation has already been revoked.",
            )

        try:
            invitation_id = invitation.id
            self.repository.delete_employee_invitation(
                invitation=invitation,
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return {
            "message": "Employee invitation revoked and deleted successfully.",
            "invitation_id": invitation.id,
        }
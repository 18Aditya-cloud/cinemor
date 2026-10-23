from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database.session import get_db
from app.models.membership import (
    OrganizationMembership,
    OrganizationRole,
)
from app.models.user import User
from app.repositories.auth_repository import AuthRepository


# ============================================================
# HTTP Bearer Authentication
# ============================================================

bearer_scheme = HTTPBearer(
    auto_error=False,
)


# ============================================================
# Authentication Errors
# ============================================================

def unauthorized_exception() -> HTTPException:
    """
    Return the standard authentication failure response.

    A generic message prevents leaking whether a token, user,
    or account state was the reason for authentication failure.
    """

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )


# ============================================================
# Current User + Verified Token Payload
# ============================================================

def get_current_user_and_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    db: Annotated[
        Session,
        Depends(get_db),
    ],
) -> tuple[User, dict]:
    """
    Authenticate the request and return:

        (current_user, verified_token_payload)

    Security rules:

    1. Authorization header must contain Bearer token.
    2. JWT signature must be valid.
    3. JWT must use RS256.
    4. JWT must not be expired.
    5. JWT must be an access token.
    6. JWT must contain required claims.
    7. User must exist in the database.
    8. User must still be active.
    9. JWT claims are NOT treated as the database source of truth.
    """

    if credentials is None:
        raise unauthorized_exception()

    if credentials.scheme.lower() != "bearer":
        raise unauthorized_exception()

    token = credentials.credentials.strip()

    if not token:
        raise unauthorized_exception()

    # --------------------------------------------------------
    # Verify JWT cryptographically
    # --------------------------------------------------------

    try:
        payload = decode_access_token(token)

    except Exception:
        raise unauthorized_exception()

    # --------------------------------------------------------
    # Token type
    # --------------------------------------------------------

    if payload.get("type") != "access":
        raise unauthorized_exception()

    # --------------------------------------------------------
    # Subject
    # --------------------------------------------------------

    subject = payload.get("sub")

    if not isinstance(subject, str):
        raise unauthorized_exception()

    try:
        user_id = int(subject)

    except (TypeError, ValueError):
        raise unauthorized_exception()

    if user_id <= 0:
        raise unauthorized_exception()

    # --------------------------------------------------------
    # Database user lookup
    # --------------------------------------------------------

    repository = AuthRepository(db)

    user = repository.get_user_by_id(
        user_id
    )

    if user is None:
        raise unauthorized_exception()

    # --------------------------------------------------------
    # Current account status
    # --------------------------------------------------------

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    return user, payload


# ============================================================
# Current User
# ============================================================

def get_current_user(
    authenticated: Annotated[
        tuple[User, dict],
        Depends(get_current_user_and_token),
    ],
) -> User:
    """
    Return the authenticated database user.
    """

    user, _ = authenticated

    return user


# ============================================================
# Current Token Payload
# ============================================================

def get_current_token_payload(
    authenticated: Annotated[
        tuple[User, dict],
        Depends(get_current_user_and_token),
    ],
) -> dict:
    """
    Return the cryptographically verified JWT payload.
    """

    _, payload = authenticated

    return payload


# ============================================================
# Current Organization Membership
# ============================================================

def get_current_membership(
    authenticated: Annotated[
        tuple[User, dict],
        Depends(get_current_user_and_token),
    ],
    db: Annotated[
        Session,
        Depends(get_db),
    ],
) -> OrganizationMembership:
    """
    Resolve the authenticated user's organization membership.

    The organization_id comes from the verified JWT only as a
    routing/context hint.

    The actual authorization decision is made by querying the
    database.

    The role stored in PostgreSQL is authoritative.

    This prevents an attacker from modifying the JWT role claim
    and escalating privileges.
    """

    user, payload = authenticated

    organization_id = payload.get(
        "organization_id"
    )

    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization context is required.",
        )

    try:
        organization_id = int(
            organization_id
        )

    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid organization context.",
        )

    if organization_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid organization context.",
        )

    repository = AuthRepository(db)

    membership = repository.get_active_membership(
        user_id=user.id,
        organization_id=organization_id,
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization.",
        )

    return membership


# ============================================================
# Organization Administrator
# ============================================================

def require_organization_admin(
    membership: Annotated[
        OrganizationMembership,
        Depends(get_current_membership),
    ],
) -> OrganizationMembership:
    """
    Require organization administrator privileges.

    Role is read from the database membership, NOT from the JWT.
    """

    if membership.role != OrganizationRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization administrator privileges required.",
        )

    return membership


# ============================================================
# Team Leader
# ============================================================

def require_team_leader(
    membership: Annotated[
        OrganizationMembership,
        Depends(get_current_membership),
    ],
    db: Annotated[
        Session,
        Depends(get_db),
    ],
) -> OrganizationMembership:
    """
    Require Team Leader privileges.

    Organization administrators are automatically allowed.

    For employees, Team Leader status is determined by:

        Employee.is_team_leader == True

    Team Leader is NOT an OrganizationMembership role.
    """

    # --------------------------------------------------------
    # Organization Admin
    # --------------------------------------------------------

    if membership.role == OrganizationRole.ADMIN:
        return membership

    # --------------------------------------------------------
    # Employee must be marked as Team Leader
    # --------------------------------------------------------

    repository = AuthRepository(db)

    employee = repository.get_employee(
        organization_id=membership.organization_id,
        user_id=membership.user_id,
    )

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee profile not found.",
        )

    if not employee.is_team_leader:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team leader privileges required.",
        )

    return membership

# ============================================================
# Organization Member
# ============================================================

def require_organization_member(
    membership: Annotated[
        OrganizationMembership,
        Depends(get_current_membership),
    ],
) -> OrganizationMembership:
    """
    Require an active organization membership.

    Admin, team leader, and employee are allowed.
    """

    if not membership.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization membership is inactive.",
        )

    return membership


# ============================================================
# Type Aliases
# ============================================================

CurrentUser = Annotated[
    User,
    Depends(get_current_user),
]

CurrentMembership = Annotated[
    OrganizationMembership,
    Depends(get_current_membership),
]

OrganizationAdmin = Annotated[
    OrganizationMembership,
    Depends(require_organization_admin),
]

TeamLeader = Annotated[
    OrganizationMembership,
    Depends(require_team_leader),
]

OrganizationMember = Annotated[
    OrganizationMembership,
    Depends(require_organization_member),
]
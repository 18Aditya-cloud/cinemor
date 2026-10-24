"""
Frontend-safe serialization for authentication objects.

Several auth endpoints historically returned raw ORM rows, which exposed
`password_hash` (on User) and `token_hash` (on refresh sessions) to the
browser. These helpers return only fields that are safe to send to clients.
"""

from __future__ import annotations

from typing import Any


def safe_user(user: Any) -> dict | None:
    if user is None:
        return None
    account_type = getattr(user, "account_type", None)
    return {
        "id": user.id,
        "email": user.email,
        "display_name": getattr(user, "display_name", None),
        "account_type": account_type.value if account_type is not None else None,
        "is_active": user.is_active,
        "is_email_verified": getattr(user, "is_email_verified", None),
    }


def safe_membership(membership: Any) -> dict | None:
    if membership is None:
        return None
    role = getattr(membership, "role", None)
    return {
        "id": membership.id,
        "organization_id": membership.organization_id,
        "user_id": membership.user_id,
        "role": role.value if hasattr(role, "value") else role,
        "team_leader_id": getattr(membership, "team_leader_id", None),
        "is_active": membership.is_active,
        "joined_at": getattr(membership, "joined_at", None),
        "updated_at": getattr(membership, "updated_at", None),
    }


def safe_organization(organization: Any) -> dict | None:
    if organization is None:
        return None
    return {
        "id": organization.id,
        "name": getattr(organization, "name", None),
        "is_active": getattr(organization, "is_active", None),
    }


def safe_employee_row(employee: Any) -> dict:
    """Safe view of an Employee ORM row (used by team-leader / reviewer /
    employee-search lists). Never exposes the related user's password_hash."""
    user = getattr(employee, "user", None)
    return {
        "employee_id": employee.id,
        "user_id": employee.user_id,
        "organization_id": employee.organization_id,
        "email": getattr(user, "email", None),
        "display_name": getattr(user, "display_name", None),
        "is_team_leader": bool(getattr(employee, "is_team_leader", False)),
        "is_reviewer": bool(getattr(employee, "is_reviewer", False)),
        "max_concurrent_projects": getattr(employee, "max_concurrent_projects", None),
    }


def safe_employee_rows(employees: Any) -> list[dict]:
    return [safe_employee_row(e) for e in (employees or [])]


def safe_auth_result(result: dict) -> dict:
    """
    Sanitize the dict returned by AuthService login/register/refresh/accept
    flows: keep the access token, drop the raw refresh session, and reduce
    user/membership/organization to safe fields.
    """
    out: dict = {}
    if "access_token" in result:
        out["access_token"] = result["access_token"]
        out["token_type"] = "bearer"
    if "user" in result:
        out["user"] = safe_user(result["user"])
    if "membership" in result:
        out["membership"] = safe_membership(result["membership"])
    if "organization" in result:
        out["organization"] = safe_organization(result["organization"])
    if "employee" in result and result["employee"] is not None:
        emp = result["employee"]
        out["employee"] = {
            "id": emp.id,
            "organization_id": emp.organization_id,
            "user_id": emp.user_id,
            "is_team_leader": bool(getattr(emp, "is_team_leader", False)),
            "is_reviewer": bool(getattr(emp, "is_reviewer", False)),
        }
    # Deliberately omit: refresh_token (set as cookie by the route),
    # refresh_session (contains token_hash), employee_job_role internals.
    return out

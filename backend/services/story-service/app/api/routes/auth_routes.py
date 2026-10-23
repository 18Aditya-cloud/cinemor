from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    CurrentUser,
    OrganizationAdmin,
)
from app.core.config import settings
from app.database.session import get_db
from app.schemas.auth import (
    AcceptEmployeeInvitationRequest,
    AccountTypeRequest,
    EmployeeInvitationRequest,
    IndividualRegisterRequest,
    JobRoleCreateRequest,
    JobRoleUpdateRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    LoginRequest,
    OrganizationRegisterRequest,
    SupabaseOAuthRequest,
)
from app.services.auth_service import AuthService
from app.repositories.auth_repository import AuthRepository
from app.models.employee import Employee
from app.services.email_service import send_invitation_email
from app.constants.cinemor_features import CINEMOR_FEATURES

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


# ============================================================
# Cookie Helpers
# ============================================================

def _set_refresh_cookie(
    response: Response,
    refresh_token: str,
) -> None:
    """
    Store refresh token inside an HTTP-only cookie.
    """

    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=(
            settings.REFRESH_TOKEN_EXPIRE_DAYS
            * 24
            * 60
            * 60
        ),
        httponly=settings.REFRESH_COOKIE_HTTP_ONLY,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAME_SITE,
        path=getattr(
            settings,
            "REFRESH_COOKIE_PATH",
            "/api/auth",
        ),
    )


def _clear_refresh_cookie(
    response: Response,
) -> None:
    """
    Remove refresh token cookie.
    """

    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        httponly=settings.REFRESH_COOKIE_HTTP_ONLY,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAME_SITE,
        path=getattr(
            settings,
            "REFRESH_COOKIE_PATH",
            "/api/auth",
        ),
    )


# ============================================================
# Individual Registration
# ============================================================

@router.post(
    "/register/individual",
    status_code=status.HTTP_201_CREATED,
)
def register_individual(
    request: IndividualRegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Register an individual Cinemor account.

    Request:

        email
        password
        confirm_password
    """

    service = AuthService(db)

    return service.register_individual(
        email=request.email,
        password=request.password,
        confirm_password=request.confirm_password,
    )


# ============================================================
# Organization Registration
# ============================================================

@router.post(
    "/register/organization",
    status_code=status.HTTP_201_CREATED,
)
def register_organization(
    request: OrganizationRegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Register an organization account.

    Request:

        email
        password
        confirm_password

    The first user becomes the organization administrator.
    """

    service = AuthService(db)

    user, organization, membership = service.register_organization(
        email=request.email,
        password=request.password,
        confirm_password=request.confirm_password,
    )

    return {
        "message": "Organization account created successfully.",
        "user": user,
        "organization": organization,
        "membership": membership,
    }


# ============================================================
# Login
# ============================================================

@router.post(
    "/login",
)
def login(
    request: LoginRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Authenticate using email + password.

    The access token is returned in the response.

    The refresh token is stored inside an HTTP-only cookie.
    """

    service = AuthService(db)

    result = service.login(
        email=request.email,
        password=request.password,
        user_agent=http_request.headers.get(
            "user-agent"
        ),
        ip_address=(
            http_request.client.host
            if http_request.client
            else None
        ),
    )

    refresh_token = result.pop(
        "refresh_token"
    )

    # Do not expose refresh token to frontend JS.
    _set_refresh_cookie(
        response,
        refresh_token,
    )

    return result


# ============================================================
# Supabase Google OAuth
# ============================================================

@router.post(
    "/oauth/supabase",
)
def login_with_supabase(
    request: SupabaseOAuthRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Exchange a verified Supabase Google OAuth session for a
    Cinemor authentication session.

    Flow:

        Google
            -> Supabase OAuth
            -> frontend receives Supabase access token
            -> this endpoint
            -> backend validates token with Supabase
            -> Cinemor user is created/found
            -> Cinemor access token is returned
            -> Cinemor refresh token is stored in an HTTP-only cookie

    The Supabase access token is never used directly to access
    protected Cinemor APIs. Cinemor APIs continue to require
    the Cinemor JWT.
    """

    service = AuthService(db)

    result = service.login_with_supabase(
        access_token=request.access_token,
        user_agent=http_request.headers.get("user-agent"),
        ip_address=(
            http_request.client.host
            if http_request.client
            else None
        ),
    )

    refresh_token = result.pop("refresh_token")

    # Never expose the refresh token to frontend JavaScript.
    _set_refresh_cookie(
        response,
        refresh_token,
    )

    return result


# ============================================================
# Account Type Selection
# ============================================================

@router.post(
    "/account-type",
)
def set_account_type(
    request: AccountTypeRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Set the authenticated user's account type during onboarding.

    Supported account types:

        individual
            -> saves users.account_type = "individual"

        organization
            -> saves users.account_type = "organization"
            -> creates an Organization
            -> creates an organization_admin membership

    Account type can only be selected once.
    """

    service = AuthService(db)

    result = service.set_account_type(
        user_id=current_user.id,
        account_type=request.account_type,
    )

    return {
        "message": "Account type selected successfully.",
        "user": result["user"],
        "organization": result["organization"],
        "membership": result["membership"],
    }

@router.post(
    "/forgot-password",
)
def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    service = AuthService(db)

    return service.forgot_password(
        email=request.email,
    )


@router.post(
    "/reset-password",
)
def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    service = AuthService(db)

    return service.reset_password(
        token=request.token,
        new_password=request.new_password,
        confirm_password=request.confirm_password,
    )

# ============================================================
# Organization Job Roles
# ============================================================

@router.post(
    "/organizations/{organization_id}/job-roles",
    status_code=status.HTTP_201_CREATED,
)
def create_job_role(
    organization_id: int,
    request: JobRoleCreateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Create an organization-specific production/job role.

    Organization administrators can configure:

        - job role name
        - description
        - organization tools
        - Cinemor platform features
    """

    service = AuthService(db)

    return service.create_job_role(
        actor_user_id=current_user.id,
        organization_id=organization_id,
        name=request.name,
        description=request.description,
        tool_ids=request.tool_ids,
        feature_keys=request.feature_keys,
    )

@router.get(
    "/organizations/{organization_id}/job-roles",
)
def get_job_roles(
    organization_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Return active production/job roles for an organization.

    Organization members can view the roles.
    """

    service = AuthService(db)

    return service.get_job_roles(
        actor_user_id=current_user.id,
        organization_id=organization_id,
    )

@router.put(
    "/organizations/{organization_id}/job-roles/{job_role_id}",
)
def update_job_role(
    organization_id: int,
    job_role_id: int,
    request: JobRoleUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Update an organization job role.

    Organization administrators can update:

        - job role name
        - description
        - assigned organization tools
        - assigned Cinemor platform features

    The submitted tool_ids and feature_keys represent
    the complete final assignment state.

    Therefore:

        selected -> assigned
        unselected -> removed
    """

    service = AuthService(db)

    return service.update_job_role(
        actor_user_id=current_user.id,
        organization_id=organization_id,
        job_role_id=job_role_id,
        name=request.name,
        description=request.description,
        tool_ids=request.tool_ids,
        feature_keys=request.feature_keys,
    )

# ============================================================
# Cinemor Job Role Features
# ============================================================

@router.get(
    "/organizations/{organization_id}/job-role-features",
)
def get_job_role_features(
    organization_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Return the complete hardcoded Cinemor feature catalog.

    Features are platform-defined and cannot be created,
    edited, or deleted by organization administrators.
    """

    service = AuthService(db)

    # Verify that the user belongs to the organization.
    membership = service.repository.get_active_membership(
        user_id=current_user.id,
        organization_id=organization_id,
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization.",
        )

    return CINEMOR_FEATURES

# ============================================================
# Employee Invitation
# ============================================================

@router.post(
    "/organizations/{organization_id}/employees/invite",
    status_code=status.HTTP_201_CREATED,
)
def invite_employee(
    organization_id: int,
    request: EmployeeInvitationRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Organization administrator invites an employee.

    Admin selects:

        - employee email
        - job role
        - system role
        - maximum concurrent projects

    Reviewer and team leader are NOT assigned during
    invitation.

    They are assigned later through member management APIs.
    """

    service = AuthService(db)

    # ========================================================
    # Authorization
    # ========================================================

    membership = service.get_user_membership(
        user_id=current_user.id,
        organization_id=organization_id,
    )

    if membership.role.value != "organization_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only organization administrators "
                "can invite employees."
            ),
        )

    # ========================================================
    # Create Invitation
    # ========================================================

    invitation, raw_token = service.invite_employee(
        organization_id=organization_id,
        email=request.email,
        job_role_id=request.job_role_id,
        system_role=request.system_role,
        max_concurrent_projects=(
            request.max_concurrent_projects
        ),
    )
    invitation_link = (
        f"http://localhost:5173/accept-invitation?token={raw_token}"
    )

    send_invitation_email(
        to_email=request.email,
        invitation_link=invitation_link,
    )

    # ========================================================
    # Temporary Testing Response
    # ========================================================

    return {
        "message": (
            "Employee invitation created successfully."
        ),
        "invitation": invitation,
        "invitation_token": raw_token,
    }

# ============================================================
# Accept Employee Invitation
# ============================================================

@router.post(
    "/invitations/accept",
    status_code=status.HTTP_201_CREATED,
)
def accept_employee_invitation(
    request: AcceptEmployeeInvitationRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Employee accepts an invitation.

    The employee provides:

        invitation token
        password
        confirm password

    The invitation already contains:

        email
        organization
        system role
        job role
        project limit
        reviewer
        team leader

    The backend creates:

        User
        OrganizationMembership

    and automatically logs the employee in by returning
    an access token and setting the refresh-token cookie.
    """

    service = AuthService(db)

    result = service.accept_employee_invitation(
        token=request.token,
        password=request.password,
        confirm_password=request.confirm_password,
    )

    refresh_token = result.pop("refresh_token")

    _set_refresh_cookie(
        response,
        refresh_token,
    )

    return result

# ============================================================
# Refresh Access Token
# ============================================================

@router.post(
    "/refresh",
)
def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Rotate refresh token and issue a new access token.
    """

    refresh_token = request.cookies.get(
        settings.REFRESH_COOKIE_NAME
    )

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing.",
        )

    service = AuthService(db)

    result = service.refresh_access_token(
        refresh_token=refresh_token,
        user_agent=request.headers.get(
            "user-agent"
        ),
        ip_address=(
            request.client.host
            if request.client
            else None
        ),
    )

    new_refresh_token = result.pop(
        "refresh_token"
    )

    _set_refresh_cookie(
        response,
        new_refresh_token,
    )

    return result


# ============================================================
# Logout
# ============================================================

@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Revoke current refresh-token session.
    """

    refresh_token = request.cookies.get(
        settings.REFRESH_COOKIE_NAME
    )

    service = AuthService(db)

    service.logout(
        refresh_token=refresh_token or "",
    )

    _clear_refresh_cookie(response)

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )


# ============================================================
# Logout All Devices
# ============================================================

@router.post(
    "/logout-all",
)
def logout_all(
    current_user: CurrentUser,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Revoke all refresh sessions for the current user.
    """

    service = AuthService(db)

    service.logout_all(
        user_id=current_user.id,
    )

    _clear_refresh_cookie(response)

    return {
        "message": "All sessions logged out."
    }


# ============================================================
# Current User
# ============================================================

# ============================================================
# Current User
# ============================================================

@router.get(
    "/me",
)
def get_current_user_profile(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Return the authenticated user's frontend-safe application context.

    Routing hierarchy:

        organization_admin
            -> Organization Dashboard

        employee + is_team_leader=True
            -> Team Leader Dashboard

        employee
            -> Employee Dashboard

        no organization membership
            -> Individual User Dashboard

    Important:
        Team Leader is NOT a separate OrganizationMembership role.
        It is an Employee responsibility stored in
        Employee.is_team_leader.
    """

    auth_repository = AuthRepository(db)

    # ------------------------------------------------------------
    # Resolve active organization membership
    # ------------------------------------------------------------

    memberships = auth_repository.get_active_user_memberships(
        current_user.id
    )

    membership = None
    organization_id = None
    system_role = None

    # Current authentication flow expects one active membership.
    if len(memberships) == 1:
        membership = memberships[0]
        organization_id = membership.organization_id
        system_role = membership.role.value

    # ------------------------------------------------------------
    # Resolve employee responsibilities
    # ------------------------------------------------------------

    employee = None
    is_employee = False
    is_team_leader = False
    is_reviewer = False

    if membership is not None:
        employee = (
            db.query(Employee)
            .filter(
                Employee.user_id == current_user.id,
                Employee.organization_id == organization_id,
            )
            .first()
        )

        if employee is not None:
            is_employee = True
            is_team_leader = bool(employee.is_team_leader)
            is_reviewer = bool(employee.is_reviewer)

    # ------------------------------------------------------------
    # Resolve account type
    # ------------------------------------------------------------
    #
    # Account type is selected during onboarding and persisted on
    # users.account_type. Do not infer it from membership because
    # a newly authenticated user may not have selected a type yet.
    #
    account_type = (
        current_user.account_type.value
        if current_user.account_type is not None
        else None
    )

    # Existing employee accounts created through invitations may
    # predate account_type persistence. Preserve their application
    # classification when account_type is not yet populated.
    if account_type is None and is_employee:
        account_type = "employee"

    # ------------------------------------------------------------
    # Frontend-safe user object
    # ------------------------------------------------------------
    #
    # NEVER return password_hash or other authentication internals.
    #

    safe_user = {
        "id": current_user.id,
        "email": current_user.email,
        "is_active": current_user.is_active,
        "is_email_verified": current_user.is_email_verified,
    }

    # ------------------------------------------------------------
    # Frontend-safe membership object
    # ------------------------------------------------------------

    safe_membership = None

    if membership is not None:
        safe_membership = {
            "id": membership.id,
            "organization_id": membership.organization_id,
            "user_id": membership.user_id,
            "role": membership.role.value,
            "team_leader_id": membership.team_leader_id,
            "is_active": membership.is_active,
            "joined_at": membership.joined_at,
            "updated_at": membership.updated_at,
        }

    organization = None
    organization_name = None

    if organization_id is not None:
        organization = (
            auth_repository.get_organization_by_id(
                organization_id
            )
        )

    if organization is not None:
        organization_name = organization.name
    # ------------------------------------------------------------
    # Return application authentication context
    # ------------------------------------------------------------

    return {
        "user": safe_user,

        # Organization/system context
        "role": system_role,
        "organization_id": organization_id,
        "organization_name": organization_name,

        # Account classification
        "account_type": account_type,

        # Employee responsibilities
        "is_employee": is_employee,
        "is_team_leader": is_team_leader,
        "is_reviewer": is_reviewer,

        # Safe membership information
        "membership": safe_membership,
    }
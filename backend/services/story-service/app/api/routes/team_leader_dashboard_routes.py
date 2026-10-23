from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db

from app.models.project import ProjectStatus

from app.schemas.team_leader_dashboard import (
    TeamLeaderDashboardResponse,
    TeamLeaderProjectsResponse,
    TeamLeaderProjectResponse,
    TeamLeaderProjectMemberResponse,
    TeamLeaderEmployeeResponse,
    TeamLeaderAssignEmployeeRequest,
    TeamLeaderAssignReviewerRequest,
    TeamLeaderEmployeeJobRolesRequest,
    TeamLeaderProjectStatusUpdateRequest,
)

from app.services.team_leader_dashboard_service import (
    TeamLeaderDashboardService,
)


# ============================================================
# Router
# ============================================================

router = APIRouter(
    prefix="/api/team-leaders/{team_leader_id}",
    tags=["Team Leader Dashboard"],
)


# ============================================================
# Exception Helper
# ============================================================

def _service_error(exc: Exception) -> HTTPException:
    """
    Convert service-layer exceptions into HTTP responses.
    """

    if isinstance(exc, PermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )

    if isinstance(exc, ValueError):

        not_found_messages = {
            "Project not found.",
            "Project not found or it is not assigned to you.",
            "Employee not found.",
            "Reviewer not found.",
            "Project member not found.",
            "Job role not found.",
            "Team leader not found.",
        }

        if str(exc) in not_found_messages:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            )

        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(exc),
    )


# ============================================================
# Authentication / Identity Guard
# ============================================================

def _validate_team_leader_identity(
    *,
    team_leader_id: int,
    current_user: CurrentUser,
) -> None:
    """
    The Team Leader ID in the URL must belong to the
    authenticated user.

    Organization ID is intentionally not accepted by
    Team Leader APIs.
    """

    if current_user.id != team_leader_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can only access your own team leader dashboard."
            ),
        )


# ============================================================
# DASHBOARD
# ============================================================

@router.get(
    "/dashboard",
    response_model=TeamLeaderDashboardResponse,
)
def get_team_leader_dashboard(
    team_leader_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get the Team Leader dashboard.

    Organization is resolved internally from the Team Leader.
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.get_dashboard(
            team_leader_id=team_leader_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# PROJECT LIST
# ============================================================

@router.get(
    "/projects",
    response_model=TeamLeaderProjectsResponse,
)
def get_team_leader_projects(
    team_leader_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    status_filter: ProjectStatus | None = Query(
        default=None,
        alias="status",
    ),
    db: Session = Depends(get_db),
):
    """
    Get projects assigned to this Team Leader.

    Optional:
        search
        status
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        projects = service.get_projects(
            team_leader_id=team_leader_id,
            search=search,
            status=status_filter,
        )

        return {
            "projects": projects,
            "total": len(projects),
        }

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# PROJECT DETAILS
# ============================================================

@router.get(
    "/projects/{project_id}",
    response_model=TeamLeaderProjectResponse,
)
def get_team_leader_project(
    team_leader_id: int,
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get one project assigned to the Team Leader.
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.get_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# PROJECT MEMBERS
# ============================================================

@router.get(
    "/projects/{project_id}/members",
    response_model=list[TeamLeaderProjectMemberResponse],
)
def get_project_members(
    team_leader_id: int,
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get all members assigned to a Team Leader's project.
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.get_project_members(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# AVAILABLE EMPLOYEES
# ============================================================

@router.get(
    "/available-employees",
    response_model=list[TeamLeaderEmployeeResponse],
)
def get_available_employees(
    team_leader_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    job_role_id: int | None = Query(
        default=None,
        gt=0,
    ),
    project_id: int | None = Query(
        default=None,
        gt=0,
    ),
    db: Session = Depends(get_db),
):
    """
    Get all available employees in the Team Leader's
    organization.

    This endpoint is NOT project-specific.

    Optional filters:
        search
        job_role_id

    Returned employees:
        - belong to the same organization
        - are active
        - are not the Team Leader
        - have available project capacity
        - optionally have the requested job role
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.get_available_employees(
            team_leader_id=team_leader_id,
            search=search,
            job_role_id=job_role_id,
            project_id=project_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# AVAILABLE REVIEWERS
# ============================================================

@router.get(
    "/available-reviewers",
    response_model=list[TeamLeaderEmployeeResponse],
)
def get_available_reviewers(
    team_leader_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    project_id: int | None = Query(
        default=None,
        gt=0,
    ),
    db: Session = Depends(get_db),
):
    """
    Get all available reviewers in the Team Leader's
    organization.

    This endpoint is NOT project-specific.

    No job_role_id is required.

    A person is considered a reviewer when:
        employee.is_reviewer == True
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.get_available_reviewers(
            team_leader_id=team_leader_id,
            search=search,
            project_id=project_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# ASSIGN EMPLOYEE
# ============================================================

@router.post(
    "/projects/{project_id}/employees/{employee_user_id}",
    response_model=TeamLeaderProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_employee(
    team_leader_id: int,
    project_id: int,
    employee_user_id: int,
    request: TeamLeaderAssignEmployeeRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Assign an employee to a project.

    employee_user_id is already in the URL.

    The request body only contains job_role_id because
    the Team Leader must choose which of the employee's
    organization job roles they will perform on this project.
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.assign_employee(
            team_leader_id=team_leader_id,
            project_id=project_id,
            employee_user_id=employee_user_id,
            job_role_id=request.job_role_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

@router.put(
    "/projects/{project_id}/employees/{employee_user_id}/job-roles",
    response_model=TeamLeaderProjectResponse,
)
def set_employee_job_roles(
    team_leader_id: int,
    project_id: int,
    employee_user_id: int,
    request: TeamLeaderEmployeeJobRolesRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Add an employee with one or more of their job roles, or change them."""

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.set_employee_job_roles(
            team_leader_id=team_leader_id,
            project_id=project_id,
            employee_user_id=employee_user_id,
            job_role_ids=request.job_role_ids,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

# ============================================================
# ASSIGN REVIEWER
# ============================================================

@router.post(
    "/projects/{project_id}/reviewers/{reviewer_user_id}",
    response_model=TeamLeaderProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_reviewer(
    team_leader_id: int,
    project_id: int,
    reviewer_user_id: int,
    request: TeamLeaderAssignReviewerRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Assign a reviewer to a project for a specific reviewer job role.

    reviewer_user_id is already in the URL.

    The request body contains job_role_id.

    The selected job role must be one of the reviewer job roles
    configured for that employee.
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.assign_reviewer(
            team_leader_id=team_leader_id,
            project_id=project_id,
            reviewer_user_id=reviewer_user_id,
            job_role_id=request.job_role_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# REMOVE PROJECT MEMBER
# ============================================================

@router.delete(
    "/projects/{project_id}/members/{member_id}",
)
def remove_project_member(
    team_leader_id: int,
    project_id: int,
    member_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.remove_member(
            team_leader_id=team_leader_id,
            project_id=project_id,
            member_id=member_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# PROJECT STATUS
# ============================================================

@router.patch(
    "/projects/{project_id}/status",
    response_model=TeamLeaderProjectResponse,
)
def update_project_status(
    team_leader_id: int,
    project_id: int,
    request: TeamLeaderProjectStatusUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Update project status.

    Supported transitions are enforced by the service.
    """

    _validate_team_leader_identity(
        team_leader_id=team_leader_id,
        current_user=current_user,
    )

    service = TeamLeaderDashboardService(db)

    try:
        return service.update_project_status(
            team_leader_id=team_leader_id,
            project_id=project_id,
            new_status=request.status,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc
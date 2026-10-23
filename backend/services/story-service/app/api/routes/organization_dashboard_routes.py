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

from app.schemas.client import (
    ClientCreateRequest,
    ClientResponse,
    ClientUpdateRequest,
)

from app.schemas.organization_dashboard import (
    OrganizationDashboardResponse,
    OrganizationEmployeesResponse,
    EmployeeProjectCapacityUpdateRequest,
    EmployeeResponsibilitiesUpdateRequest,
    EmployeeJobRoleAssignRequest,
)

from app.schemas.project import (
    ProjectCreateRequest,
    ProjectResponse,
    ProjectUpdateRequest,
)

from app.services.client_service import ClientService
from app.services.organization_dashboard_service import (
    OrganizationDashboardService,
)
from app.services.project_service import ProjectService
from app.services import employee_removal_service

from app.schemas.organization_tool import (
    OrganizationToolCreateRequest,
    OrganizationToolUpdateRequest,
)

from app.services.organization_tool_service import (
    OrganizationToolService,
)

from app.schemas.organization_profile import (
    OrganizationProfileResponse,
    OrganizationProfileUpdateRequest,
    ChangePasswordRequest,
)


# ============================================================
# Router
# ============================================================

router = APIRouter(
    prefix="/api/organizations/{organization_id}",
    tags=["Organization Dashboard"],
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
            "Organization not found.",
            "Client not found.",
            "Project not found.",
            "Employee not found.",
            "Project member not found.",
            "Team leader not found.",
            "Reviewer not found.",
            "Job role not found.",
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
# ORGANIZATION DASHBOARD
# ============================================================


@router.get(
    "/dashboard",
    response_model=OrganizationDashboardResponse,
)
def get_organization_dashboard(
    organization_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Return organization dashboard statistics.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.get_dashboard(
            user_id=current_user.id,
            organization_id=organization_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

@router.get(
    "/profile",
    response_model=OrganizationProfileResponse,
)
def get_organization_profile(
    organization_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = OrganizationDashboardService(db)

    try:
        service._require_admin(
            user_id=current_user.id,
            organization_id=organization_id,
        )

        organization = (
            service.auth_repository.get_organization_by_id(
                organization_id,
            )
        )

        if organization is None:
            raise ValueError(
                "Organization not found."
            )

        return organization

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


@router.patch(
    "/profile",
    response_model=OrganizationProfileResponse,
)
def update_organization_profile(
    organization_id: int,
    request: OrganizationProfileUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = OrganizationDashboardService(db)

    try:
        return service.update_organization_profile(
            user_id=current_user.id,
            organization_id=organization_id,
            name=request.name,
            business_type=request.business_type,
            official_address=request.official_address,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

@router.patch(
    "/profile/password",
)
def change_organization_admin_password(
    organization_id: int,
    request: ChangePasswordRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = OrganizationDashboardService(db)

    try:
        return service.change_organization_admin_password(
            user_id=current_user.id,
            organization_id=organization_id,
            new_password=request.new_password,
            confirm_password=request.confirm_password,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

# ============================================================
# EMPLOYEE MANAGEMENT
# ============================================================


@router.get(
    "/employees",
    response_model=OrganizationEmployeesResponse,
)
def get_organization_employees(
    organization_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Return accepted employees and pending invitations.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.get_employees(
            user_id=current_user.id,
            organization_id=organization_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Search Employees
# ============================================================


@router.get(
    "/employees/search",
)
def search_employees(
    organization_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    job_role_id: int | None = Query(
        default=None,
        gt=0,
    ),
    db: Session = Depends(get_db),
):
    """
    Search organization employees.

    Optional filters:

        search:
            Employee email/name search.

        job_role_id:
            Filter employees by assigned job role.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.search_employees(
            user_id=current_user.id,
            organization_id=organization_id,
            search=search,
            job_role_id=job_role_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Team Leaders
# ============================================================


@router.get(
    "/team-leaders",
)
def get_team_leaders(
    organization_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    db: Session = Depends(get_db),
):
    """
    Return employees currently assigned as Team Leaders.

    Optional search filters the Team Leader list.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.get_team_leaders(
            user_id=current_user.id,
            organization_id=organization_id,
            search=search,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Reviewers
# ============================================================


@router.get(
    "/reviewers",
)
def get_reviewers(
    organization_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    db: Session = Depends(get_db),
):
    """
    Return employees currently assigned as Reviewers.

    Optional search filters the Reviewer list.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.get_reviewers(
            user_id=current_user.id,
            organization_id=organization_id,
            search=search,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Assign / Remove Team Leader + Reviewer
# ============================================================


@router.patch(
    "/employees/{user_id}/responsibilities",
)
def update_employee_responsibilities(
    organization_id: int,
    user_id: int,
    request: EmployeeResponsibilitiesUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Assign or remove Team Leader and Reviewer responsibilities.

    Possible states:

        neither
        team leader only
        reviewer only
        both
    """

    service = OrganizationDashboardService(db)

    try:
        return service.update_employee_responsibilities(
            user_id=current_user.id,
            organization_id=organization_id,
            target_user_id=user_id,
            is_team_leader=request.is_team_leader,
            is_reviewer=request.is_reviewer,
            reviewer_job_role_ids=request.reviewer_job_role_ids,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

# ============================================================
# Delete Employee
# ============================================================


@router.delete(
    "/employees/{user_id}",
)
def delete_employee(
    organization_id: int,
    user_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Delete an employee for good (admins only)."""

    try:
        return employee_removal_service.delete_employee(
            db,
            organization_id=organization_id,
            actor_user_id=current_user.id,
            target_user_id=user_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

# ============================================================
# Employee Project Capacity
# ============================================================


@router.patch(
    "/employees/{user_id}/capacity",
)
def update_employee_project_capacity(
    organization_id: int,
    user_id: int,
    request: EmployeeProjectCapacityUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Update maximum concurrent projects for an employee.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.update_employee_capacity(
            user_id=current_user.id,
            organization_id=organization_id,
            target_user_id=user_id,
            max_concurrent_projects=(
                request.max_concurrent_projects
            ),
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Employee Job Roles
# ============================================================


@router.post(
    "/employees/{user_id}/job-roles",
    status_code=status.HTTP_201_CREATED,
)
def assign_employee_job_role(
    organization_id: int,
    user_id: int,
    request: EmployeeJobRoleAssignRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Assign an organization-specific job role to an employee.

    An employee can have multiple job roles.

    Examples:
        Animator
        Writer
        Character Designer
        Storyboard Artist
        3D Artist
    """

    service = OrganizationDashboardService(db)

    try:
        return service.assign_employee_job_role(
            user_id=current_user.id,
            organization_id=organization_id,
            target_user_id=user_id,
            job_role_id=request.job_role_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


@router.delete(
    "/employees/{user_id}/job-roles/{job_role_id}",
)
def remove_employee_job_role(
    organization_id: int,
    user_id: int,
    job_role_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Remove one job role from an employee.

    Other job roles assigned to the employee remain unchanged.
    """

    service = OrganizationDashboardService(db)

    try:
        return service.remove_employee_job_role(
            user_id=current_user.id,
            organization_id=organization_id,
            target_user_id=user_id,
            job_role_id=job_role_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

# ============================================================
# CLIENT MANAGEMENT
# ============================================================


@router.post(
    "/clients",
    response_model=ClientResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_client(
    organization_id: int,
    request: ClientCreateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Create a client.

    Only organization administrators can create clients.
    """

    service = ClientService(db)

    try:
        return service.create_client(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            name=request.name,
            email=request.email,
            phone=request.phone,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# List Clients + Search
# ============================================================


@router.get(
    "/clients",
    response_model=list[ClientResponse],
)
def get_clients(
    organization_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    db: Session = Depends(get_db),
):
    """
    List organization clients.

    Optional search checks client name, email and phone.
    """

    service = ClientService(db)

    try:
        return service.get_clients(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            search=search,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Get Client
# ============================================================


@router.get(
    "/clients/{client_id}",
    response_model=ClientResponse,
)
def get_client(
    organization_id: int,
    client_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get a single client.
    """

    service = ClientService(db)

    try:
        return service.get_client(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            client_id=client_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Update Client
# ============================================================


@router.patch(
    "/clients/{client_id}",
    response_model=ClientResponse,
)
def update_client(
    organization_id: int,
    client_id: int,
    request: ClientUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Update a client.
    """

    service = ClientService(db)

    try:
        return service.update_client(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            client_id=client_id,
            name=request.name,
            email=request.email,
            phone=request.phone,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Delete Client
# ============================================================


@router.delete(
    "/clients/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_client(
    organization_id: int,
    client_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Delete a client.
    """

    service = ClientService(db)

    try:
        service.delete_client(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            client_id=client_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

    return None


# ============================================================
# PROJECT MANAGEMENT
# ============================================================


@router.post(
    "/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    organization_id: int,
    request: ProjectCreateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Create a production project.

    Required:

        title
        client_id
        team_leader_id

    New projects start as PENDING.
    """

    service = ProjectService(db)

    try:
        return service.create_project(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            title=request.title,
            description=request.description,
            client_id=request.client_id,
            team_leader_id=request.team_leader_id,
            start_date=request.start_date,
            deadline=request.deadline,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# List Projects + Search
# ============================================================


@router.get(
    "/projects",
    response_model=list[ProjectResponse],
)
def get_projects(
    organization_id: int,
    current_user: CurrentUser,
    search: str | None = Query(
        default=None,
        min_length=1,
    ),
    db: Session = Depends(get_db),
):
    """
    List organization projects.

    Optional search checks project title and description.
    """

    service = ProjectService(db)

    try:
        return service.get_projects(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            search=search,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Get Project
# ============================================================


@router.get(
    "/projects/{project_id}",
    response_model=ProjectResponse,
)
def get_project(
    organization_id: int,
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get a single project.
    """

    service = ProjectService(db)

    try:
        return service.get_project(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            project_id=project_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Update Project
# ============================================================


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectResponse,
)
def update_project(
    organization_id: int,
    project_id: int,
    request: ProjectUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Update project information.

    Status is not changed through this endpoint.
    """

    service = ProjectService(db)

    try:
        return service.update_project(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            project_id=project_id,
            title=request.title,
            description=request.description,
            client_id=request.client_id,
            team_leader_id=request.team_leader_id,
            start_date=request.start_date,
            deadline=request.deadline,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc


# ============================================================
# Delete Project
# ============================================================


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project(
    organization_id: int,
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Delete a project.
    """

    service = ProjectService(db)

    try:
        service.delete_project(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            project_id=project_id,
        )

    except (ValueError, PermissionError) as exc:
        raise _service_error(exc) from exc

    return None


@router.get(
    "/tools",
)
def get_tools(
    organization_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):

    service = OrganizationToolService(db)

    try:

        return service.get_tools(
            actor_user_id=current_user.id,
            organization_id=organization_id,
        )

    except PermissionError as exc:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    except ValueError as exc:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ============================================================
# CREATE TOOL
# ============================================================


@router.post(
    "/tools",
    status_code=status.HTTP_201_CREATED,
)
def create_tool(
    organization_id: int,
    request: OrganizationToolCreateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):

    service = OrganizationToolService(db)

    try:

        return service.create_tool(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            name=request.name,
            description=request.description,
            website_url=request.website_url,
        )

    except PermissionError as exc:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    except ValueError as exc:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ============================================================
# UPDATE TOOL
# ============================================================


@router.put(
    "/tools/{tool_id}",
)
def update_tool(
    organization_id: int,
    tool_id: int,
    request: OrganizationToolUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):

    service = OrganizationToolService(db)

    try:

        return service.update_tool(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            tool_id=tool_id,
            name=request.name,
            description=request.description,
            website_url=request.website_url,
        )

    except PermissionError as exc:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    except ValueError as exc:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ============================================================
# DELETE TOOL
# ============================================================


@router.delete(
    "/tools/{tool_id}",
)
def delete_tool(
    organization_id: int,
    tool_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):

    service = OrganizationToolService(db)

    try:

        return service.delete_tool(
            actor_user_id=current_user.id,
            organization_id=organization_id,
            tool_id=tool_id,
        )

    except PermissionError as exc:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    except ValueError as exc:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
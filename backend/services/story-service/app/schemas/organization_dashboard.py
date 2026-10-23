from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# Organization
# ============================================================

class DashboardOrganizationResponse(BaseModel):
    id: int
    name: str | None
    business_type: str | None
    official_address: str | None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Dashboard Statistics
# ============================================================

class OrganizationDashboardStats(BaseModel):
    total_clients: int
    total_employees: int

    total_projects: int
    ongoing_projects: int
    completed_projects: int
    aborted_projects: int


# ============================================================
# Client Summary
# ============================================================

class DashboardClientResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None

    successfully_delivered_projects: int
    ongoing_projects: int

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Employee Summary
# ============================================================

class DashboardEmployeeResponse(BaseModel):
    user_id: int
    email: str

    system_role: str

    # One employee can have multiple job roles.
    job_roles: list[str]

    max_concurrent_projects: int | None

    current_project_count: int
    available_project_capacity: int | None

    is_team_leader: bool
    is_reviewer: bool
    reviewer_job_role_ids: list[int]

    team_leader_id: int | None

    is_active: bool


# ============================================================
# Job Role Summary
# ============================================================

class DashboardJobRoleResponse(BaseModel):
    id: int
    name: str
    description: str | None

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Dashboard Response
# ============================================================

class OrganizationDashboardResponse(BaseModel):
    organization: DashboardOrganizationResponse

    statistics: OrganizationDashboardStats

    clients: list[DashboardClientResponse]

    employees: list[DashboardEmployeeResponse]

    job_roles: list[DashboardJobRoleResponse]


# ============================================================
# Employee List Item
# ============================================================

class DashboardEmployeeListItem(BaseModel):
    status: str

    user_id: int | None = None
    invitation_id: int | None = None

    email: str

    system_role: str
    job_roles: list[str]

    max_concurrent_projects: int | None

    current_project_count: int | None = None
    available_project_capacity: int | None = None

    is_team_leader: bool
    is_reviewer: bool
    reviewer_job_role_ids: list[int]

    team_leader_id: int | None = None

    joined_at: datetime | None = None
    created_at: datetime | None = None
    expires_at: datetime | None = None


class OrganizationEmployeesResponse(BaseModel):
    employees: list[DashboardEmployeeListItem]

    total: int
    accepted: int
    pending: int


# ============================================================
# Employee Project Capacity
# ============================================================

class EmployeeProjectCapacityUpdateRequest(BaseModel):
    max_concurrent_projects: int | None = Field(
        default=None,
        ge=1,
        le=100,
    )


# ============================================================
# Employee Responsibilities
# ============================================================

class EmployeeResponsibilitiesUpdateRequest(BaseModel):
    is_team_leader: bool | None = None
    is_reviewer: bool | None = None
    reviewer_job_role_ids: list[int] | None = None


# ============================================================
# Employee Team Leader
# ============================================================

class EmployeeTeamLeaderUpdateRequest(BaseModel):
    team_leader_id: int | None = Field(
        default=None,
        gt=0,
    )


# ============================================================
# Employee
# ============================================================

class OrganizationEmployeeResponse(BaseModel):
    employee_id: int
    user_id: int
    email: str

    max_concurrent_projects: int | None

    is_team_leader: bool
    is_reviewer: bool
    reviewer_job_role_ids: list[int]

    team_leader_id: int | None

    job_roles: list[str] = []

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Employee Job Role Assignment
# ============================================================

class EmployeeJobRoleAssignRequest(BaseModel):
    job_role_id: int = Field(
        gt=0,
    )
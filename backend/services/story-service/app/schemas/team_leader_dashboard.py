from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectStatus


# ============================================================
# Job Role
# ============================================================

class TeamLeaderJobRoleResponse(BaseModel):
    id: int
    name: str
    description: str | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Employee
# ============================================================

class TeamLeaderEmployeeResponse(BaseModel):
    user_id: int
    email: str

    job_roles: list[TeamLeaderJobRoleResponse] = Field(
        default_factory=list,
    )

    reviewer_job_roles: list[TeamLeaderJobRoleResponse] = Field(
        default_factory=list,
    )

    max_concurrent_projects: int | None = None
    current_project_count: int
    available_project_capacity: int | None
    is_reviewer: bool
    is_team_leader: bool
    is_available: bool
    is_on_project: bool = False

# ============================================================
# Project Member
# ============================================================

class TeamLeaderProjectMemberResponse(BaseModel):
    id: int
    user_id: int
    email: str

    job_role: TeamLeaderJobRoleResponse | None = None

    assigned_at: datetime

    is_reviewer: bool
    is_team_leader: bool
    # the job roles the organization gave this person
    employee_job_roles: list[TeamLeaderJobRoleResponse] = Field(
        default_factory=list,
    )
    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Project
# ============================================================

class TeamLeaderCoverSketch(BaseModel):
    """The newest scene sketch of a project, shown on its dashboard card."""

    story_id: int
    scene_id: int
    sketch_id: int


class TeamLeaderProjectResponse(BaseModel):
    id: int

    organization_id: int
    client_id: int
    client_name: str | None = None
    title: str
    description: str | None = None

    status: ProjectStatus

    team_leader_id: int

    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    start_date: date | None = None
    deadline: date | None = None

    members: list[TeamLeaderProjectMemberResponse] = Field(
        default_factory=list,
    )

    # only on the dashboard: a sketch to show on the card (None: the drawn cover)
    cover_sketch: TeamLeaderCoverSketch | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Project List
# ============================================================

class TeamLeaderProjectsResponse(BaseModel):
    projects: list[TeamLeaderProjectResponse]

    total: int


# ============================================================
# Dashboard Statistics
# ============================================================

class TeamLeaderDashboardStats(BaseModel):
    total_projects: int

    pending_projects: int
    ongoing_projects: int
    completed_projects: int
    aborted_projects: int

    total_members: int


# ============================================================
# Dashboard
# ============================================================

class TeamLeaderDashboardResponse(BaseModel):
    statistics: TeamLeaderDashboardStats

    projects: list[TeamLeaderProjectResponse]


# ============================================================
# Employee Assignment
# ============================================================

class TeamLeaderAssignEmployeeRequest(BaseModel):
    """
    Employee user ID is already present in the URL.

    Only job_role_id is required in the request body.
    """

    job_role_id: int = Field(
        gt=0,
    )

class TeamLeaderEmployeeJobRolesRequest(BaseModel):
    """
    Exactly which of the employee's job roles they do on the project
    (one or more). Used to add an employee and to change their roles later.
    """

    job_role_ids: list[int] = Field(
        min_length=1,
    )

# ============================================================
# Reviewer Assignment
# ============================================================

class TeamLeaderAssignReviewerRequest(BaseModel):
    """
    Reviewer user ID is already present in the URL.

    The Team Leader must select which reviewer job role
    the reviewer will perform for this project.

    The selected job role must already be configured
    for this employee under their Reviewer For roles.
    """

    job_role_id: int = Field(
        gt=0,
    )


# ============================================================
# Project Status
# ============================================================

class TeamLeaderProjectStatusUpdateRequest(BaseModel):
    status: ProjectStatus
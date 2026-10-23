from __future__ import annotations

from datetime import datetime, date

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.project import ProjectStatus


# ============================================================
# Project Member
# ============================================================


class ProjectMemberCreateRequest(BaseModel):
    user_id: int = Field(
        gt=0,
    )

    job_role_id: int | None = Field(
        default=None,
        gt=0,
    )


# ============================================================
# Project Create
# ============================================================


class ProjectCreateRequest(BaseModel):
    """
    Project creation is controlled by the organization admin.

    Client and Team Leader are mandatory.

    Status is NOT supplied by the client.
    Every newly created project starts as PENDING.

    Employees/reviewers are NOT supplied during creation.
    They are assigned later by the Team Leader.
    """

    title: str = Field(
        min_length=1,
        max_length=255,
    )

    description: str | None = Field(
        default=None,
        max_length=10000,
    )

    client_id: int = Field(
        gt=0,
    )

    team_leader_id: int = Field(
        gt=0,
    )
    
    start_date: date

    deadline: date

    @model_validator(mode="after")
    def check_dates(self):
        if self.deadline < self.start_date:
            raise ValueError("The deadline cannot be before the start date.")
        return self

# ============================================================
# Project Update
# ============================================================


class ProjectUpdateRequest(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    description: str | None = Field(
        default=None,
        max_length=10000,
    )

    client_id: int | None = Field(
        default=None,
        gt=0,
    )

    team_leader_id: int | None = Field(
        default=None,
        gt=0,
    )
    # The start date can be changed only while the project is pending.
    start_date: date | None = None

    # The deadline can be moved at any time.
    deadline: date | None = None


# ============================================================
# Project Status Update
# ============================================================


class ProjectStatusUpdateRequest(BaseModel):
    status: ProjectStatus


# ============================================================
# Project Member Response
# ============================================================


class ProjectMemberResponse(BaseModel):
    id: int

    user_id: int

    job_role_id: int | None

    assigned_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Project Response
# ============================================================


class ProjectResponse(BaseModel):
    id: int

    organization_id: int

    client_id: int

    title: str

    description: str | None

    status: ProjectStatus

    team_leader_id: int

    created_at: datetime

    updated_at: datetime

    completed_at: datetime | None

    start_date: date | None

    deadline: date | None

    members: list[ProjectMemberResponse] = Field(
        default_factory=list,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )
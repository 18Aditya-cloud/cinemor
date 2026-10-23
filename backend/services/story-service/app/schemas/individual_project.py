from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class IndividualProjectCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None

    project_type: str = Field(
        default="self",
        pattern="^(self|client)$",
    )

    client_id: int | None = None

    started_date: date | None = None
    deadline: date | None = None


class IndividualProjectUpdateRequest(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    description: str | None = None

    project_type: str | None = Field(
        default=None,
        pattern="^(self|client)$",
    )

    client_id: int | None = None

    started_date: date | None = None
    deadline: date | None = None

    status: str | None = Field(
        default=None,
        pattern="^(pending|started|completed|aborted)$",
    )


class IndividualProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    individual_user_id: int
    client_id: int | None

    title: str
    description: str | None

    project_type: str
    status: str

    started_date: date | None
    deadline: date | None

    created_at: datetime
    updated_at: datetime
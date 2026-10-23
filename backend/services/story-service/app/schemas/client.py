from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================
# Create Client
# ============================================================


class ClientCreateRequest(BaseModel):
    """
    Request used by an organization administrator to create
    a new client.
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    name: str = Field(
        min_length=2,
        max_length=255,
    )

    email: str = Field(
        min_length=5,
        max_length=320,
    )

    phone: str | None = Field(
        default=None,
        max_length=30,
    )

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


# ============================================================
# Update Client
# ============================================================


class ClientUpdateRequest(BaseModel):
    """
    Request used to update an existing client.

    All fields are optional because this is a PATCH operation.
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=255,
    )

    email: str | None = Field(
        default=None,
        min_length=5,
        max_length=320,
    )

    phone: str | None = Field(
        default=None,
        max_length=30,
    )

    @field_validator("email")
    @classmethod
    def normalize_email(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value.strip().lower()


# ============================================================
# Client Response
# ============================================================


class ClientResponse(BaseModel):
    """
    Public API representation of a client.

    ongoing_projects is calculated from actual project records.

    It is not stored as an independent client status field.
    """

    id: int
    organization_id: int

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
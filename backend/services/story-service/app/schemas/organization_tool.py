from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# Tool Response
# ============================================================


class OrganizationToolResponse(BaseModel):
    id: int
    organization_id: int
    name: str
    description: str
    website_url: str | None = None
    is_active: bool

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# Create Tool
# ============================================================


class OrganizationToolCreateRequest(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=150,
    )

    description: str = Field(
        ...,
        min_length=1,
        max_length=5000,
    )

    website_url: str | None = Field(
        default=None,
        max_length=500,
    )


# ============================================================
# Update Tool
# ============================================================


class OrganizationToolUpdateRequest(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=150,
    )

    description: str = Field(
        ...,
        min_length=1,
        max_length=5000,
    )

    website_url: str | None = Field(
        default=None,
        max_length=500,
    )
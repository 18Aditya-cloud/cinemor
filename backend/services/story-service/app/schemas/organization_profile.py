from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class OrganizationProfileResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    name: str | None
    business_type: str | None
    official_address: str | None


class OrganizationProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    name: str = Field(
        min_length=2,
        max_length=255,
    )

    business_type: str = Field(
        min_length=2,
        max_length=150,
    )

    official_address: str = Field(
        min_length=5,
        max_length=2000,
    )


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    new_password: str = Field(
        min_length=12,
        max_length=128,
    )

    confirm_password: str = Field(
        min_length=12,
        max_length=128,
    )
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_http_url(value: str | None) -> str | None:
    """Only http(s) links are allowed, to block javascript:/data: payloads."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not value.lower().startswith(("http://", "https://")):
        raise ValueError("website_url must start with http:// or https://")
    return value


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

    @field_validator("website_url")
    @classmethod
    def _check_url(cls, v):
        return _validate_http_url(v)


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

    @field_validator("website_url")
    @classmethod
    def _check_url(cls, v):
        return _validate_http_url(v)

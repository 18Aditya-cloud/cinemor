from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IndividualClientCreateRequest(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    company_name: str | None = None


class IndividualClientUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    company_name: str | None = None


class IndividualClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    phone: str | None = None
    company_name: str | None = None
    created_at: datetime
    updated_at: datetime
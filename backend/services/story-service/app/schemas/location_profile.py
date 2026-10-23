
from pydantic import BaseModel, Field


class LocationProfileGenerateRequest(BaseModel):
    style_name: str = Field(..., min_length=1, max_length=100)
    style_instructions: str = ""
    customization_instructions: str = ""
    reference_information: str = ""
    model_id: str | None = None


class LocationProfileResponse(BaseModel):
    id: int
    story_board_id: int
    location_json_id: int
    location_name: str
    profile_data: dict = Field(default_factory=dict)
    customization_prompt: str | None = None
    style_name: str
    status: str
    model_name: str | None = None
    model_version: str | None = None
    error_message: str | None = None
    version: int

    model_config = {"from_attributes": True}

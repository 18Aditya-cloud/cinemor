
from pydantic import BaseModel, Field


class LocationMasterImageGenerateRequest(BaseModel):
    model_id: str = "black-forest-labs/flux.2-flex"
    prompt: str | None = None
    image_type: str = "canonical"


class LocationMasterImageResponse(BaseModel):
    id: int
    location_profile_id: int | None = None
    story_board_id: int
    location_json_id: int
    location_name: str
    image_type: str
    source_type: str
    image_url: str | None = None
    storage_key: str | None = None
    original_filename: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None
    prompt: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    status: str
    version: int
    error_message: str | None = None

    model_config = {"from_attributes": True}


class LocationMasterImageUploadResponse(BaseModel):
    image: LocationMasterImageResponse

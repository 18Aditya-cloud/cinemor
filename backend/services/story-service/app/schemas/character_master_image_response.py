
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CharacterMasterImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    character_profile_id: int | None
    story_board_id: int
    character_json_id: int
    character_name: str
    image_type: str
    source_type: str
    image_url: str | None
    storage_key: str | None
    original_filename: str | None
    mime_type: str | None
    file_size_bytes: int | None
    prompt: str
    model_name: str
    model_version: str
    status: str
    version: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime

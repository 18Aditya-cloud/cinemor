
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CharacterProfileResponse(BaseModel):
    """Character profile database record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    story_board_id: int
    character_json_id: int
    character_name: str
    profile_data: dict[str, Any]
    customization_prompt: str
    style_name: str
    status: str
    model_name: str
    model_version: str
    error_message: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class StoryboardCharacterResponse(BaseModel):
    """Character entry extracted from a saved storyboard."""

    character_id: int
    name: str
    description: str = ""
    role: str = ""
    gender: str = ""
    age_group: str = ""
    appearance: dict[str, Any] = Field(default_factory=dict)
    dominant_emotions: list[Any] = Field(default_factory=list)
    profile: CharacterProfileResponse | None = None

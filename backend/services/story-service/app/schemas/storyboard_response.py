
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StoryboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    story_id: int
    title: str
    metadata_json: dict[str, Any] = Field(
        serialization_alias="metadata",
    )
    storyboard_data: dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime

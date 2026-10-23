from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StoryEditHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    story_id: int
    action_type: str
    instruction: str | None = None
    status: str
    before_version_id: int | None = None
    after_version_id: int | None = None
    details: dict = Field(default_factory=dict)
    created_at: datetime

from pydantic import BaseModel, Field


class StoryboardGenerateRequest(BaseModel):
    model_id: str | None = Field(
        default=None,
        min_length=1,
        description="Optional model ID for storyboard generation.",
    )

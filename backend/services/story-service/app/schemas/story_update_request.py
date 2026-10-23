from pydantic import BaseModel, Field


class StoryUpdateRequest(BaseModel):
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Updated story title.",
    )

    content: str = Field(
        ...,
        min_length=1,
        max_length=100000,
        description="Updated complete story content.",
    )
from datetime import datetime

from pydantic import BaseModel, Field


class StoryVersionResponse(BaseModel):
    id: int = Field(
        ...,
        description="Database ID of the story version.",
    )

    story_id: int = Field(
        ...,
        description="ID of the story this version belongs to.",
    )

    version_number: int = Field(
        ...,
        description="Sequential version number for the story.",
    )

    title: str = Field(
        ...,
        description="Title stored in this version.",
    )

    content: str = Field(
        ...,
        description="Complete story content stored in this version.",
    )

    source_type: str = Field(
        ...,
        description="How this version was created.",
    )

    created_at: datetime = Field(
        ...,
        description="Timestamp when this version was created.",
    )
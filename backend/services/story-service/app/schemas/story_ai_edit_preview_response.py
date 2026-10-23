from pydantic import BaseModel, Field


class StoryAIEditPreviewResponse(BaseModel):
    preview_id: int = Field(
        ...,
        description="ID of the AI edit preview.",
    )

    story_id: int = Field(
        ...,
        description="ID of the story being edited.",
    )

    current_version_id: int = Field(
        ...,
        description="Version ID of the story before the AI edit.",
    )

    title: str = Field(
        ...,
        description="AI-generated revised story title.",
    )

    content: str = Field(
        ...,
        description="AI-generated revised story content.",
    )

    source_type: str = Field(
        default="ai_edit",
        description="Source type of the proposed edit.",
    )

from pydantic import BaseModel, Field


class StoryResponse(BaseModel):
    id: int = Field(..., description="Database ID of the story.")

    individual_project_id: int | None = Field(
        default=None,
        description="Individual project associated with this story.",
    )

    title: str = Field(..., description="Story title.")
    content: str = Field(..., description="Complete story content.")

    source_type: str = Field(
        default="ai_generated",
        description="How the story entered the system: ai_generated or user_uploaded.",
    )

    prompt: str | None = None
    model_id: str | None = None
    language: str = "English"

    point_of_view: str = Field(
        default="third_person_limited",
        description="Narrative point of view used for the story.",
    )

    story_format: str = Field(
        default="prose_narrative",
        description="Writing format used for the story.",
    )

    word_count: int = 0

    genre: list[str] = Field(default_factory=list)
    style: list[str] = Field(default_factory=list)
    tone: list[str] = Field(default_factory=list)

    characters: list[dict] = Field(default_factory=list)

    target_audience: str | None = None
    subject: str | None = None
    educational_objective: str | None = None
    grade_level: str | None = None
    learning_points: list[str] = Field(default_factory=list)
    setting: str | None = None
    additional_details: str | None = None

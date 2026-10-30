from pydantic import BaseModel, Field


class DialogueUpdateRequest(BaseModel):
    """The new text of one dialogue line."""

    text: str = Field(..., min_length=1, max_length=2000)


class SceneFieldsUpdateRequest(BaseModel):
    """
    New text for a scene's "What happens", "What we see" and "Camera" (any of them; the rest stay).
    These feed the sketches and the video of the scene.
    """

    primary_action: str | None = Field(default=None, max_length=4000)
    visual_description: str | None = Field(default=None, max_length=4000)
    camera_suggestion: str | None = Field(default=None, max_length=2000)
from pydantic import BaseModel, Field


class DialogueUpdateRequest(BaseModel):
    """The new text of one dialogue line."""

    text: str = Field(..., min_length=1, max_length=2000)

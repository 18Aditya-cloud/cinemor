from pydantic import BaseModel, Field


class ModelResponse(BaseModel):
    """
    Represents an AI model exposed by Cinemor.

    The frontend uses this response to populate the model
    selection dropdown. Users select a model from the dropdown;
    they do not enter model IDs manually.
    """

    id: str = Field(
        ...,
        description="Internal OpenRouter model ID used by the backend.",
    )

    name: str = Field(
        ...,
        description="Human-readable model name shown in the UI.",
    )

    provider: str = Field(
        ...,
        description="AI model provider.",
    )

    description: str = Field(
        ...,
        description="Short description displayed in the model selector.",
    )
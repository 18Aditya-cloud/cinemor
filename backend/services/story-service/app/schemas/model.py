from pydantic import BaseModel, ConfigDict


class ModelResponse(BaseModel):
    """
    AI model exposed to the frontend for selection.

    The frontend should use `id` as the value submitted to
    the story-generation API and `name` for display.
    """

    id: str
    name: str
    provider: str
    description: str

    model_config = ConfigDict(
        from_attributes=True,
    )


class ModelListResponse(BaseModel):
    """
    Response containing all AI models available for selection.
    """

    models: list[ModelResponse]
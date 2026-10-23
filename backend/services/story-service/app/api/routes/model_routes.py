from fastapi import APIRouter

from app.llm.model_service import ModelService
from app.schemas.model import ModelListResponse, ModelResponse


router = APIRouter(
    prefix="/models",
    tags=["AI Models"],
)


model_service = ModelService()


@router.get(
    "",
    response_model=ModelListResponse,
)
async def get_available_models() -> ModelListResponse:
    """
    Return all AI models currently available for selection.

    The frontend uses this endpoint to populate the AI model
    dropdown. Users do not type model IDs manually.
    """

    models = model_service.get_available_models()

    return ModelListResponse(
        models=[
            ModelResponse(
                id=model.id,
                name=model.name,
                provider=model.provider,
                description=model.description,
            )
            for model in models
        ]
    )
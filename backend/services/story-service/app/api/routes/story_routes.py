from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import (
    LLMProviderError,
    StoryGenerationError,
)
from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.core.rate_limit import rate_limit
from app.schemas.story_request import StoryRequest
from app.schemas.story_response import StoryResponse
from app.services.story_service import StoryService


router = APIRouter(
    prefix="/stories",
    tags=["Stories"],
)


@router.post(
    "/generate",
    dependencies=[Depends(rate_limit(limit=20, window_seconds=60))],
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_story(
    request: StoryRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StoryResponse:
    """
    Generate a story using the selected AI model and save it
    to the Cinemor database.
    """

    try:
        story_service = StoryService(db)

        return await story_service.generate_story(
            request=request,
        )

    except StoryGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=exc.message,
        ) from exc

    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.message,
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate and save story.",
        ) from exc

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import LLMProviderError
from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.core.rate_limit import rate_limit
from app.schemas.storyboard_request import StoryboardGenerateRequest
from app.services.storyboard_service import StoryboardService


router = APIRouter(
    prefix="/storyboards",
    tags=["Storyboards"],
)


@router.post("/generate", status_code=status.HTTP_200_OK, dependencies=[Depends(rate_limit(limit=20, window_seconds=60))])
async def generate_storyboard(
    request: StoryboardGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> dict:
    service = StoryboardService(db)

    try:
        return await service.generate_storyboard(
            story_id=request.story_id
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.message,
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate and save storyboard.",
        ) from exc

from fastapi import APIRouter, Depends, status, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import json
from fastapi.responses import FileResponse, Response
from pathlib import Path
from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db

from app.schemas.individual_client import (
    IndividualClientCreateRequest,
    IndividualClientResponse,
    IndividualClientUpdateRequest,
)

from app.schemas.individual_project import (
    IndividualProjectCreateRequest,
    IndividualProjectResponse,
    IndividualProjectUpdateRequest,
)

from app.services.individual_client_service import (
    IndividualClientService,
)

from app.services.individual_project_service import (
    IndividualProjectService,
)
from app.schemas.story_request import StoryRequest
from app.schemas.story_response import StoryResponse
from app.services.story_service import StoryService
from app.repositories.story_repository import StoryRepository
from app.schemas.story_update_request import StoryUpdateRequest
from app.services.story_document_service import StoryDocumentService
from app.schemas.story_ai_edit_request import StoryAIEditRequest
from app.schemas.story_ai_edit_preview_response import StoryAIEditPreviewResponse
from app.schemas.story_version_response import StoryVersionResponse
from app.repositories.story_edit_history_repository import (
    StoryEditHistoryRepository,
)
from app.schemas.story_edit_history import StoryEditHistoryResponse
from app.repositories.story_repository import StoryRepository
from app.schemas.storyboard_request import StoryboardGenerateRequest
from app.schemas.storyboard_response import StoryboardResponse
from app.schemas.storyboard_dialogue import DialogueUpdateRequest, SceneFieldsUpdateRequest
from app.services.storyboard_dialogue_service import StoryboardDialogueService
from app.services.storyboard_service import (
    StoryboardGenerationError,
    StoryboardService,
)
from app.models.character_appearance import CharacterAppearance
from app.models.characters import Character
from app.models.dialogues import Dialogue
from app.models.location import Location
from app.models.narrator import Narrator
from app.models.objects import StoryObject
from app.models.relationship import CharacterRelationship
from app.models.scene_character import SceneCharacter
from app.models.scenes import Scene
from app.repositories.storyboard_repository import StoryBoardRepository
from app.repositories.character_profile_repository import (
    CharacterProfileRepository,
)
from app.schemas.character_profile_response import (
    StoryboardCharacterResponse,
)
from app.schemas.character_profile_request import CharacterProfileGenerateRequest
from app.services.character_profile_generation_service import (
    CharacterProfileGenerationService,
)
from app.schemas.character_profile_response import CharacterProfileResponse
from app.models.character_master_image import CharacterMasterImage
from app.repositories.character_master_image_repository import (
    CharacterMasterImageRepository,
)
from app.schemas.character_master_image_request import (
    MasterImageGenerateRequest,
)
from app.schemas.character_master_image_response import (
    CharacterMasterImageResponse,
)
from app.services.character_master_image_service import (
    CharacterMasterImageService,
)
from app.services.character_master_image_upload_service import (
    CharacterMasterImageUploadService,
)
from app.services.character_master_image_storage import (
    CharacterMasterImageStorage,
)
from fastapi.responses import FileResponse
from fastapi import UploadFile, File, Form, HTTPException, Depends, status

from app.models.location_profile import LocationProfile
from app.models.location_master_image import LocationMasterImage

from app.services.location_profile_generation_service import (
    LocationProfileGenerationService,
)
from app.services.location_master_image_service import (
    LocationMasterImageService,
)
from app.services.location_master_image_upload_service import (
    LocationMasterImageUploadService,
)
from app.services.location_master_image_storage import (
    LocationMasterImageStorage,
)
from app.repositories.location_master_image_repository import (
    LocationMasterImageRepository,
)

from app.schemas.location_profile import (
    LocationProfileGenerateRequest,
    LocationProfileResponse,
)
from app.schemas.location_master_image import (
    LocationMasterImageGenerateRequest,
    LocationMasterImageResponse,
)
from app.schemas.scene_sketch import (
    SceneSketchGenerateRequest,
    SceneSketchListResponse,
    SceneSketchResponse,
)
from app.services.scene_sketch_service import SceneSketchService
from app.models.scene_sketch import SceneSketch
from app.services.scene_sketch_storage import SceneSketchStorage
from app.schemas.scene_sketch import AutoSceneSketchRequest
from fastapi import BackgroundTasks, Query
from app.database.session import SessionLocal
from app.models import SceneVideoClip, VideoGenerationJob
from app.schemas.video_generation import (
    VideoGenerationRequest,
    VideoGenerationJobResponse,
    SceneVideoClipResponse,
)
from app.services.video_generation_service import VideoGenerationService
from app.services.scene_video_storage import SceneVideoStorage
from app.services.video_assembly_service import (
    VideoAssemblyService,
    VideoAssemblyError,
)
from app.api.dependencies.auth import get_current_user
from app.models import StoryBoard

router = APIRouter(
    prefix="/api/individual",
    tags=["Individual"],
)


# ============================================================
# CLIENTS
# ============================================================


@router.post(
    "/clients",
    response_model=IndividualClientResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_client(
    request: IndividualClientCreateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualClientService(db)

    try:
        client = service.create_client(
            individual_user_id=current_user.id,
            name=request.name,
            email=request.email,
            phone=request.phone,
            company_name=request.company_name,
        )

        db.commit()
        return client

    except (ValueError, PermissionError):
        db.rollback()
        raise


@router.get(
    "/clients",
    response_model=list[IndividualClientResponse],
)
def get_clients(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualClientService(db)

    return service.get_clients(
        individual_user_id=current_user.id,
    )


@router.get(
    "/clients/{client_id}",
    response_model=IndividualClientResponse,
)
def get_client(
    client_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualClientService(db)

    return service.get_client(
        individual_user_id=current_user.id,
        client_id=client_id,
    )


@router.patch(
    "/clients/{client_id}",
    response_model=IndividualClientResponse,
)
def update_client(
    client_id: int,
    request: IndividualClientUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualClientService(db)

    try:
        client = service.update_client(
            individual_user_id=current_user.id,
            client_id=client_id,
            name=request.name,
            email=request.email,
            phone=request.phone,
            company_name=request.company_name,
        )

        db.commit()
        return client

    except (ValueError, PermissionError):
        db.rollback()
        raise


@router.delete(
    "/clients/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_client(
    client_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualClientService(db)

    try:
        service.delete_client(
            individual_user_id=current_user.id,
            client_id=client_id,
        )

        db.commit()

    except (ValueError, PermissionError):
        db.rollback()
        raise

    return None


# ============================================================
# PROJECTS
# ============================================================


@router.post(
    "/projects",
    response_model=IndividualProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    request: IndividualProjectCreateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualProjectService(db)

    try:
        project = service.create_project(
            individual_user_id=current_user.id,
            title=request.title,
            description=request.description,
            project_type=request.project_type,
            client_id=request.client_id,
            started_date=request.started_date,
            deadline=request.deadline,
        )

        db.commit()
        return project

    except (ValueError, PermissionError):
        db.rollback()
        raise


@router.get(
    "/projects",
    response_model=list[IndividualProjectResponse],
)
def get_projects(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualProjectService(db)

    return service.get_projects(
        individual_user_id=current_user.id,
    )


@router.get(
    "/projects/{project_id}",
    response_model=IndividualProjectResponse,
)
def get_project(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualProjectService(db)

    try:
        return service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )
    except ValueError as exc:
        # a project that does not exist, or belongs to another account
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/projects/{project_id}",
    response_model=IndividualProjectResponse,
)
def update_project(
    project_id: int,
    request: IndividualProjectUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualProjectService(db)

    try:
        project = service.update_project(
            individual_user_id=current_user.id,
            project_id=project_id,
            title=request.title,
            description=request.description,
            project_type=request.project_type,
            client_id=request.client_id,
            started_date=request.started_date,
            deadline=request.deadline,
            status=request.status,
        )

        db.commit()
        return project

    except (ValueError, PermissionError):
        db.rollback()
        raise


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    service = IndividualProjectService(db)

    try:
        service.delete_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

        db.commit()

    except (ValueError, PermissionError):
        db.rollback()
        raise

    return None

# ============================================================
# STORIES
# ============================================================

@router.post(
    "/projects/{project_id}/stories/generate",
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_project_story(
    project_id: int,
    request: StoryRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StoryResponse:
    """
    Generate a story for an Individual Project.

    The project must belong to the authenticated
    Individual user.
    """

    project_service = IndividualProjectService(db)

    try:
        project = project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_service = StoryService(db)

    return await story_service.generate_story(
        request=request,
        individual_project_id=project.id,
    )

# ============================================================
# GET STORIES FOR INDIVIDUAL PROJECT
# ============================================================

@router.get(
    "/projects/{project_id}/stories",
    response_model=list[StoryResponse],
    status_code=status.HTTP_200_OK,
)
async def get_project_stories(
    project_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[StoryResponse]:
    """
    Get all stories belonging to an Individual Project.

    The project must belong to the authenticated
    Individual user.
    """

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_repository = StoryRepository(db)

    stories = story_repository.get_by_individual_project(
        individual_project_id=project_id,
    )


    return [
        StoryResponse(
            id=story.id,
            individual_project_id=story.individual_project_id,
            title=story.title,
            content=story.content,
            source_type=story.source_type,
            prompt=story.prompt,
            model_id=story.model_id,
            language=story.language,
            point_of_view=story.point_of_view,
            story_format=story.story_format,
            word_count=story.word_count,
            genre=story.genre,
            style=story.style,
            tone=story.tone,
            characters=story.characters or [],
            target_audience=story.target_audience,
            subject=story.subject,
            educational_objective=story.educational_objective,
            grade_level=story.grade_level,
            learning_points=story.learning_points or [],
            setting=story.setting,
            additional_details=story.additional_details,
        )
        for story in stories
    ]


# ============================================================
# GET STORY VERSION HISTORY
# ============================================================

@router.get(
    "/projects/{project_id}/stories/{story_id}/versions",
    response_model=list[StoryVersionResponse],
    status_code=status.HTTP_200_OK,
)
async def get_story_versions(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[StoryVersionResponse]:
    """
    Get version history for a story belonging to an
    Individual Project.
    """

    # =====================================================
    # 1. VERIFY PROJECT OWNERSHIP
    # =====================================================

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # =====================================================
    # 2. VERIFY STORY BELONGS TO PROJECT
    # =====================================================

    story_repository = StoryRepository(db)

    story = story_repository.get_by_id(
        story_id,
    )

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found.",
        )

    # =====================================================
    # 3. GET VERSION HISTORY
    # =====================================================

    story_service = StoryService(db)

    versions = story_service.get_story_versions(
        story_id=story_id,
    )

    # =====================================================
    # 4. MAP DATABASE MODELS TO RESPONSE
    # =====================================================

    return [
        StoryVersionResponse(
            id=version.id,
            story_id=version.story_id,
            version_number=version.version_number,
            title=version.title,
            content=version.content,
            source_type=version.source_type,
            created_at=version.created_at,
        )
        for version in versions
    ]


@router.get(
    "/projects/{project_id}/stories/{story_id}/edit-history",
    response_model=list[StoryEditHistoryResponse],
    status_code=status.HTTP_200_OK,
)
def get_story_edit_history(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[StoryEditHistoryResponse]:
    """Get edit history for a story owned by the authenticated user."""

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found.",
        )

    history_repository = StoryEditHistoryRepository(db)
    history_items = history_repository.get_by_story(story_id=story_id)

    return [
        StoryEditHistoryResponse.model_validate(item)
        for item in history_items
    ]


@router.post(
    "/projects/{project_id}/stories/{story_id}/versions/{version_id}/restore",
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
)
async def restore_story_version(
    project_id: int,
    story_id: int,
    version_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StoryResponse:
    # =====================================================
    # 1. VERIFY PROJECT OWNERSHIP
    # =====================================================

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # =====================================================
    # 2. VERIFY STORY BELONGS TO PROJECT
    # =====================================================

    story_repository = StoryRepository(db)

    story = story_repository.get_by_id(
        story_id,
    )

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found.",
        )

    # =====================================================
    # 3. RESTORE VERSION
    # =====================================================

    story_service = StoryService(db)

    try:
        return story_service.restore_story_version(
            story_id=story_id,
            version_id=version_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

# ============================================================
# UPDATE STORY
# ============================================================

@router.patch(
    "/projects/{project_id}/stories/{story_id}",
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
)
async def update_project_story(
    project_id: int,
    story_id: int,
    request: StoryUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StoryResponse:
    """
    Update a story belonging to an Individual Project.

    The project and story must belong to the authenticated
    Individual user.
    """

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_repository = StoryRepository(db)

    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found.",
        )

    story_service = StoryService(db)

    return story_service.update_story(
        story_id=story_id,
        title=request.title,
        content=request.content,
    )

# ============================================================
# AI EDIT STORY
# ============================================================

@router.post(
    "/projects/{project_id}/stories/{story_id}/ai-edit",
    response_model=StoryAIEditPreviewResponse,
    status_code=status.HTTP_200_OK,
)
async def ai_edit_project_story(
    project_id: int,
    story_id: int,
    request: StoryAIEditRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StoryResponse:
    """
    Modify an existing story using an AI editing instruction.

    The project and story must belong to the authenticated
    Individual user.
    """

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_repository = StoryRepository(db)

    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found.",
        )

    story_service = StoryService(db)

    return await story_service.ai_edit_story(
        story_id=story_id,
        request=request,
    )

# ============================================================
# DELETE STORY
# ============================================================

@router.delete(
    "/projects/{project_id}/stories/{story_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project_story(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    """
    Delete a story belonging to an Individual Project.

    The project and story must belong to the authenticated
    Individual user.
    """

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_repository = StoryRepository(db)

    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found.",
        )

    story_repository.delete(story)

# ============================================================
# ACCEPT AI EDIT PREVIEW
# ============================================================

@router.post(
    "/projects/{project_id}/stories/previews/{preview_id}/accept",
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
)
async def accept_ai_edit_preview(
    project_id: int,
    preview_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StoryResponse:
    """
    Accept a pending AI edit preview for a story.

    The project must belong to the authenticated
    Individual user.
    """

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_service = StoryService(db)

    preview = story_service.story_edit_preview_repository.get_pending_by_id(
        preview_id=preview_id,
    )

    if preview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending AI edit preview not found.",
        )

    story = story_service.story_repository.get_by_id(
        preview.story_id
    )

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI edit preview not found.",
        )

    try:
        return story_service.accept_ai_edit_preview(
            preview_id=preview_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ============================================================
# DISCARD AI EDIT PREVIEW
# ============================================================

@router.post(
    "/projects/{project_id}/stories/previews/{preview_id}/discard",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def discard_ai_edit_preview(
    project_id: int,
    preview_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    """
    Discard a pending AI edit preview.

    Discarding the preview does not modify the story
    or create a new story version.
    """

    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    story_service = StoryService(db)

    preview = story_service.story_edit_preview_repository.get_pending_by_id(
        preview_id=preview_id,
    )

    if preview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending AI edit preview not found.",
        )

    story = story_service.story_repository.get_by_id(
        preview.story_id,
    )

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI edit preview not found.",
        )

    try:
        story_service.discard_ai_edit_preview(
            preview_id=preview_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return None

# ============================================================
# UPLOAD STORY
# ============================================================

@router.post(
    "/projects/{project_id}/stories/upload",
    response_model=StoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_project_story(
    project_id: int,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> StoryResponse:
    """
    Upload an existing story document for an Individual Project.

    Supported formats:
    - PDF
    - DOCX
    - TXT
    """
    project_service = IndividualProjectService(db)

    try:
        project_service.get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required.",
        )

    try:
        _UPLOAD_LIMIT = 10 * 1024 * 1024  # 10 MB
        file_bytes = await file.read(_UPLOAD_LIMIT + 1)

        if len(file_bytes) > _UPLOAD_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="The document must not exceed 10 MB.",
            )

        content = StoryDocumentService.extract_text(
            filename=file.filename,
            file_bytes=file_bytes,
        )

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to extract text from the uploaded file.",
        ) from exc

    filename_without_extension = file.filename.rsplit(
        ".",
        1,
    )[0]

    title = filename_without_extension.strip()

    if not title:
        title = "Uploaded Story"

    story_repository = StoryRepository(db)

    saved_story = story_repository.create_uploaded_story(
        individual_project_id=project_id,
        title=title,
        content=content,
    )

    story_service = StoryService(db)

    story_service.initialize_story_version(
        story_id=saved_story.id,
    )

    return StoryResponse(
        id=saved_story.id,
        individual_project_id=saved_story.individual_project_id,
        title=saved_story.title,
        content=saved_story.content,
        source_type=saved_story.source_type,
    )


@router.post(
    "/projects/{project_id}/stories/{story_id}/storyboard",
    response_model=StoryboardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_storyboard(
    project_id: int,
    story_id: int,
    request: StoryboardGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    project_service = IndividualProjectService(db)

    # 1. Verify that the project belongs to the logged-in user.
    project = project_service.get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # 2. Verify that the story exists and belongs to this project.
    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this project.",
        )

    # 3. Generate and persist the storyboard.
    storyboard_service = StoryboardService(db)

    try:
        return await storyboard_service.generate_storyboard(
            story_id=story_id,
            model_id=request.model_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except StoryboardGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


@router.get(
    "/projects/{project_id}/stories/{story_id}/storyboard",
    response_model=StoryboardResponse,
    status_code=status.HTTP_200_OK,
)
def get_storyboard(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    # 1. Verify that the project belongs to the logged-in user.
    project_service = IndividualProjectService(db)

    project = project_service.get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # 2. Verify that the story exists and belongs to this project.
    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this project.",
        )

    # 3. Retrieve the existing storyboard.
    from app.repositories.storyboard_repository import StoryBoardRepository

    storyboard_repository = StoryBoardRepository(db)
    storyboard = storyboard_repository.get_by_story_id(story_id)

    if storyboard is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storyboard not found. Generate it first.",
        )

    return storyboard


@router.get(
    "/projects/{project_id}/stories/{story_id}/storyboard/details",
    status_code=status.HTTP_200_OK,
)
def get_storyboard_details(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    # 1. Verify project ownership
    project_service = IndividualProjectService(db)
    project = project_service.get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    # 2. Verify that the story belongs to this project
    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=404,
            detail="Story not found in this project.",
        )

    # 3. Retrieve the storyboard
    storyboard_repository = StoryBoardRepository(db)
    storyboard = storyboard_repository.get_by_story_id(story_id)

    if storyboard is None:
        raise HTTPException(
            status_code=404,
            detail="Storyboard not found. Generate it first.",
        )

    # 4. Retrieve normalized records
    storyboard_id = storyboard.id

    characters = (
        db.query(Character)
        .filter(Character.story_board_id == storyboard_id)
        .order_by(Character.id)
        .all()
    )

    locations = (
        db.query(Location)
        .filter(Location.story_board_id == storyboard_id)
        .order_by(Location.id)
        .all()
    )

    scenes = (
        db.query(Scene)
        .filter(Scene.story_board_id == storyboard_id)
        .order_by(Scene.id)
        .all()
    )

    relationships = (
        db.query(CharacterRelationship)
        .filter(CharacterRelationship.story_board_id == storyboard_id)
        .order_by(CharacterRelationship.id)
        .all()
    )

    objects = (
        db.query(StoryObject)
        .filter(StoryObject.story_board_id == storyboard_id)
        .order_by(StoryObject.id)
        .all()
    )

    narrator = (
        db.query(Narrator)
        .filter(Narrator.story_board_id == storyboard_id)
        .first()
    )

    character_ids = [item.id for item in characters]
    scene_ids = [item.id for item in scenes]

    appearances = (
        db.query(CharacterAppearance)
        .filter(CharacterAppearance.character_id.in_(character_ids))
        .all()
        if character_ids
        else []
    )

    scene_characters = (
        db.query(SceneCharacter)
        .filter(SceneCharacter.scene_id.in_(scene_ids))
        .all()
        if scene_ids
        else []
    )

    dialogues = (
        db.query(Dialogue)
        .filter(Dialogue.scene_id.in_(scene_ids))
        .order_by(Dialogue.id)
        .all()
        if scene_ids
        else []
    )

    # 5. Build ID mappings
    character_by_db_id = {item.id: item for item in characters}
    character_db_id_by_json_id = {
        item.character_json_id: item.id for item in characters
    }

    location_json_id_by_db_id = {
        item.id: item.location_json_id for item in locations
    }

    scene_json_id_by_db_id = {
        item.id: item.scene_json_id for item in scenes
    }

    appearances_by_character = {}
    for item in appearances:
        appearances_by_character.setdefault(item.character_id, []).append(item)

    characters_by_scene = {}
    for item in scene_characters:
        characters_by_scene.setdefault(item.scene_id, []).append(item)

    dialogues_by_scene = {}
    for item in dialogues:
        dialogues_by_scene.setdefault(item.scene_id, []).append(item)

    # 6. Storyboard metadata
    storyboard_data = {
        "id": storyboard.id,
        "story_id": storyboard.story_id,
        "title": storyboard.title,
        "metadata": storyboard.metadata_json,
        "status": storyboard.status,
        "created_at": storyboard.created_at,
        "updated_at": storyboard.updated_at,
    }

    # 7. Characters and their appearance histories
    character_data = []

    for item in characters:
        appearance_history = []

        for appearance in appearances_by_character.get(item.id, []):
            appearance_history.append({
                "id": appearance.id,
                "scene_id": scene_json_id_by_db_id.get(appearance.scene_id),
                "age_group": appearance.age_group,
                "physical_traits": appearance.physical_traits,
                "clothing": appearance.clothing,
                "special_features": appearance.special_features,
                "appearance_data": appearance.appearance_data,
            })

        character_data.append({
            "id": item.id,
            "character_json_id": item.character_json_id,
            "name": item.name,
            "aliases": item.aliases,
            "is_revealed": item.is_revealed,
            "revealed_identity": item.revealed_identity,
            "role": item.role,
            "importance": item.importance,
            "first_appearance_scene_id": item.first_appearance_scene_id,
            "description": item.description,
            "appearance": item.appearance,
            "gender": item.gender,
            "age_group": item.age_group,
            "dominant_emotions": item.dominant_emotions,
            "appearance_history": appearance_history,
        })

    # 8. Locations
    location_data = [
        {
            "id": item.id,
            "location_json_id": item.location_json_id,
            "name": item.name,
            "aliases": item.aliases,
            "description": item.description,
            "location_type": item.location_type,
            "first_appearance_scene_id": item.first_appearance_scene_id,
            "location_data": item.location_data,
        }
        for item in locations
    ]

    # 9. Character relationships
    relationship_data = [
        {
            "id": item.id,
            "source_id": item.source_json_id,
            "target_id": item.target_json_id,
            "relationship_type": item.relationship_type,
            "directional": item.directional,
            "description": item.description,
            "relationship_data": item.relationship_data,
        }
        for item in relationships
    ]

    # 10. Story objects
    object_data = [
        {
            "id": item.id,
            "object_json_id": item.object_json_id,
            "name": item.name,
            "aliases": item.aliases,
            "description": item.description,
            "category": item.category,
            "owner_character_id": item.owner_character_json_id,
            "current_location_id": item.current_location_json_id,
            "scene_id": scene_json_id_by_db_id.get(item.scene_id),
            "first_appearance_scene_id": item.first_appearance_scene_id,
            "object_data": item.object_data,
        }
        for item in objects
    ]

    # 11. Narrator
    narrator_data = None

    if narrator is not None:
        narrator_data = {
            "id": narrator.id,
            "present": narrator.present,
            "narrator_json_id": narrator.narrator_json_id,
            "point_of_view": narrator.point_of_view,
            "description": narrator.description,
            "narrator_data": narrator.narrator_data,
        }

    # 12. Scenes, characters present, and dialogues
    scene_data = []

    for scene in scenes:
        characters_present = []

        for scene_character in characters_by_scene.get(scene.id, []):
            character = character_by_db_id.get(scene_character.character_id)

            if character is None:
                continue

            characters_present.append({
                "character_id": character.character_json_id,
                "character_name": character.name,
                "emotion": scene_character.emotion,
                "emotion_intensity": scene_character.emotion_intensity,
            })

        scene_dialogues = [
            {
                "id": dialogue.id,
                "dialogue_json_id": dialogue.dialogue_json_id,
                "speaker_type": dialogue.speaker_type,
                "speaker_id": dialogue.speaker_json_id,
                "speaker_name": dialogue.speaker_name,
                "text": dialogue.dialogue_text,
                "language": dialogue.language,
                "emotion": dialogue.emotion,
                "delivery": dialogue.delivery,
                "dialogue_data": dialogue.dialogue_data,
            }
            for dialogue in dialogues_by_scene.get(scene.id, [])
        ]

        scene_data.append({
            "id": scene.id,
            "scene_json_id": scene.scene_json_id,
            "title": scene.title,
            "importance": scene.importance,
            "summary": scene.summary,
            "primary_action": scene.primary_action,
            "overall_emotion": scene.overall_emotion,
            "visual_description": scene.visual_description,
            "camera_suggestion": scene.camera_suggestion,
            "scene_transition": scene.scene_transition,
            "language": scene.language,
            "extraction_confidence": scene.extraction_confidence,
            "location_id": location_json_id_by_db_id.get(scene.location_id),
            "location": {
                "name": scene.scene_location_name,
                "type": scene.scene_location_type,
                "time_of_day": scene.scene_location_time_of_day,
                "description": scene.scene_location_description,
            },
            "characters_present": characters_present,
            "dialogues": scene_dialogues,
            "scene_data": scene.scene_data,
        })

    return {
        "storyboard": {
            **storyboard_data,
            "storyboard_data": storyboard.storyboard_data,
        },
        "characters": character_data,
        "relationships": relationship_data,
        "locations": location_data,
        "objects": object_data,
        "narrator": narrator_data,
        "scenes": scene_data,
    }



@router.post(
    "/projects/{project_id}/stories/{story_id}/storyboard/upload",
    response_model=StoryboardResponse,
    status_code=status.HTTP_200_OK,
)
async def upload_storyboard(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Verify project ownership.
    project_service = IndividualProjectService(db)
    project = project_service.get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Verify that the story belongs to this project.
    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=404,
            detail="Story not found in this project.",
        )

    # Accept JSON files only.
    if not file.filename or not file.filename.lower().endswith(".json"):
        raise HTTPException(
            status_code=415,
            detail="Please upload a .json storyboard file.",
        )

    try:
        content = await file.read(5 * 1024 * 1024 + 1)

        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Storyboard file must not exceed 5 MB.",
            )

        uploaded_data = json.loads(content.decode("utf-8"))

        if not isinstance(uploaded_data, dict):
            raise HTTPException(
                status_code=400,
                detail="The uploaded JSON must contain a storyboard object.",
            )

    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="The file must use UTF-8 encoding.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON file.",
        ) from exc
    finally:
        await file.close()

    storyboard_service = StoryboardService(db)

    try:
        return storyboard_service.import_storyboard(
            story_id=story_id,
            data=uploaded_data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StoryboardGenerationError as exc:
        # Import validation errors should be reported as client errors,
        # not as LLM generation failures.
        raise HTTPException(status_code=400, detail=str(exc)) from exc


STORYBOARD_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "prompts"
    / "storyboard_schema.json"
)


@router.patch(
    "/projects/{project_id}/stories/{story_id}/storyboard/scenes/{scene_index}/dialogues/{dialogue_index}",
    response_model=StoryboardResponse,
)
def update_storyboard_dialogue(
    project_id: int,
    story_id: int,
    scene_index: int,
    dialogue_index: int,
    request: DialogueUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Change the text of one dialogue line. Scenes and lines are counted from 0 in
    storyboard_data. The storyboard, the scene and the line's own row are all updated.
    """
    project = IndividualProjectService(db).project_repository.get_by_id(
        individual_user_id=current_user.id,
        project_id=project_id,
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    story = StoryRepository(db).get_by_id(story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found in this project.")

    from app.repositories.storyboard_repository import StoryBoardRepository

    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)
    if storyboard is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storyboard not found. Generate it first.")

    try:
        return StoryboardDialogueService(db).update_text(
            storyboard=storyboard,
            scene_index=scene_index,
            dialogue_index=dialogue_index,
            text=request.text,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.patch(
    "/projects/{project_id}/stories/{story_id}/storyboard/scenes/{scene_index}",
    response_model=StoryboardResponse,
)
def update_storyboard_scene(
    project_id: int,
    story_id: int,
    scene_index: int,
    request: SceneFieldsUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Change a scene's "What happens", "What we see" and "Camera" (scenes counted from 0 in storyboard_data).
    The sketches and clips made after this use the new text.
    """
    project = IndividualProjectService(db).project_repository.get_by_id(
        individual_user_id=current_user.id,
        project_id=project_id,
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    story = StoryRepository(db).get_by_id(story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found in this project.")

    from app.repositories.storyboard_repository import StoryBoardRepository

    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)
    if storyboard is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storyboard not found. Generate it first.")

    try:
        return StoryboardDialogueService(db).update_scene(
            storyboard=storyboard,
            scene_index=scene_index,
            fields=request.model_dump(exclude_unset=True),
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get("/storyboard/template")
async def download_storyboard_template():
    if not STORYBOARD_SCHEMA_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Storyboard template file was not found.",
        )

    return FileResponse(
        path=str(STORYBOARD_SCHEMA_PATH),
        media_type="application/json",
        filename="cinemor_storyboard_template.json",
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/storyboard/export",
    status_code=status.HTTP_200_OK,
)
def export_storyboard_json(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Export the complete saved storyboard as a downloadable JSON file."""

    # 1. Verify project ownership.
    project_service = IndividualProjectService(db)
    project = project_service.get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found.",
        )

    # 2. Verify that the story belongs to this project.
    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=404,
            detail="Story not found in this project.",
        )

    # 3. Retrieve the saved storyboard.
    storyboard_repository = StoryBoardRepository(db)
    storyboard = storyboard_repository.get_by_story_id(story_id)

    if storyboard is None:
        raise HTTPException(
            status_code=404,
            detail="Storyboard not found. Generate it first.",
        )

    # 4. Export the original complete storyboard JSON.
    storyboard_data = storyboard.storyboard_data

    if not isinstance(storyboard_data, dict) or not storyboard_data:
        raise HTTPException(
            status_code=422,
            detail="The saved storyboard does not contain valid JSON data.",
        )

    filename = f"cinemor_storyboard_story_{story_id}.json"

    return Response(
        content=json.dumps(
            storyboard_data,
            ensure_ascii=False,
            indent=2,
        ),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/characters",
    response_model=list[StoryboardCharacterResponse],
    status_code=status.HTTP_200_OK,
)
def get_storyboard_characters_for_profiles(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List storyboard characters and their latest saved profiles."""

    project_service = IndividualProjectService(db)
    project = project_service.get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    story_repository = StoryRepository(db)
    story = story_repository.get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=404,
            detail="Story not found in this project.",
        )

    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)

    if storyboard is None:
        raise HTTPException(
            status_code=404,
            detail="Storyboard not found. Generate it first.",
        )

    storyboard_data = storyboard.storyboard_data or {}
    characters = storyboard_data.get("characters", [])

    if not isinstance(characters, list):
        raise HTTPException(
            status_code=422,
            detail="Storyboard characters must be a JSON array.",
        )

    profile_repository = CharacterProfileRepository(db)
    profiles = profile_repository.list_by_storyboard(storyboard.id)

    latest_profiles = {}
    for profile in profiles:
        current = latest_profiles.get(profile.character_json_id)
        if current is None or (
            profile.version,
            profile.id,
        ) > (
            current.version,
            current.id,
        ):
            latest_profiles[profile.character_json_id] = profile

    result = []

    for character in characters:
        if not isinstance(character, dict):
            continue

        character_id = character.get("character_id")
        if not isinstance(character_id, int) or isinstance(character_id, bool):
            continue

        result.append(
            StoryboardCharacterResponse(
                character_id=character_id,
                name=str(character.get("name") or "Unnamed Character"),
                description=str(character.get("description") or ""),
                role=str(character.get("role") or ""),
                gender=str(character.get("gender") or ""),
                age_group=str(character.get("age_group") or ""),
                appearance=(
                    character.get("appearance")
                    if isinstance(character.get("appearance"), dict)
                    else {}
                ),
                dominant_emotions=(
                    character.get("dominant_emotions")
                    if isinstance(character.get("dominant_emotions"), list)
                    else []
                ),
                profile=latest_profiles.get(character_id),
            )
        )

    return result



@router.post(
    "/projects/{project_id}/stories/{story_id}/characters/{character_id}/profile",
    response_model=CharacterProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_character_profile(
    project_id: int,
    story_id: int,
    character_id: int,
    request: CharacterProfileGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    # 1. Validate project ownership.
    project = IndividualProjectService(db).get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # 2. Validate that the story belongs to this project.
    story = StoryRepository(db).get_by_id(story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this project.",
        )

    # 3. Find the storyboard.
    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)
    if storyboard is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storyboard not found. Generate it first.",
        )

    # 4. Confirm the selected character exists in this storyboard.
    storyboard_data = storyboard.storyboard_data or {}
    characters = storyboard_data.get("characters", [])

    character = next(
        (
            item
            for item in characters
            if isinstance(item, dict)
            and str(item.get("character_id")) == str(character_id)
        ),
        None,
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found in this storyboard.",
        )

    # 5. Resolve the model from the request or the associated story.
    model_id = request.model_id or getattr(story, "model_id", None)
    if not model_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide model_id; no model is configured for this story.",
        )

    # 6. Generate and persist the profile.
    import logging

    logger = logging.getLogger(__name__)
    service = CharacterProfileGenerationService(db)
    try:
        return await service.generate_storyboard_character_profile(
            storyboard_id=storyboard.id,
            character_json_id=character_id,
            style_name=request.style_name,
            style_instructions=request.style_instructions,
            customization_instructions=request.customization_instructions,
            reference_information=request.reference_information,
            model_id=model_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Character profile route failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Character profile generation failed. Check the server logs.",
        ) from exc


@router.get(
    "/projects/{project_id}/stories/{story_id}/characters/{character_id}/profile",
    response_model=CharacterProfileResponse,
    status_code=status.HTTP_200_OK,
)
def get_character_profile(
    project_id: int,
    story_id: int,
    character_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    # Verify project ownership.
    project = IndividualProjectService(db).get_project(
        individual_user_id=current_user.id,
        project_id=project_id,
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # Verify story ownership.
    story = StoryRepository(db).get_by_id(story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this project.",
        )

    # Find the storyboard.
    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)
    if storyboard is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storyboard not found.",
        )

    # Verify that the character exists in the storyboard.
    characters = (storyboard.storyboard_data or {}).get("characters", [])
    character_exists = any(
        isinstance(character, dict)
        and str(character.get("character_id")) == str(character_id)
        for character in characters
    )
    if not character_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found in this storyboard.",
        )

    # Return the latest saved profile.
    profile = CharacterProfileRepository(db).get_latest(
        storyboard_id=storyboard.id,
        character_json_id=character_id,
    )
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile has been generated for this character yet.",
        )

    return profile


class ProfileFieldsUpdateRequest(BaseModel):
    """Details of a profile changed by hand: {"nose_shape": "straight", "upper_clothing": "red kurta, gold sash"}."""

    fields: dict[str, str] = Field(..., min_length=1, max_length=40)


@router.patch(
    "/projects/{project_id}/stories/{story_id}/characters/{character_id}/profile",
    response_model=CharacterProfileResponse,
)
def update_character_profile(
    project_id: int,
    story_id: int,
    character_id: int,
    request: ProfileFieldsUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Change details of the character's latest profile; the next master image follows them."""
    from app.services.profile_edit_service import ProfileEditService

    _, storyboard = validate_character_image_context(db=db, current_user=current_user, project_id=project_id, story_id=story_id)
    service = ProfileEditService(db)
    try:
        return service.update(service.latest_character(storyboard.id, character_id), request.fields, schema="character_profile_schema.json")
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.patch(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/profile",
    response_model=LocationProfileResponse,
)
def update_location_profile(
    project_id: int,
    story_id: int,
    location_id: int,
    request: ProfileFieldsUpdateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Change details of the location's latest profile; the next master image follows them."""
    from app.services.profile_edit_service import ProfileEditService

    _, storyboard = validate_location_image_context(db=db, current_user=current_user, project_id=project_id, story_id=story_id)
    service = ProfileEditService(db)
    try:
        return service.update(service.latest_location(storyboard.id, location_id), request.fields, schema="location_profile_schema.json")
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def validate_character_image_context(
    *,
    db: Session,
    current_user: CurrentUser,
    project_id: int,
    story_id: int,
):
    try:
        project = IndividualProjectService(db).get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )
    except ValueError:
        project = None
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    story = StoryRepository(db).get_by_id(story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this project.",
        )

    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)
    if storyboard is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storyboard not found.",
        )

    return story, storyboard


@router.post(
    "/projects/{project_id}/stories/{story_id}/characters/"
    "{character_id}/master-image",
    response_model=CharacterMasterImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_character_master_image(
    project_id: int,
    story_id: int,
    character_id: int,
    request: MasterImageGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_character_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = CharacterMasterImageService(db)

    try:
        return await service.generate(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            character_id=character_id,
            image_type=request.image_type,
            model_id=request.model_id,
            customization_instructions=request.customization_instructions,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Master-image generation failed. Check server logs.",
        ) from exc


@router.post(
    "/projects/{project_id}/stories/{story_id}/characters/"
    "{character_id}/master-image/upload",
    response_model=CharacterMasterImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_character_master_image(
    project_id: int,
    story_id: int,
    character_id: int,
    image: UploadFile = File(...),
    image_type: str = Form("user_upload"),
    current_user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_character_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = CharacterMasterImageUploadService(db)

    try:
        return await service.upload(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            character_id=character_id,
            image_type=image_type,
            upload=image,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    finally:
        await image.close()


@router.get(
    "/projects/{project_id}/stories/{story_id}/characters/"
    "{character_id}/master-image/preview",
)
def preview_character_master_image(
    project_id: int,
    story_id: int,
    character_id: int,
    image_type: str = "canonical",
    current_user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_character_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    if image_type not in {"canonical", "reference_sheet", "user_upload"}:
        raise HTTPException(400, "Invalid image_type.")

    image = CharacterMasterImageRepository(db).get_latest(
        storyboard_id=storyboard.id,
        character_json_id=character_id,
        image_type=image_type,
    )
    if image is None or not image.storage_key:
        raise HTTPException(404, "Image not found.")

    storage = CharacterMasterImageStorage()
    root = storage.storage_dir.resolve()
    path = (root / image.storage_key).resolve()

    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Stored image file not found.")

    return FileResponse(
        path=path,
        media_type=image.mime_type or "image/png",
        filename=path.name,
        content_disposition_type="inline",
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/characters/"
    "{character_id}/master-image/download",
)
def download_character_master_image(
    project_id: int,
    story_id: int,
    character_id: int,
    image_type: str = "canonical",
    current_user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_character_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    if image_type not in {"canonical", "reference_sheet", "user_upload"}:
        raise HTTPException(400, "Invalid image_type.")

    image = CharacterMasterImageRepository(db).get_latest(
        storyboard_id=storyboard.id,
        character_json_id=character_id,
        image_type=image_type,
    )
    if image is None or not image.storage_key:
        raise HTTPException(404, "Image not found.")

    storage = CharacterMasterImageStorage()
    root = storage.storage_dir.resolve()
    path = (root / image.storage_key).resolve()

    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Stored image file not found.")

    return FileResponse(
        path=path,
        media_type=image.mime_type or "image/png",
        filename=f"{image.character_name}_{image.image_type}_v{image.version}.png",
        content_disposition_type="attachment",
    )


def validate_location_image_context(
    *,
    db: Session,
    current_user: CurrentUser,
    project_id: int,
    story_id: int,
):
    try:
        project = IndividualProjectService(db).get_project(
            individual_user_id=current_user.id,
            project_id=project_id,
        )
    except ValueError:
        project = None

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    story = StoryRepository(db).get_by_id(story_id)

    if story is None or story.individual_project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this project.",
        )

    storyboard = StoryBoardRepository(db).get_by_story_id(story_id)

    if storyboard is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storyboard not found. Generate it first.",
        )

    return story, storyboard


@router.post(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/profile",
    response_model=LocationProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_location_profile(
    project_id: int,
    story_id: int,
    location_id: int,
    request: LocationProfileGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = LocationProfileGenerationService(db)

    try:
        return await service.generate_storyboard_location_profile(
            storyboard_id=storyboard.id,
            location_json_id=location_id,
            style_name=request.style_name,
            style_instructions=request.style_instructions,
            customization_instructions=request.customization_instructions,
            reference_information=request.reference_information,
            model_id=request.model_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception(
            "Location profile generation failed"
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Location profile generation failed. Check server logs.",
        ) from exc


@router.get(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/profile",
    response_model=LocationProfileResponse,
    status_code=status.HTTP_200_OK,
)
def get_location_profile(
    project_id: int,
    story_id: int,
    location_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    locations = (storyboard.storyboard_data or {}).get("locations", [])

    exists = any(
        isinstance(item, dict)
        and str(item.get("location_id", item.get("id", "")))
        == str(location_id)
        for item in locations
    )

    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found in this storyboard.",
        )

    profile = (
        db.query(LocationProfile)
        .filter(
            LocationProfile.story_board_id == storyboard.id,
            LocationProfile.location_json_id == location_id,
        )
        .order_by(
            LocationProfile.version.desc(),
            LocationProfile.id.desc(),
        )
        .first()
    )

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile has been generated for this location yet.",
        )

    return profile


@router.get(
    "/projects/{project_id}/stories/{story_id}/locations",
    status_code=status.HTTP_200_OK,
)
def get_storyboard_locations_for_profiles(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    locations = (storyboard.storyboard_data or {}).get("locations", [])

    if not isinstance(locations, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Storyboard locations must be a JSON array.",
        )

    profiles = (
        db.query(LocationProfile)
        .filter(LocationProfile.story_board_id == storyboard.id)
        .order_by(
            LocationProfile.version.desc(),
            LocationProfile.id.desc(),
        )
        .all()
    )

    latest_profiles = {}
    for profile in profiles:
        if profile.location_json_id not in latest_profiles:
            latest_profiles[profile.location_json_id] = profile

    result = []

    for location in locations:
        if not isinstance(location, dict):
            continue

        location_id = location.get(
            "location_id", location.get("id")
        )

        if not isinstance(location_id, int) or isinstance(location_id, bool):
            continue

        result.append({
            "location_id": location_id,
            "name": str(
                location.get("name")
                or location.get("location_name")
                or "Unnamed Location"
            ),
            "description": str(location.get("description") or ""),
            "profile": latest_profiles.get(location_id),
        })

    return result


@router.post(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/master-image",
    response_model=LocationMasterImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_location_master_image(
    project_id: int,
    story_id: int,
    location_id: int,
    request: LocationMasterImageGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = LocationMasterImageService(db)

    try:
        return await service.generate(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            location_id=location_id,
            image_type=request.image_type,
            model_id=request.model_id,
            customization_instructions=request.prompt or "",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception(
            "Location master-image generation failed"
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Location master-image generation failed. Check server logs.",
        ) from exc


@router.post(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/master-image/upload",
    response_model=LocationMasterImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_location_master_image(
    project_id: int,
    story_id: int,
    location_id: int,
    image: UploadFile = File(...),
    current_user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = LocationMasterImageUploadService(db)

    try:
        return await service.upload(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            location_id=location_id,
            upload=image,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception(
            "Location master-image upload failed"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Location image upload failed. Check server logs.",
        ) from exc
    finally:
        await image.close()



@router.get(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/master-image/preview",
)
def preview_location_master_image(
    project_id: int,
    story_id: int,
    location_id: int,
    image_type: str = "canonical",
    current_user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    if image_type not in {"canonical", "user_upload"}:
        raise HTTPException(400, "Invalid image_type.")

    image = LocationMasterImageRepository(db).get_latest(
        storyboard_id=storyboard.id,
        location_json_id=location_id,
        image_type=image_type,
    )

    if image is None or not image.storage_key:
        raise HTTPException(404, "Image not found.")

    storage = LocationMasterImageStorage()
    root = storage.storage_dir.resolve()
    path = (root / image.storage_key).resolve()

    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Stored image file not found.")

    return FileResponse(
        path=path,
        media_type=image.mime_type or "image/png",
        filename=path.name,
        content_disposition_type="inline",
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/locations/{location_id}/master-image/download",
)
def download_location_master_image(
    project_id: int,
    story_id: int,
    location_id: int,
    image_type: str = "canonical",
    current_user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    if image_type not in {"canonical", "user_upload"}:
        raise HTTPException(400, "Invalid image_type.")

    image = LocationMasterImageRepository(db).get_latest(
        storyboard_id=storyboard.id,
        location_json_id=location_id,
        image_type=image_type,
    )

    if image is None or not image.storage_key:
        raise HTTPException(404, "Image not found.")

    storage = LocationMasterImageStorage()
    root = storage.storage_dir.resolve()
    path = (root / image.storage_key).resolve()

    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Stored image file not found.")

    safe_name = "".join(
        char if char.isalnum() or char in "-_" else "_"
        for char in image.location_name
    )

    return FileResponse(
        path=path,
        media_type=image.mime_type or "image/png",
        filename=f"{safe_name}_{image.image_type}_v{image.version}",
        content_disposition_type="attachment",
    )

@router.get(
    "/projects/{project_id}/stories/{story_id}/scenes",
    status_code=status.HTTP_200_OK,
)
def get_storyboard_scenes_for_sketches(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    storyboard_scenes = (storyboard.storyboard_data or {}).get("scenes", [])

    if not isinstance(storyboard_scenes, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Storyboard scenes must be a JSON array.",
        )

    db_scenes = (
        db.query(Scene)
        .filter(Scene.story_board_id == storyboard.id)
        .order_by(Scene.id.asc())
        .all()
    )

    if len(db_scenes) != len(storyboard_scenes):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Storyboard scenes and database scenes do not match. "
                "Check scene synchronization before generating sketches."
            ),
        )

    result = []

    for storyboard_scene, db_scene in zip(storyboard_scenes, db_scenes):
        if not isinstance(storyboard_scene, dict):
            continue

        result.append({
            "id": db_scene.id,
            "scene_id": db_scene.id,
            "title": str(
                storyboard_scene.get("title")
                or storyboard_scene.get("scene_title")
                or f"Scene {db_scene.id}"
            ),
            "summary": str(storyboard_scene.get("summary") or ""),
            "description": str(
                storyboard_scene.get("visual_description")
                or storyboard_scene.get("description")
                or ""
            ),
            "location_id": storyboard_scene.get("location_id"),
        })

    return result

@router.post(
    "/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches/auto",
    status_code=status.HTTP_201_CREATED,
)
async def generate_scene_sketches_automatically(
    project_id: int,
    story_id: int,
    scene_id: int,
    request: AutoSceneSketchRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = SceneSketchService(db)

    try:
        sketches = await service.generate_many(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            scene_id=scene_id,
            model_id=request.model_id,
            max_sketches=request.max_sketches,
            customization_instructions=request.prompt or "",
        )

        return {
            "scene_id": scene_id,
            "total": len(sketches),
            "sketches": sketches,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Automatic scene sketch generation failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Automatic scene sketch generation failed.",
        ) from exc


@router.post(
    "/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches",
    response_model=SceneSketchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_scene_sketch(
    project_id: int,
    story_id: int,
    scene_id: int,
    request: SceneSketchGenerateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    service = SceneSketchService(db)

    try:
        return await service.generate(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            scene_id=scene_id,
            sketch_number=request.sketch_number,
            model_id=request.model_id,
            title=request.title,
            description=request.description,
            camera_details=request.camera_details,
            customization_instructions=request.prompt or "",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception(
            "Scene sketch generation failed"
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Scene sketch generation failed. Check server logs.",
        ) from exc

@router.post(
    "/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches/upload",
    response_model=SceneSketchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_scene_sketch(
    project_id: int,
    story_id: int,
    scene_id: int,
    current_user: CurrentUser,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload the creator's own image as a scene's sketch."""
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    try:
        image_bytes = await image.read(10 * 1024 * 1024 + 1)

        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="The image must not exceed 10 MB.",
            )

        return SceneSketchService(db).upload(
            project_id=project_id,
            story_id=story_id,
            storyboard_id=storyboard.id,
            scene_id=scene_id,
            image_bytes=image_bytes,
            original_filename=image.filename or "",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    finally:
        await image.close()

@router.get(
    "/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches",
    response_model=SceneSketchListResponse,
)
async def list_scene_sketches(
    project_id: int,
    story_id: int,
    scene_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    scene = (
        db.query(Scene)
        .filter(
            Scene.id == scene_id,
            Scene.story_board_id == storyboard.id,
        )
        .first()
    )

    if scene is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scene not found in this storyboard.",
        )

    sketches = SceneSketchService(db).repository.list_by_scene(
        scene_id=scene_id
    )

    return SceneSketchListResponse(
        sketches=sketches,
        total=len(sketches),
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches/{sketch_id}/preview",
)
def preview_scene_sketch(
    project_id: int,
    story_id: int,
    scene_id: int,
    sketch_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    scene = (
        db.query(Scene)
        .filter(
            Scene.id == scene_id,
            Scene.story_board_id == storyboard.id,
        )
        .first()
    )

    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found.")

    sketch = (
        db.query(SceneSketch)
        .filter(
            SceneSketch.id == sketch_id,
            SceneSketch.scene_id == scene_id,
            SceneSketch.status == "generated",
        )
        .first()
    )

    if sketch is None or not sketch.storage_key:
        raise HTTPException(status_code=404, detail="Generated sketch not found.")



    storage = SceneSketchStorage()
    root = storage.storage_dir.resolve()
    file_path = (root / sketch.storage_key).resolve()

    if root not in file_path.parents or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Sketch image file not found.")


    return FileResponse(
        path=str(file_path),
        media_type=sketch.mime_type or "image/png",
        headers={
            "Content-Disposition": (
                f'inline; filename="scene-{scene_id}-sketch-{sketch_id}.png"'
            )
        },
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches/{sketch_id}/download",
)
def download_scene_sketch(
    project_id: int,
    story_id: int,
    scene_id: int,
    sketch_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    scene = (
        db.query(Scene)
        .filter(
            Scene.id == scene_id,
            Scene.story_board_id == storyboard.id,
        )
        .first()
    )
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found.")

    sketch = (
        db.query(SceneSketch)
        .filter(
            SceneSketch.id == sketch_id,
            SceneSketch.scene_id == scene_id,
            SceneSketch.status == "generated",
        )
        .first()
    )
    if sketch is None or not sketch.storage_key:
        raise HTTPException(status_code=404, detail="Generated sketch not found.")

    storage = SceneSketchStorage()
    root = storage.storage_dir.resolve()
    file_path = (root / sketch.storage_key).resolve()

    if root not in file_path.parents or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Sketch image file not found.")

    return FileResponse(
        path=str(file_path),
        media_type=sketch.mime_type or "image/png",
        filename=f"scene-{scene_id}-sketch-{sketch_id}.png",
        headers={"Content-Disposition": (
            f'attachment; filename="scene-{scene_id}-sketch-{sketch_id}.png"'
        )},
    )

def _run_video_generation_background(job_id: int) -> None:
    """Run generation using a dedicated database session."""
    db = SessionLocal()
    try:
        VideoGenerationService(db).run_job(job_id)
    finally:
        db.close()


@router.post(
    "/projects/{project_id}/stories/{story_id}/video-generation",
    response_model=VideoGenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_video_generation(
    project_id: int,
    story_id: int,
    background_tasks: BackgroundTasks,
    request: VideoGenerationRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    if request.story_id != story_id:
        raise HTTPException(
            status_code=400,
            detail="The request story_id does not match the URL.",
        )

    if request.project_id is not None and request.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="The request project_id does not match the URL.",
        )

    if request.provider != "openrouter":
        raise HTTPException(
            status_code=400,
            detail="Only the OpenRouter provider is supported.",
        )

    try:
        service = VideoGenerationService(db)
        job = service.create_job(
            story_id=story_id,
            project_id=project_id,
            generation_mode=request.generation_mode,
            provider="openrouter",
            model_name=request.model_name,
            scene_ids=request.scene_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(
        _run_video_generation_background,
        job.id,
    )

    return job


@router.get(
    # ":int" so this route only matches numeric IDs; otherwise it would also
    # catch ".../video-generation/latest" (declared further down) and fail with 422.
    "/projects/{project_id}/stories/{story_id}/video-generation/{job_id:int}",
    response_model=VideoGenerationJobResponse,
)
def get_video_generation_status(
    project_id: int,
    story_id: int,
    job_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    job = (
        db.query(VideoGenerationJob)
        .filter(
            VideoGenerationJob.id == job_id,
            VideoGenerationJob.story_id == story_id,
            VideoGenerationJob.project_id == project_id,
        )
        .first()
    )

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Video generation job not found.",
        )

    return job


@router.get(
    "/projects/{project_id}/stories/{story_id}/video-clips",
    response_model=list[SceneVideoClipResponse],
)
def list_video_clips(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    scene_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    scene_query = db.query(Scene).filter(
        Scene.story_board_id == storyboard.id
    )

    if scene_id is not None:
        scene_query = scene_query.filter(Scene.id == scene_id)

    scenes = scene_query.order_by(Scene.id.asc()).all()

    if scene_id is not None and not scenes:
        raise HTTPException(
            status_code=404,
            detail="Scene not found in this storyboard.",
        )

    scene_ids = [scene.id for scene in scenes]

    if not scene_ids:
        return []

    return (
        db.query(SceneVideoClip)
        .filter(SceneVideoClip.scene_id.in_(scene_ids))
        .order_by(
            SceneVideoClip.scene_id.asc(),
            SceneVideoClip.clip_number.asc(),
            SceneVideoClip.version.desc(),
        )
        .all()
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/video-clips/{clip_id}/download",
)
def download_video_clip(
    project_id: int,
    story_id: int,
    clip_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    _, storyboard = validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    clip = (
        db.query(SceneVideoClip)
        .join(Scene, Scene.id == SceneVideoClip.scene_id)
        .filter(
            SceneVideoClip.id == clip_id,
            Scene.story_board_id == storyboard.id,
            SceneVideoClip.status == "generated",
        )
        .first()
    )

    if clip is None or not clip.storage_key:
        raise HTTPException(
            status_code=404,
            detail="Generated video clip not found.",
        )

    storage = SceneVideoStorage()
    video_path = (storage.storage_dir / clip.storage_key).resolve()

    if (
        storage.storage_dir not in video_path.parents
        or not video_path.is_file()
    ):
        raise HTTPException(
            status_code=404,
            detail="The video file is missing from storage.",
        )

    return FileResponse(
        path=str(video_path),
        media_type=clip.mime_type or "video/mp4",
        filename=f"scene_{clip.scene_id}_clip_{clip.id}.mp4",
    )

@router.post(
    "/projects/{project_id}/stories/{story_id}/video-generation/{job_id}/assemble"
)
def assemble_story_video(
    project_id: int,
    story_id: int,
    job_id: int,
    scene_ids: list[int] = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from pathlib import Path

    from fastapi import HTTPException
    from app.models import Scene, SceneVideoClip, VideoGenerationJob
    from app.services.scene_video_storage import SceneVideoStorage
    from app.services.video_assembly_service import (
        VideoAssemblyService,
        VideoAssemblyError,
    )

    # Ownership: the story must belong to this user's project.
    validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    job = (
        db.query(VideoGenerationJob)
        .filter(
            VideoGenerationJob.id == job_id,
            VideoGenerationJob.story_id == story_id,
            VideoGenerationJob.project_id == project_id,
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found")

    if not scene_ids or len(scene_ids) != len(set(scene_ids)):
        raise HTTPException(
            status_code=400,
            detail="Provide unique scene_ids in the desired order",
        )

    scenes = (
        db.query(Scene)
        .filter(Scene.id.in_(scene_ids))
        .all()
    )
    if {scene.id for scene in scenes} != set(scene_ids):
        raise HTTPException(status_code=404, detail="One or more scenes not found")

    # Verify that every requested scene belongs to this story.
    storyboards = {
        storyboard.id
        for storyboard in db.query(StoryBoard)
        .filter(StoryBoard.story_id == story_id)
        .all()
    }
    if any(scene.story_board_id not in storyboards for scene in scenes):
        raise HTTPException(
            status_code=400,
            detail="A requested scene does not belong to this story",
        )

    storage = SceneVideoStorage()
    clip_paths = []

    for scene_id in scene_ids:
        clip = (
            db.query(SceneVideoClip)
            .filter(
                SceneVideoClip.scene_id == scene_id,
                SceneVideoClip.status == "generated",
            )
            .order_by(
                SceneVideoClip.version.desc(),
                SceneVideoClip.id.desc(),
            )
            .first()
        )
        if not clip or not clip.storage_key:
            raise HTTPException(
                status_code=400,
                detail=f"No generated clip found for scene {scene_id}",
            )

        clip_path = (storage.storage_dir / clip.storage_key).resolve()
        if (
            storage.storage_dir.resolve() not in clip_path.parents
            or not clip_path.is_file()
        ):
            raise HTTPException(
                status_code=404,
                detail=f"Video file missing for scene {scene_id}",
            )

        clip_paths.append(str(clip_path))

    try:
        assembler = VideoAssemblyService()
        output_path = assembler.assemble(
            clip_paths,
            output_filename=f"story_{story_id}_job_{job_id}.mp4",
        )
    except VideoAssemblyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    job.output_storage_key = str(output_path.resolve())
    job.status = "completed"
    db.commit()

    return {
        "message": "Video assembled successfully",
        "job_id": job_id,
        "scene_ids": scene_ids,
        "clip_count": len(clip_paths),
        "download_endpoint": (
            f"/api/individual/projects/{project_id}/stories/{story_id}"
            f"/video-generation/{job_id}/download"
        ),
    }


@router.get(
    "/projects/{project_id}/stories/{story_id}/video-generation/{job_id}/download",
)
def download_story_video(
    project_id: int,
    story_id: int,
    job_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    job = (
        db.query(VideoGenerationJob)
        .filter(
            VideoGenerationJob.id == job_id,
            VideoGenerationJob.story_id == story_id,
            VideoGenerationJob.project_id == project_id,
            VideoGenerationJob.status == "completed",
        )
        .first()
    )

    if job is None or not job.output_storage_key:
        raise HTTPException(
            status_code=404,
            detail="Completed story video not found.",
        )

    from pathlib import Path

    output_dir = VideoAssemblyService().output_dir.resolve()
    stored_path = Path(job.output_storage_key)

    output_path = (
        stored_path.resolve()
        if stored_path.is_absolute()
        else (output_dir / stored_path).resolve()
    )

    if output_dir not in output_path.parents or not output_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Assembled MP4 file is missing.",
        )

    return FileResponse(
        path=str(output_path),
        media_type="video/mp4",
        filename=f"story_{story_id}_final.mp4",
    )


@router.get(
    "/projects/{project_id}/stories/{story_id}/video-generation/latest",
)
def get_latest_video_generation(
    project_id: int,
    story_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    validate_location_image_context(
        db=db,
        current_user=current_user,
        project_id=project_id,
        story_id=story_id,
    )

    job = (
        db.query(VideoGenerationJob)
        .filter(
            VideoGenerationJob.project_id == project_id,
            VideoGenerationJob.story_id == story_id,
        )
        .order_by(VideoGenerationJob.id.desc())
        .first()
    )

    return job
"""
Deleting the work made for a story (individual projects; organization projects reach these through
/api/employee/projects/{id}/work/..., where the role and the stage are checked first).

    DELETE /api/individual/projects/{id}/stories/{story_id}/storyboard
           the storyboard and everything made from it: characters and locations (profiles, images),
           scenes, sketches, clips and films. The story itself stays.
    DELETE .../characters/{character_id}/master-image?image_type=canonical|user_upload
           a character's generated image (canonical, with its reference sheets) or the uploaded one
    DELETE .../locations/{location_id}/master-image?image_type=canonical|user_upload
           the same for a location
    DELETE .../scenes/{scene_id}/sketches/{sketch_id}
           one sketch of a scene
    DELETE .../video-clips/{clip_id}
           one scene's clip
    DELETE .../video-generation/{job_id}
           a joined film (not while it is still being made); the clips stay and can be joined again

Rows are removed with SQL deletes, so the database's ON DELETE CASCADE rules remove what hangs off
them. Stored files of the removed images, sketches, clips and films are deleted too (best effort).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.models.character_master_image import CharacterMasterImage
from app.models.location_master_image import LocationMasterImage
from app.models.scene_sketch import SceneSketch
from app.models.scene_video_clip import SceneVideoClip
from app.models.scenes import Scene
from app.models.story import Story
from app.models.story_board import StoryBoard
from app.models.video_generation_job import VideoGenerationJob
from app.services.character_master_image_storage import CharacterMasterImageStorage
from app.services.individual_project_service import IndividualProjectService
from app.services.location_master_image_storage import LocationMasterImageStorage
from app.services.scene_sketch_storage import SceneSketchStorage
from app.services.scene_video_storage import SceneVideoStorage

router = APIRouter(prefix="/api/individual", tags=["Individual Dashboard: delete work"])

_RUNNING_JOB = {"queued", "planning", "generating", "assembling"}


def _story(db: Session, user_id: int, project_id: int, story_id: int) -> Story:
    """The story, when it is in this person's project (404 otherwise)."""
    try:
        IndividualProjectService(db).get_project(individual_user_id=user_id, project_id=project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    story = db.get(Story, story_id)
    if story is None or story.individual_project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found in this project.")
    return story


def _board_ids(db: Session, story_id: int) -> list[int]:
    return [b.id for b in db.query(StoryBoard.id).filter(StoryBoard.story_id == story_id).all()]


def _remove_file(root: Path, key: str | None) -> None:
    """Delete a stored file (only inside its storage folder); a missing file is fine."""
    if not key:
        return
    try:
        root = root.resolve()
        path = Path(key) if Path(key).is_absolute() else root / key
        path = path.resolve()
        if root in path.parents and path.is_file():
            path.unlink()
    except OSError:
        pass


def _remove_any_file(key: str | None) -> None:
    """A film's output path is stored as an absolute path."""
    if not key:
        return
    try:
        path = Path(key).resolve()
        if path.is_file():
            path.unlink()
    except OSError:
        pass


# ---------------------------------------------------------------------------------------------- storyboard
@router.delete("/projects/{project_id}/stories/{story_id}/storyboard", status_code=status.HTTP_204_NO_CONTENT)
def delete_storyboard(project_id: int, story_id: int, current_user: CurrentUser, db: Session = Depends(get_db)) -> None:
    _story(db, current_user.id, project_id, story_id)
    boards = _board_ids(db, story_id)
    if not boards:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This story has no storyboard.")
    jobs = db.query(VideoGenerationJob).filter(VideoGenerationJob.story_id == story_id).all()
    if any(j.status in _RUNNING_JOB for j in jobs):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Clips are being made for this story. Wait until they are ready, then delete the storyboard.")

    scene_ids = [s.id for s in db.query(Scene.id).filter(Scene.story_board_id.in_(boards)).all()]
    files = (
        [(CharacterMasterImageStorage().storage_dir, i.storage_key) for i in db.query(CharacterMasterImage).filter(CharacterMasterImage.story_board_id.in_(boards)).all()]
        + [(LocationMasterImageStorage().storage_dir, i.storage_key) for i in db.query(LocationMasterImage).filter(LocationMasterImage.story_board_id.in_(boards)).all()]
    )
    if scene_ids:
        files += [(SceneSketchStorage().storage_dir, s.storage_key) for s in db.query(SceneSketch).filter(SceneSketch.scene_id.in_(scene_ids)).all()]
        files += [(SceneVideoStorage().storage_dir, c.storage_key) for c in db.query(SceneVideoClip).filter(SceneVideoClip.scene_id.in_(scene_ids)).all()]
    films = [j.output_storage_key for j in jobs]

    db.query(VideoGenerationJob).filter(VideoGenerationJob.story_id == story_id).delete(synchronize_session=False)
    db.query(StoryBoard).filter(StoryBoard.id.in_(boards)).delete(synchronize_session=False)
    db.commit()
    for root, key in files:
        _remove_file(root, key)
    for key in films:
        _remove_any_file(key)


# ------------------------------------------------------------------------------------ character / location images
def _image_types(image_type: str) -> list[str]:
    if image_type == "user_upload":
        return ["user_upload"]
    if image_type in ("canonical", "generated"):
        return ["canonical", "reference_sheet"]
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image_type must be canonical or user_upload.")


def _delete_images(db: Session, model, storage_dir: Path, json_field: str, story_id: int, item_id: int, image_type: str) -> None:
    boards = _board_ids(db, story_id)
    if not boards:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This story has no storyboard.")
    query = db.query(model).filter(
        model.story_board_id.in_(boards),
        getattr(model, json_field) == item_id,
        model.image_type.in_(_image_types(image_type)),
    )
    rows = query.all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")
    keys = [r.storage_key for r in rows]
    query.delete(synchronize_session=False)
    db.commit()
    for key in keys:
        _remove_file(storage_dir, key)


@router.delete("/projects/{project_id}/stories/{story_id}/characters/{character_id}/master-image", status_code=status.HTTP_204_NO_CONTENT)
def delete_character_image(project_id: int, story_id: int, character_id: int, current_user: CurrentUser, image_type: str = "canonical", db: Session = Depends(get_db)) -> None:
    _story(db, current_user.id, project_id, story_id)
    _delete_images(db, CharacterMasterImage, CharacterMasterImageStorage().storage_dir, "character_json_id", story_id, character_id, image_type)


@router.delete("/projects/{project_id}/stories/{story_id}/locations/{location_id}/master-image", status_code=status.HTTP_204_NO_CONTENT)
def delete_location_image(project_id: int, story_id: int, location_id: int, current_user: CurrentUser, image_type: str = "canonical", db: Session = Depends(get_db)) -> None:
    _story(db, current_user.id, project_id, story_id)
    _delete_images(db, LocationMasterImage, LocationMasterImageStorage().storage_dir, "location_json_id", story_id, location_id, image_type)


# ---------------------------------------------------------------------------------------------------- sketches
@router.delete("/projects/{project_id}/stories/{story_id}/scenes/{scene_id}/sketches/{sketch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sketch(project_id: int, story_id: int, scene_id: int, sketch_id: int, current_user: CurrentUser, db: Session = Depends(get_db)) -> None:
    _story(db, current_user.id, project_id, story_id)
    boards = _board_ids(db, story_id)
    sketch = (
        db.query(SceneSketch)
        .join(Scene, Scene.id == SceneSketch.scene_id)
        .filter(SceneSketch.id == sketch_id, SceneSketch.scene_id == scene_id, Scene.story_board_id.in_(boards or [-1]))
        .first()
    )
    if sketch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sketch not found.")
    key = sketch.storage_key
    db.query(SceneSketch).filter(SceneSketch.id == sketch.id).delete(synchronize_session=False)
    db.commit()
    _remove_file(SceneSketchStorage().storage_dir, key)


# -------------------------------------------------------------------------------------------- clips and films
@router.delete("/projects/{project_id}/stories/{story_id}/video-clips/{clip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clip(project_id: int, story_id: int, clip_id: int, current_user: CurrentUser, db: Session = Depends(get_db)) -> None:
    _story(db, current_user.id, project_id, story_id)
    boards = _board_ids(db, story_id)
    clip = (
        db.query(SceneVideoClip)
        .join(Scene, Scene.id == SceneVideoClip.scene_id)
        .filter(SceneVideoClip.id == clip_id, Scene.story_board_id.in_(boards or [-1]))
        .first()
    )
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if clip.status in ("pending", "queued", "generating"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This clip is still being made. Wait until it is ready, then delete it.")
    key = clip.storage_key
    db.query(SceneVideoClip).filter(SceneVideoClip.previous_clip_id == clip.id).update({SceneVideoClip.previous_clip_id: None}, synchronize_session=False)
    db.query(SceneVideoClip).filter(SceneVideoClip.id == clip.id).delete(synchronize_session=False)
    db.commit()
    _remove_file(SceneVideoStorage().storage_dir, key)


@router.delete("/projects/{project_id}/stories/{story_id}/video-generation/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_film(project_id: int, story_id: int, job_id: int, current_user: CurrentUser, db: Session = Depends(get_db)) -> None:
    _story(db, current_user.id, project_id, story_id)
    job = db.get(VideoGenerationJob, job_id)
    if job is None or job.story_id != story_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Film not found.")
    if job.status in _RUNNING_JOB:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The clips are still being made. Wait until they are ready, then delete the film.")
    if not job.output_storage_key and not job.output_video_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This film has not been joined yet.")
    key = job.output_storage_key
    # the job stays (its clips can be joined again); only the joined film goes
    job.output_storage_key = None
    job.output_video_url = None
    db.commit()
    _remove_any_file(key)

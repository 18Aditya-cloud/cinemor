"""
One-click generation (individual creators): one prompt -> a finished film.
See app/services/one_click_service.py for what a run makes.

    GET  /api/individual/projects/{project_id}/one-click/options      models, lengths, styles, languages
    GET  /api/individual/projects/{project_id}/one-click              the project's films, newest first
    POST /api/individual/projects/{project_id}/one-click              start a film (202; it is made in the background)
    GET  /api/individual/projects/{project_id}/one-click/{film_id}    one film: its steps, scenes, sketches and clips
    POST /api/individual/projects/{project_id}/one-click/{film_id}/cancel   stop it (before the filming starts)
    POST /api/individual/projects/{project_id}/one-click/source       read one uploaded file (PDF, DOCX, PPTX, TXT, picture)
    POST /api/individual/projects/{project_id}/one-click/analyze      which format fits the material (story, explainer...)
    POST /api/individual/projects/{project_id}/one-click/{film_id}/continue  after checking the script: go on filming

The finished film, the clips and the sketches are downloaded with the Animation and Sketches modules' own routes
(.../video-generation/{job_id}/download, .../video-clips/{clip_id}/download, .../sketches/{sketch_id}/preview).
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.core.rate_limit import rate_limit
from app.database.session import SessionLocal, get_db
from app.services.one_click_service import OneClickError, OneClickService
from app.services.one_click_source import MAX_FILE_BYTES, SourceError, detect, read_file

router = APIRouter(prefix="/api/individual/projects/{project_id}/one-click", tags=["One-click generation"])


class StartFilmRequest(BaseModel):
    prompt: str = Field(default="", max_length=4000)
    script_title: str = Field(default="", max_length=300)
    script_content: str = Field(default="", max_length=60000)
    text_model: str = Field(..., min_length=1, max_length=200)
    image_model: str = Field(default="", max_length=200)
    video_model: str = Field(..., min_length=1, max_length=200)
    length: str = Field(default="medium", max_length=20)
    style: str = Field(default="3D Animated", max_length=50)
    language: str = Field(default="English", max_length=50)
    format: str = Field(default="auto", max_length=20)
    review: bool = False
    source_kinds: list[str] = Field(default_factory=list, max_length=10)


class AnalyzeRequest(BaseModel):
    text: str = Field(default="", max_length=60000)
    prompt: str = Field(default="", max_length=4000)


class ContinueRequest(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, max_length=60000)


def _fail(exc: OneClickError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _run_film(film_id: int) -> None:
    """The whole film, in a background task with its own database session."""
    db = SessionLocal()
    try:
        OneClickService(db).run(film_id)
    finally:
        db.close()


@router.get("/options")
def one_click_options(project_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    service = OneClickService(db)
    try:
        service._project(current_user, project_id)
    except OneClickError as exc:
        raise _fail(exc) from exc
    return service.options()


@router.get("")
def list_films(project_id: int, current_user: CurrentUser, db: Session = Depends(get_db), limit: int = Query(default=10, ge=1, le=50)):
    try:
        return OneClickService(db).list(current_user, project_id, limit)
    except OneClickError as exc:
        raise _fail(exc) from exc


@router.post("", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(rate_limit(limit=6, window_seconds=3600))])
def start_film(project_id: int, body: StartFilmRequest, background: BackgroundTasks, current_user: CurrentUser, db: Session = Depends(get_db)):
    service = OneClickService(db)
    try:
        film = service.start(
            current_user,
            project_id,
            prompt=body.prompt,
            script_title=body.script_title,
            script_content=body.script_content,
            text_model=body.text_model,
            image_model=body.image_model,
            video_model=body.video_model,
            length=body.length,
            style=body.style,
            language=body.language,
            fmt=body.format,
            review=body.review,
            source_kinds=body.source_kinds,
        )
    except OneClickError as exc:
        raise _fail(exc) from exc
    background.add_task(_run_film, film.id)
    return service.serialize(film, detail=True)


@router.post("/source", dependencies=[Depends(rate_limit(limit=40, window_seconds=3600))])
async def read_source(project_id: int, current_user: CurrentUser, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """The readable content of one uploaded file, for the prompt window (nothing is saved)."""
    try:
        OneClickService(db)._project(current_user, project_id)
    except OneClickError as exc:
        raise _fail(exc) from exc
    data = await file.read(MAX_FILE_BYTES + 1)
    await file.close()
    try:
        return await read_file(file.filename or "", data)
    except SourceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/analyze", dependencies=[Depends(rate_limit(limit=60, window_seconds=3600))])
async def analyze_source(project_id: int, body: AnalyzeRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    """Which kind of video fits the material: {format, label, title, reason}."""
    try:
        OneClickService(db)._project(current_user, project_id)
    except OneClickError as exc:
        raise _fail(exc) from exc
    if not body.text.strip() and not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Add some material or an idea first.")
    return await detect(body.text, body.prompt)


@router.post("/{film_id}/continue", status_code=status.HTTP_202_ACCEPTED)
def continue_film(project_id: int, film_id: int, body: ContinueRequest, background: BackgroundTasks, current_user: CurrentUser, db: Session = Depends(get_db)):
    service = OneClickService(db)
    try:
        film = service.continue_after_review(current_user, project_id, film_id, title=body.title, content=body.content)
    except OneClickError as exc:
        raise _fail(exc) from exc
    background.add_task(_run_film, film.id)
    return service.serialize(film, detail=True)


@router.get("/{film_id}")
def get_film(project_id: int, film_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return OneClickService(db).get(current_user, project_id, film_id)
    except OneClickError as exc:
        raise _fail(exc) from exc


@router.post("/{film_id}/cancel")
def cancel_film(project_id: int, film_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return OneClickService(db).cancel(current_user, project_id, film_id)
    except OneClickError as exc:
        raise _fail(exc) from exc
"""
Quick Create: tools that make one thing on their own, outside any project (app/services/quick_create_service.py).

    GET    /api/quick-create/options                       models, voices, ratios and limits for the tools
    POST   /api/quick-create/pictures                      { kind: character|location|image, model_id, prompt, aspect_ratio, count,
                                                      details: {pose, style, time_of_day}, improve, references: [data URLs] }
    POST   /api/quick-create/stories                       the story module's request (model, prompt, language, genre...)
    POST   /api/quick-create/stories/{id}/edit             { instruction }   an AI edit, kept as a new version
    POST   /api/quick-create/stories/{id}/version          { number }        show an earlier version
    POST   /api/quick-create/avatar-videos                 form: image, script, model_id, aspect_ratio, language, voice_style, consent
    POST   /api/quick-create/audio                         { model_id, voice, text, instructions, speed, language }
    POST   /api/quick-create/short-videos                  { prompt, style, seconds, aspect_ratio, language, sound }
                                                      a short film (Wan 3.0), made in the background
    POST   /api/quick-create/items/{id}/stop               stop a short video being made
    GET    /api/quick-create/items/{id}/frames/{no}        a short video's picture for shot `no`
    GET    /api/quick-create/items?kind=                   the library (kind: picture | story | avatar_video | audio | character ...)
    GET    /api/quick-create/items/{id}
    GET    /api/quick-create/items/{id}/file[?source=1]    the result (or, for an avatar video, the uploaded picture)
    DELETE /api/quick-create/items/{id}
    POST   /api/quick-create/items/delete                  { ids: [...] }   delete several at once
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.core.rate_limit import rate_limit
from app.database.session import SessionLocal, get_db
from app.schemas.story_request import StoryRequest
from app.services.quick_create_service import LIMITS, QuickCreateError, QuickCreateService

router = APIRouter(prefix="/api/quick-create", tags=["Quick Create"])

_make_limit = Depends(rate_limit(limit=20, window_seconds=60))


def _fail(exc: QuickCreateError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _service(db: Session, user) -> QuickCreateService:
    service = QuickCreateService(db)
    try:
        service.require_user(user)
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    return service


class PictureRequest(BaseModel):
    kind: str = Field(pattern="^(character|location|image)$")
    model_id: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=LIMITS["prompt"])
    aspect_ratio: str = Field(default="16:9", max_length=10)
    count: int = Field(default=1, ge=1, le=LIMITS["images"])
    details: dict[str, str] = Field(default_factory=dict)
    improve: bool = False
    references: list[str] = Field(default_factory=list, max_length=4)


class DeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)


class EditRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=LIMITS["instruction"])


class VersionRequest(BaseModel):
    number: int = Field(ge=1)


class AudioRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=200)
    voice: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=LIMITS["audio_text"])
    instructions: str = Field(default="", max_length=500)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    language: str = Field(default="", max_length=50)


class ShortVideoRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=LIMITS["short_prompt"])
    style: str = Field(default="auto", max_length=40)
    seconds: int = Field(default=15, ge=1, le=30)
    aspect_ratio: str = Field(default="9:16", max_length=10)
    language: str = Field(default="English", max_length=50)
    sound: bool = True


@router.get("/options")
async def get_options(current_user: CurrentUser, db: Session = Depends(get_db)):
    return await _service(db, current_user).options()


@router.post("/pictures", status_code=status.HTTP_201_CREATED, dependencies=[_make_limit])
async def create_pictures(body: PictureRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    service = _service(db, current_user)
    try:
        items = await service.create_pictures(
            current_user,
            kind=body.kind,
            model_id=body.model_id,
            prompt=body.prompt,
            aspect_ratio=body.aspect_ratio,
            count=body.count,
            details=body.details,
            improve=body.improve,
            references=body.references,
        )
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    return {"items": items}


@router.post("/stories", status_code=status.HTTP_201_CREATED, dependencies=[_make_limit])
async def create_story(body: StoryRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return await _service(db, current_user).create_story(current_user, body)
    except QuickCreateError as exc:
        raise _fail(exc) from exc


@router.post("/stories/{item_id}/edit", dependencies=[_make_limit])
async def edit_story(item_id: int, body: EditRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return await _service(db, current_user).edit_story(current_user, item_id, body.instruction)
    except QuickCreateError as exc:
        raise _fail(exc) from exc


@router.post("/stories/{item_id}/version")
def use_story_version(item_id: int, body: VersionRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return _service(db, current_user).use_story_version(current_user, item_id, body.number)
    except QuickCreateError as exc:
        raise _fail(exc) from exc


def _run_avatar_video(item_id: int) -> None:
    db = SessionLocal()
    try:
        QuickCreateService(db).run_avatar_video(item_id)
    finally:
        db.close()


@router.post("/avatar-videos", status_code=status.HTTP_202_ACCEPTED, dependencies=[_make_limit])
async def create_avatar_video(
    background: BackgroundTasks,
    current_user: CurrentUser,
    image: UploadFile = File(...),
    script: str = Form(..., min_length=1, max_length=LIMITS["script"]),
    model_id: str = Form(..., min_length=1, max_length=200),
    aspect_ratio: str = Form("9:16", max_length=10),
    language: str = Form("English", max_length=50),
    voice_style: str = Form("", max_length=300),
    consent: bool = Form(False),
    db: Session = Depends(get_db),
):
    if not consent:
        raise HTTPException(status_code=400, detail="Please confirm that you may use this picture.")
    data = await image.read(LIMITS["upload_bytes"] + 1)
    await image.close()
    try:
        item = _service(db, current_user).start_avatar_video(
            current_user,
            image=data,
            script=script,
            model_id=model_id,
            aspect_ratio=aspect_ratio,
            language=language,
            voice_style=voice_style,
        )
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    background.add_task(_run_avatar_video, item["id"])
    return item


@router.post("/audio", status_code=status.HTTP_201_CREATED, dependencies=[_make_limit])
async def create_audio(body: AudioRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return await _service(db, current_user).create_audio(
            current_user,
            model_id=body.model_id,
            voice=body.voice,
            text=body.text,
            instructions=body.instructions,
            speed=body.speed,
            language=body.language,
        )
    except QuickCreateError as exc:
        raise _fail(exc) from exc


def _run_short_video(item_id: int) -> None:
    db = SessionLocal()
    try:
        QuickCreateService(db).run_short_video(item_id)
    finally:
        db.close()


@router.post("/short-videos", status_code=status.HTTP_202_ACCEPTED, dependencies=[_make_limit])
def create_short_video(body: ShortVideoRequest, background: BackgroundTasks, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        item = _service(db, current_user).start_short_video(
            current_user,
            prompt=body.prompt,
            style=body.style,
            seconds=body.seconds,
            aspect_ratio=body.aspect_ratio,
            language=body.language,
            sound=body.sound,
        )
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    background.add_task(_run_short_video, item["id"])
    return item


@router.post("/items/{item_id}/stop")
def stop_item(item_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return _service(db, current_user).stop_short_video(current_user, item_id)
    except QuickCreateError as exc:
        raise _fail(exc) from exc


@router.get("/items/{item_id}/frames/{no}")
def get_item_frame(item_id: int, no: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        path, mime, name = _service(db, current_user).frame_of(current_user, item_id, no)
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    return FileResponse(path=str(path), media_type=mime, filename=name, headers={"Cache-Control": "private, max-age=3600"})


@router.get("/items")
def list_items(
    current_user: CurrentUser,
    kind: str | None = Query(default=None, pattern="^(picture|character|location|image|story|avatar_video|audio|short_video)$"),
    limit: int = Query(default=60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return {"items": _service(db, current_user).list(current_user, kind, limit)}


@router.get("/items/{item_id}")
def get_item(item_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return _service(db, current_user).get(current_user, item_id)
    except QuickCreateError as exc:
        raise _fail(exc) from exc


@router.get("/items/{item_id}/file")
def get_item_file(item_id: int, current_user: CurrentUser, source: bool = False, db: Session = Depends(get_db)):
    try:
        path, mime, name = _service(db, current_user).file_of(current_user, item_id, source)
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    return FileResponse(path=str(path), media_type=mime, filename=name, headers={"Cache-Control": "private, max-age=3600"})


@router.post("/items/delete")
def delete_items(body: DeleteRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    return {"deleted": _service(db, current_user).delete_many(current_user, body.ids)}


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        _service(db, current_user).delete(current_user, item_id)
    except QuickCreateError as exc:
        raise _fail(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
"""
One-click generation (individual creators): one prompt -> a finished film.

A run uses the project's own modules, one after the other, in a background task:

    story        write the story from the idea (Story module), or take the uploaded script as it is
    storyboard   plan the scenes, characters and locations (Storyboard module)
    characters   a profile and a master picture for the main characters (Characters module), so they look
                 the same in every scene
    locations    a profile and a master picture for the main places (Environment module)
    sketches     one picture per scene, drawn with those masters (Sketches module); it is the clip's first frame
    clips        a clip per scene with the chosen video model, then the clips joined into the film
                 (Animation module: VideoGenerationService, which joins them itself)

Characters, locations and sketches help the film look consistent; when one of them fails the run goes on without
it (the clip is then made from the scene's words). The story, the storyboard and the clips must succeed.

Everything it makes is ordinary project content, so the creator can open it module by module later and change it.
The run's own state is a row in one_click_films (app/models/one_click_film.py).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.clients.openrouter_image_client import DEFAULT_IMAGE_MODEL, IMAGE_MODELS
from app.core.config import settings
from app.llm.model_registry import get_all_models, get_model
from app.models.individual_project import IndividualProject
from app.models.one_click_film import OneClickFilm
from app.models.scene_sketch import SceneSketch
from app.models.scene_video_clip import SceneVideoClip
from app.models.scenes import Scene
from app.models.story import Story
from app.models.story_board import StoryBoard
from app.models.user import User
from app.models.video_generation_job import VideoGenerationJob
from app.services.one_click_source import FORMAT_KEYS, FORMATS, SourceError, detect, write_script

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------- choices
VIDEO_MODEL_NAMES = {
    "alibaba/wan-3.0": "Wan 3.0",
    "alibaba/wan-3.0-prime": "Wan 3.0 Prime",
    "google/veo-3.1-fast": "Veo 3.1 Fast",
    "google/veo-3.1": "Veo 3.1",
    "bytedance/seedance-2.0": "Seedance 2.0",
    "bytedance/seedance-2.5": "Seedance 2.5",
    "kwaivgi/kling-v3.0-pro": "Kling 3.0 Pro",
    "kwaivgi/kling-v3.0-std": "Kling 3.0",
    "minimax/hailuo-3": "Hailuo 3",
    "x-ai/grok-imagine-video-1.5": "Grok Imagine Video 1.5",
    "runway/gen-4.5": "Runway Gen-4.5",
}
# a short line under each model in the menu
VIDEO_MODEL_NOTES = {
    "alibaba/wan-3.0": "Great value, with sound",
    "alibaba/wan-3.0-prime": "Higher quality Wan, with sound",
    "google/veo-3.1-fast": "Cinematic, with sound, faster",
    "google/veo-3.1": "Most cinematic, with sound",
    "bytedance/seedance-2.0": "Smooth motion, with sound",
    "bytedance/seedance-2.5": "Newest Seedance, with sound",
    "kwaivgi/kling-v3.0-pro": "Expressive characters, with sound",
    "kwaivgi/kling-v3.0-std": "Expressive characters, with sound",
    "minimax/hailuo-3": "Dynamic action, with sound",
    "x-ai/grok-imagine-video-1.5": "Quick and lively",
    "runway/gen-4.5": "Film look, no sound",
}

LENGTHS = {
    # story words, and the most scenes the film may have
    "short": {"label": "Short", "words": 160, "scenes": 5, "about": "about 30 seconds"},
    "medium": {"label": "Medium", "words": 320, "scenes": 8, "about": "about 1 minute"},
    "long": {"label": "Long", "words": 600, "scenes": 12, "about": "about 2 minutes"},
}
STYLES = ["3D Animated", "2D Animated", "Anime", "Realistic", "Cinematic", "Watercolor", "Comic book"]
LANGUAGES = ["English", "Hindi", "Hinglish", "Bengali", "Tamil", "Telugu", "Marathi", "Spanish", "French", "Japanese", "Arabic"]

MAX_CHARACTERS = 4
MAX_LOCATIONS = 3
PROMPT_LIMIT = 4000
SCRIPT_LIMIT = 60000
STALE_AFTER = timedelta(hours=3)  # a run that has not moved for this long stopped (e.g. the server restarted)

STAGES = [
    ("story", "Writing the script"),
    ("review", "Your check of the script"),
    ("storyboard", "Planning the scenes"),
    ("characters", "Designing the characters"),
    ("locations", "Designing the places"),
    ("sketches", "Drawing every scene"),
    ("clips", "Filming the scenes"),
    ("assembling", "Putting the film together"),
]
RUNNING_JOB = ("queued", "planning", "generating", "assembling")
ACTIVE = ("queued", "running", "review")  # a film that is being made (review: waiting for the person's check)


class OneClickError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def video_model_choices() -> list[dict[str, str]]:
    return [
        {"id": m, "name": VIDEO_MODEL_NAMES.get(m, m.split("/")[-1]), "note": VIDEO_MODEL_NOTES.get(m, "")}
        for m in settings.ONE_CLICK_VIDEO_MODELS
        if m
    ]


class OneClickService:
    def __init__(self, db: Session):
        self.db = db

    # ============================================================ reading
    def options(self) -> dict[str, Any]:
        text_models = [{"id": m.id, "name": m.name} for m in get_all_models()]
        return {
            "video_models": video_model_choices(),
            "default_video_model": settings.ONE_CLICK_VIDEO_MODELS[0] if settings.ONE_CLICK_VIDEO_MODELS else "",
            "text_models": text_models,
            "image_models": [{"id": k, "name": v} for k, v in IMAGE_MODELS.items()],
            "default_image_model": DEFAULT_IMAGE_MODEL,
            "lengths": [{"id": k, "label": v["label"], "about": v["about"]} for k, v in LENGTHS.items()],
            "styles": STYLES,
            "languages": LANGUAGES,
            "formats": [{"id": "auto", "label": "Auto", "about": "Cinemor picks the best format for your content"}]
            + [{"id": k, "label": v["label"], "about": v["about"]} for k, v in FORMATS.items()],
        }

    def _project(self, user: User, project_id: int) -> IndividualProject:
        project = (
            self.db.query(IndividualProject)
            .filter(IndividualProject.id == project_id, IndividualProject.individual_user_id == user.id)
            .first()
        )
        if project is None:
            raise OneClickError("Project not found.", 404)
        return project

    def _film(self, user: User, project_id: int, film_id: int) -> OneClickFilm:
        self._project(user, project_id)
        film = (
            self.db.query(OneClickFilm)
            .filter(OneClickFilm.id == film_id, OneClickFilm.individual_project_id == project_id, OneClickFilm.user_id == user.id)
            .first()
        )
        if film is None:
            raise OneClickError("This film was not found.", 404)
        return film

    def list(self, user: User, project_id: int, limit: int = 10) -> list[dict[str, Any]]:
        self._project(user, project_id)
        films = (
            self.db.query(OneClickFilm)
            .filter(OneClickFilm.individual_project_id == project_id, OneClickFilm.user_id == user.id)
            .order_by(OneClickFilm.id.desc())
            .limit(max(1, min(limit, 50)))
            .all()
        )
        return [self.serialize(f, detail=False) for f in films]

    def get(self, user: User, project_id: int, film_id: int) -> dict[str, Any]:
        return self.serialize(self._film(user, project_id, film_id), detail=True)

    def _job(self, film: OneClickFilm) -> VideoGenerationJob | None:
        return self.db.get(VideoGenerationJob, film.video_job_id) if film.video_job_id else None

    def _check_stale(self, film: OneClickFilm) -> None:
        """A run that stopped without saying so (the server restarted) is shown as failed."""
        if film.status not in ("queued", "running"):
            return  # (a film waiting for the person's check is not stale)
        job = self._job(film)
        moved = max(filter(None, [_aware(film.updated_at), _aware(job.updated_at) if job else None]))
        if _now() - moved < STALE_AFTER:
            return
        if job is not None and job.status in RUNNING_JOB and _now() - _aware(job.updated_at) < STALE_AFTER:
            return
        film.status = "failed"
        film.error_message = "The film stopped being made (the server was restarted). Please start it again."
        film.finished_at = _now()
        self.db.commit()

    def serialize(self, film: OneClickFilm, *, detail: bool) -> dict[str, Any]:
        self._check_stale(film)
        story = self.db.get(Story, film.story_id) if film.story_id else None
        job = self._job(film)
        progress = film.progress or {}
        steps_state = dict(progress.get("steps") or {})
        # the clips stage is the Animation module's job: read its own progress
        if job is not None:
            if job.status == "assembling":
                steps_state["clips"] = "done"
                steps_state["assembling"] = "active"
            elif job.status == "completed":
                steps_state["clips"] = "done"
                steps_state["assembling"] = "done"
            elif job.status == "failed":
                steps_state.setdefault("clips", "failed")
        cfg = film.settings or {}
        steps = [
            {
                "key": key,
                "label": label,
                "state": steps_state.get(key, "waiting"),
                "count": progress.get(key) if isinstance(progress.get(key), dict) else None,
            }
            for key, label in STAGES
            if key != "review" or cfg.get("review")
        ]
        if job is not None:
            for st in steps:
                if st["key"] == "clips":
                    st["count"] = {"done": job.completed_scenes or 0, "total": job.total_scenes or 0, "failed": job.failed_scenes or 0}

        out: dict[str, Any] = {
            "id": film.id,
            "project_id": film.individual_project_id,
            "status": film.status,
            "stage": film.stage,
            "prompt": film.prompt,
            "settings": film.settings or {},
            "detail": progress.get("detail") or "",
            "error_message": film.error_message,
            "story": {"id": story.id, "title": story.title} if story else None,
            "job": (
                {
                    "id": job.id,
                    "status": job.status,
                    "total": job.total_scenes or 0,
                    "completed": job.completed_scenes or 0,
                    "failed": job.failed_scenes or 0,
                    "error_message": job.error_message,
                    "film_ready": bool(job.status == "completed" and job.output_storage_key),
                }
                if job
                else None
            ),
            "steps": steps,
            "created_at": film.created_at,
            "updated_at": film.updated_at,
            "finished_at": film.finished_at,
        }
        if detail:
            out["story"] = {"id": story.id, "title": story.title, "content": story.content} if story else None
            out["scenes"] = self._scenes(film, story, job)
        return out

    def _scenes(self, film: OneClickFilm, story: Story | None, job: VideoGenerationJob | None) -> list[dict[str, Any]]:
        """The film's scenes in order, each with its newest sketch and clip (once they exist)."""
        if story is None:
            return []
        board = self.db.query(StoryBoard).filter(StoryBoard.story_id == story.id).order_by(StoryBoard.id.desc()).first()
        if board is None:
            return []
        scenes = self.db.query(Scene).filter(Scene.story_board_id == board.id).order_by(Scene.id.asc()).all()
        wanted = set(job.scene_ids or []) if job is not None else None
        out = []
        for no, scene in enumerate(scenes, start=1):
            sketch = (
                self.db.query(SceneSketch)
                .filter(SceneSketch.scene_id == scene.id, SceneSketch.status == "generated")
                .order_by(SceneSketch.created_at.desc(), SceneSketch.id.desc())
                .first()
            )
            clip = (
                self.db.query(SceneVideoClip)
                .filter(SceneVideoClip.scene_id == scene.id)
                .order_by(SceneVideoClip.version.desc(), SceneVideoClip.id.desc())
                .first()
            )
            out.append(
                {
                    "id": scene.id,
                    "no": no,
                    "title": scene.title,
                    "summary": scene.summary or "",
                    "visual": scene.visual_description or "",
                    "action": scene.primary_action or "",
                    "in_film": wanted is None or scene.id in wanted,
                    "sketch": {"id": sketch.id} if sketch else None,
                    "clip": (
                        {
                            "id": clip.id,
                            "status": clip.status,
                            "seconds": clip.actual_duration_seconds or clip.planned_duration_seconds,
                            "error_message": clip.error_message,
                        }
                        if clip
                        else None
                    ),
                }
            )
        return out

    # ============================================================ starting
    def start(
        self,
        user: User,
        project_id: int,
        *,
        prompt: str,
        script_title: str,
        script_content: str,
        text_model: str,
        image_model: str,
        video_model: str,
        length: str,
        style: str,
        language: str,
        fmt: str = "auto",
        review: bool = False,
        source_kinds: list[str] | None = None,
    ) -> OneClickFilm:
        self._project(user, project_id)
        fmt = fmt if fmt in FORMAT_KEYS else "auto"
        prompt = (prompt or "").strip()
        script_content = (script_content or "").strip()
        if not prompt and not script_content:
            raise OneClickError("Describe what Cinemor should create, or upload your script.")
        if len(prompt) > PROMPT_LIMIT:
            raise OneClickError(f"Keep the idea under {PROMPT_LIMIT} characters.")
        if len(script_content) > SCRIPT_LIMIT:
            raise OneClickError("This material is too long for one video. Please upload a shorter part of it.")
        if video_model not in settings.ONE_CLICK_VIDEO_MODELS:
            raise OneClickError("Choose one of the offered video models.")
        if get_model(text_model) is None:
            raise OneClickError("Choose one of the offered story models.")
        image_model = image_model or DEFAULT_IMAGE_MODEL
        if image_model not in IMAGE_MODELS:
            raise OneClickError("Choose one of the offered image models.")
        if length not in LENGTHS:
            raise OneClickError("Choose Short, Medium or Long.")
        style = style if style in STYLES else STYLES[0]
        language = language if language in LANGUAGES else "English"

        running = (
            self.db.query(OneClickFilm)
            .filter(OneClickFilm.individual_project_id == project_id, OneClickFilm.status.in_(ACTIVE))
            .all()
        )
        for other in running:
            self._check_stale(other)
        if any(f.status in ACTIVE for f in running):
            raise OneClickError("A film is already being made in this project. Wait until it is ready, or stop it.", 409)

        film = OneClickFilm(
            individual_project_id=project_id,
            user_id=user.id,
            status="queued",
            stage="story",
            prompt=prompt,
            settings={
                "text_model": text_model,
                "image_model": image_model,
                "video_model": video_model,
                "video_model_name": VIDEO_MODEL_NAMES.get(video_model, video_model),
                "length": length,
                "style": style,
                "language": language,
                "from_script": bool(script_content),
                "script_title": (script_title or "").strip()[:300],
                "source_kinds": [k for k in (source_kinds or []) if isinstance(k, str)][:10],
                "format": fmt,  # what the person chose ("auto": Cinemor decides)
                "format_used": None if fmt == "auto" else fmt,  # what the film is made as
                "format_label": None if fmt == "auto" else FORMATS[fmt]["label"],
                "review": bool(review),
            },
            progress={"steps": {}, "detail": "", "script": script_content} if script_content else {"steps": {}, "detail": ""},
        )
        self.db.add(film)
        self.db.commit()
        self.db.refresh(film)
        return film

    def cancel(self, user: User, project_id: int, film_id: int) -> dict[str, Any]:
        film = self._film(user, project_id, film_id)
        if film.status not in ACTIVE:
            raise OneClickError("This film is not being made.", 409)
        job = self._job(film)
        if job is not None and job.status in RUNNING_JOB:
            raise OneClickError("The scenes are being filmed now and cannot be stopped. The film will be ready soon.", 409)
        film.status = "cancelled"
        film.error_message = None
        film.finished_at = _now()
        self.db.commit()
        return self.serialize(film, detail=True)

    # ============================================================ running (background task, own session)
    def run(self, film_id: int) -> None:
        film = self.db.get(OneClickFilm, film_id)
        if film is None or film.status != "queued":
            return
        film.status = "running"
        self.db.commit()
        try:
            if film.story_id is None:
                asyncio.run(self._write(film_id))
                film = self._fresh(film_id)
                if film is None or film.status != "running":
                    return
                if (film.settings or {}).get("review"):
                    # wait for the person to read (and maybe edit) the script; continue_after_review() goes on
                    self._set(film_id, stage="review", step=("review", "active"), detail="", status="review")
                    return
            asyncio.run(self._prepare(film_id))
            film = self._fresh(film_id)
            if film is None or film.status != "running":
                return
            self._film_scenes(film_id)
        except OneClickError as exc:
            self._fail(film_id, exc.message)
        except SourceError as exc:
            self._fail(film_id, exc.message)
        except Exception as exc:  # noqa: BLE001 - every failure is shown on the run
            logger.exception("One-click film %s failed", film_id)
            self._fail(film_id, str(exc)[:500] or "The film could not be made.")

    def _fresh(self, film_id: int) -> OneClickFilm | None:
        self.db.expire_all()
        return self.db.get(OneClickFilm, film_id)

    def _stopped(self, film_id: int) -> bool:
        film = self._fresh(film_id)
        return film is None or film.status != "running"

    def _set(self, film_id: int, *, stage: str | None = None, step: tuple[str, str] | None = None, detail: str | None = None, count: tuple[str, int, int] | None = None, **fields) -> None:
        film = self._fresh(film_id)
        if film is None:
            return
        progress = dict(film.progress or {})
        steps = dict(progress.get("steps") or {})
        if step:
            steps[step[0]] = step[1]
        progress["steps"] = steps
        if detail is not None:
            progress["detail"] = detail
        if count:
            progress[count[0]] = {"done": count[1], "total": count[2]}
        film.progress = progress
        if stage:
            film.stage = stage
        for key, value in fields.items():
            setattr(film, key, value)
        film.updated_at = _now()
        self.db.commit()

    def _fail(self, film_id: int, message: str) -> None:
        self.db.rollback()
        film = self._fresh(film_id)
        if film is None or film.status == "cancelled":
            return
        progress = dict(film.progress or {})
        steps = {k: ("failed" if v == "active" else v) for k, v in (progress.get("steps") or {}).items()}
        progress["steps"] = steps
        film.progress = progress
        film.status = "failed"
        film.error_message = message[:1000]
        film.finished_at = _now()
        self.db.commit()

    async def _write(self, film_id: int) -> None:
        """The script: the format that fits (when "Auto"), then the story the film is made from."""
        from app.repositories.story_repository import StoryRepository
        from app.schemas.story_request import StoryRequest
        from app.services.story_service import StoryService

        film = self._fresh(film_id)
        cfg = dict(film.settings or {})
        project_id = film.individual_project_id
        style = cfg.get("style") or STYLES[0]
        language = cfg.get("language") or "English"
        length = LENGTHS.get(cfg.get("length") or "medium", LENGTHS["medium"])
        material = (film.progress or {}).get("script") or ""

        self._set(film_id, stage="story", step=("story", "active"), detail="Reading your material" if material else "")
        fmt = cfg.get("format") or "auto"
        suggested_title = ""
        if fmt == "auto":
            found = await detect(material, film.prompt, cfg["text_model"])
            fmt, suggested_title = found["format"], found["title"]
            cfg.update(format_used=fmt, format_label=FORMATS[fmt]["label"], format_reason=found["reason"])
            self._set(film_id, settings=cfg)
        label = FORMATS[fmt]["label"]
        self._set(film_id, detail=f"Writing the {label.lower()} script")

        words = len(material.split())
        if material and fmt == "story" and words <= length["words"] * 2.5:
            # a story or script of a fitting length is filmed as it is
            title = cfg.get("script_title") or suggested_title or "My script"
            story = StoryRepository(self.db).create_uploaded_story(individual_project_id=project_id, title=title, content=material)
            StoryService(self.db).initialize_story_version(story_id=story.id)
            story_id = story.id
        elif not material and fmt == "story":
            idea = (
                f"{film.prompt}\n\nWrite it as a short film script told in scenes: clear visual moments, a few "
                "characters, and short lines of dialogue that can be spoken on screen."
            )
            request = StoryRequest(model=cfg["text_model"], prompt=idea[:10000], language=language, word_count=length["words"], style=[style])
            written = await StoryService(self.db).generate_story(request=request, individual_project_id=project_id)
            story_id = written.id
        else:
            # any other material, or a long story: rewritten as a video script in the chosen format
            script = await write_script(
                fmt=fmt,
                material=material,
                prompt=film.prompt,
                language=language,
                words=length["words"],
                scenes=length["scenes"],
                style=style,
                model_id=cfg["text_model"],
            )
            story = StoryRepository(self.db).create_uploaded_story(
                individual_project_id=project_id, title=script["title"] or suggested_title, content=script["content"]
            )
            StoryService(self.db).initialize_story_version(story_id=story.id)
            story_id = story.id

        film = self._fresh(film_id)
        progress = dict(film.progress or {})
        progress.pop("script", None)  # the material now lives in the story
        film.progress = progress
        self.db.commit()
        self._set(film_id, step=("story", "done"), detail="", story_id=story_id)

    def continue_after_review(self, user: User, project_id: int, film_id: int, *, title: str | None, content: str | None) -> OneClickFilm:
        """The person has read the script (and maybe changed it): save it and go on making the film."""
        from app.services.story_service import StoryService

        film = self._film(user, project_id, film_id)
        if film.status != "review":
            raise OneClickError("This film is not waiting for your check.", 409)
        story = self.db.get(Story, film.story_id) if film.story_id else None
        if story is None:
            raise OneClickError("The script was not found.", 404)
        new_title = (title or "").strip()[:500] or story.title
        new_content = (content or "").strip()
        if content is not None and len(new_content.split()) < 5:
            raise OneClickError("The script is empty. Write a little more, or stop this film.")
        if content is not None and len(new_content) > SCRIPT_LIMIT:
            raise OneClickError("This script is too long for one video.")
        if (content is not None and new_content != (story.content or "").strip()) or new_title != story.title:
            StoryService(self.db).update_story(story_id=story.id, title=new_title, content=new_content if content is not None else story.content)
        film = self._fresh(film_id)
        progress = dict(film.progress or {})
        steps = dict(progress.get("steps") or {})
        steps["review"] = "done"
        progress["steps"] = steps
        film.progress = progress
        film.status = "queued"
        film.updated_at = _now()
        self.db.commit()
        self.db.refresh(film)
        return film

    async def _prepare(self, film_id: int) -> None:
        """Storyboard, characters, locations and sketches (the script is written)."""
        from app.services.character_master_image_service import CharacterMasterImageService
        from app.services.character_profile_generation_service import CharacterProfileGenerationService
        from app.services.location_master_image_service import LocationMasterImageService
        from app.services.location_profile_generation_service import LocationProfileGenerationService
        from app.services.scene_sketch_service import SceneSketchService
        from app.services.storyboard_service import StoryboardService

        film = self._fresh(film_id)
        cfg = dict(film.settings or {})
        project_id = film.individual_project_id
        style = cfg.get("style") or STYLES[0]
        length = LENGTHS.get(cfg.get("length") or "medium", LENGTHS["medium"])
        fmt = cfg.get("format_used") or "story"
        # a direction the person gave with a story filmed as it is (otherwise it is already in the script)
        direction = film.prompt if cfg.get("from_script") and fmt == "story" else ""
        story_id = film.story_id
        if self._stopped(film_id):
            return

        # ---------------------------------------------------------------- storyboard
        self._set(film_id, stage="storyboard", step=("storyboard", "active"))
        board = await StoryboardService(self.db).generate_storyboard(story_id=story_id, model_id=cfg["text_model"])
        board_id = board.id
        data = board.storyboard_data or {}
        scenes = self.db.query(Scene).filter(Scene.story_board_id == board_id).order_by(Scene.id.asc()).all()
        if not scenes:
            raise OneClickError("The storyboard has no scenes. Please try again with a little more detail.")
        scene_ids = [s.id for s in scenes][: length["scenes"]]
        self._set(film_id, step=("storyboard", "done"), detail=f"{len(scene_ids)} scenes planned")
        if self._stopped(film_id):
            return

        # ---------------------------------------------------------------- characters (not required)
        characters = [c for c in (data.get("characters") or []) if isinstance(c, dict) and c.get("character_id") is not None]
        characters = characters[:MAX_CHARACTERS]
        self._set(film_id, stage="characters", step=("characters", "active" if characters else "skipped"), count=("characters", 0, len(characters)))
        made = 0
        for i, character in enumerate(characters, start=1):
            if self._stopped(film_id):
                return
            self._set(film_id, detail=f"Designing {character.get('name') or 'a character'}")
            try:
                await CharacterProfileGenerationService(self.db).generate_storyboard_character_profile(
                    storyboard_id=board_id,
                    character_json_id=int(character["character_id"]),
                    style_name=style,
                    model_id=cfg["text_model"],
                )
                await CharacterMasterImageService(self.db).generate(
                    project_id=project_id,
                    story_id=story_id,
                    storyboard_id=board_id,
                    character_id=int(character["character_id"]),
                    image_type="canonical",
                    model_id=cfg["image_model"],
                )
                made += 1
            except Exception:  # noqa: BLE001 - the film is made without this character's picture
                self.db.rollback()
                logger.warning("One-click %s: character %s skipped", film_id, character.get("character_id"), exc_info=True)
            self._set(film_id, count=("characters", i, len(characters)))
        if characters:
            self._set(film_id, step=("characters", "done"), detail=f"{made} of {len(characters)} characters designed")

        # ---------------------------------------------------------------- locations (not required)
        locations = [
            loc for loc in (data.get("locations") or [])
            if isinstance(loc, dict) and (loc.get("location_id", loc.get("id")) is not None)
        ][:MAX_LOCATIONS]
        self._set(film_id, stage="locations", step=("locations", "active" if locations else "skipped"), count=("locations", 0, len(locations)))
        made = 0
        for i, location in enumerate(locations, start=1):
            if self._stopped(film_id):
                return
            location_id = int(location.get("location_id", location.get("id")))
            self._set(film_id, detail=f"Designing {location.get('name') or 'a place'}")
            try:
                await LocationProfileGenerationService(self.db).generate_storyboard_location_profile(
                    storyboard_id=board_id,
                    location_json_id=location_id,
                    style_name=style,
                    model_id=cfg["text_model"],
                )
                await LocationMasterImageService(self.db).generate(
                    project_id=project_id,
                    story_id=story_id,
                    storyboard_id=board_id,
                    location_id=location_id,
                    image_type="canonical",
                    model_id=cfg["image_model"],
                )
                made += 1
            except Exception:  # noqa: BLE001 - the film is made without this place's picture
                self.db.rollback()
                logger.warning("One-click %s: location %s skipped", film_id, location_id, exc_info=True)
            self._set(film_id, count=("locations", i, len(locations)))
        if locations:
            self._set(film_id, step=("locations", "done"), detail=f"{made} of {len(locations)} places designed")

        # ---------------------------------------------------------------- sketches (not required)
        self._set(film_id, stage="sketches", step=("sketches", "active"), count=("sketches", 0, len(scene_ids)))
        look = f"Visual style: {style}. {FORMATS.get(fmt, FORMATS['story'])['look']} 16:9."
        if direction:
            look += f" Direction from the creator: {direction[:600]}"
        drawn = 0
        for i, scene_id in enumerate(scene_ids, start=1):
            if self._stopped(film_id):
                return
            self._set(film_id, detail=f"Drawing scene {i} of {len(scene_ids)}")
            try:
                await SceneSketchService(self.db).generate(
                    project_id=project_id,
                    story_id=story_id,
                    storyboard_id=board_id,
                    scene_id=scene_id,
                    sketch_number=1,
                    model_id=cfg["image_model"],
                    customization_instructions=look,
                )
                drawn += 1
            except Exception:  # noqa: BLE001 - the clip is then made from the scene's words
                self.db.rollback()
                logger.warning("One-click %s: sketch for scene %s skipped", film_id, scene_id, exc_info=True)
            self._set(film_id, count=("sketches", i, len(scene_ids)))
        self._set(film_id, step=("sketches", "done"), detail=f"{drawn} of {len(scene_ids)} scenes drawn")

        film = self._fresh(film_id)
        progress = dict(film.progress or {})
        progress["scene_ids"] = scene_ids
        film.progress = progress
        self.db.commit()

    def _film_scenes(self, film_id: int) -> None:
        """Clips with the chosen video model, joined into the film (the Animation module's job does both)."""
        from app.services.video_generation_service import VideoGenerationService

        film = self._fresh(film_id)
        cfg = dict(film.settings or {})
        scene_ids = list((film.progress or {}).get("scene_ids") or [])
        service = VideoGenerationService(self.db)
        try:
            job = service.create_job(
                story_id=film.story_id,
                project_id=film.individual_project_id,
                generation_mode="selected" if scene_ids else "all",
                provider="openrouter",
                model_name=cfg["video_model"],
                scene_ids=scene_ids or None,
            )
        except ValueError as exc:
            raise OneClickError(str(exc)) from exc
        self._set(film_id, stage="clips", step=("clips", "active"), detail="", video_job_id=job.id)

        service.run_job(job.id)  # makes every clip, then joins them (in this background task)

        self.db.expire_all()
        job = self.db.get(VideoGenerationJob, job.id)
        film = self._fresh(film_id)
        if film is None:
            return
        if job is not None and job.status == "completed" and job.output_storage_key:
            self._set(film_id, stage="done", step=("assembling", "done"), detail="", status="done", finished_at=_now())
        else:
            message = (job.error_message if job else None) or "The scenes could not be filmed."
            if job is not None and job.failed_scenes:
                # say how many, and the video model's own reason for the first one
                reason = (
                    self.db.query(SceneVideoClip.error_message)
                    .filter(SceneVideoClip.scene_id.in_(job.scene_ids or []), SceneVideoClip.status == "failed")
                    .order_by(SceneVideoClip.id.desc())
                    .limit(1)
                    .scalar()
                )
                message = f"{job.failed_scenes} of {job.total_scenes} scenes could not be filmed" + (f": {reason[:300]}" if reason else ".")
            self._set(film_id, step=("clips", "failed"))
            self._fail(film_id, message)
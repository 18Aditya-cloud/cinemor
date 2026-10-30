"""
Quick Create: six tools that make one thing on their own, outside any project.

    character / location / image   a picture from a prompt, with a model and an aspect ratio
    story                          a story with every option of the story module; changed only by AI edits
    avatar_video                   an uploaded picture speaking a script; a long script is split into parts,
                                   each part becomes a clip, and the clips are joined into one video (moviepy)
    audio                          a voice reading a text, with a model, a voice and how it should sound

Everything made is kept in the user's library (the quick_creations table, files under storage/quick-create/).
The project modules are not used or changed; the story prompts, the image and video model lists and the video
joining are reused.
"""

from __future__ import annotations

import asyncio
import base64
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.clients import quick_create_clients as qc
from app.clients.openrouter_image_client import IMAGE_MODELS
from app.clients.openrouter_video_client import OpenRouterVideoClient, OpenRouterVideoError
from app.core.config import settings
from app.core.exceptions import LLMProviderError
from app.core.image_safety import inspect_image
from app.llm.model_registry import get_all_models, get_model
from app.models.quick_creation import QuickCreation
from app.models.user import AccountType, User
from app.prompts.prompt_builder import build_outline_prompts, build_story_from_outline_prompts
from app.schemas.story_request import StoryRequest

STORAGE = Path(__file__).resolve().parents[2] / "storage" / "quick-create"

PICTURE_KINDS = ("character", "location", "image")
KINDS = (*PICTURE_KINDS, "story", "avatar_video", "audio")

# how much one person may make in a day (the providers are paid per use)
DAILY_LIMITS = {"picture": 60, "story": 40, "avatar_video": 6, "audio": 60}

LIMITS = {
    "prompt": 2000,  # character / location / image
    "images": 4,  # pictures per request
    "instruction": 2000,  # one AI edit of a story
    "script": 4000,  # avatar video, characters
    "parts": 12,  # avatar video: most clips one video is made of
    "audio_text": 5000,
    "upload_bytes": 10 * 1024 * 1024,
}

# how each picture tool turns the user's words into a prompt
PICTURE_PROMPTS = {
    "character": (
        "A single character, shown clearly and in full detail, exactly as described. Keep the pose, action, "
        "framing and setting the description asks for (not a neutral standing pose unless it asks for one).\n\n{prompt}"
    ),
    "location": (
        "A location or environment, shown as a wide establishing view unless the description asks otherwise. "
        "No people in front unless the description asks for them.\n\n{prompt}"
    ),
    "image": "{prompt}",
}

# the extra choices a picture tool offers, added to the prompt (key -> how it is written)
PICTURE_DETAILS = {"pose": "Pose", "style": "Visual style", "time_of_day": "Time of day"}
MAX_REFERENCES = 4
REFERENCE_BYTES = 8 * 1024 * 1024

POLISH_SYSTEM_PROMPT = (
    "You turn a short request into a clear, vivid prompt for an image model. Keep everything the user asked for "
    "and do not add new people, text or logos. Describe subject, appearance, pose or action, setting, lighting, "
    "camera framing and mood. Answer with the prompt only, in English, under 120 words, without quotes."
)

# Avatar video: the script is said in ONE language from the first clip to the last. Before the clips are made, the
# whole script is written in the chosen language once (unless it already is), so every clip gets words in that
# language; each clip's prompt also repeats the language, and all clips share one seed (the same voice).
SCRIPT_LANGUAGE_SYSTEM_PROMPT = (
    "You prepare a script that one person will speak on camera. Write the whole script in {language}, "
    "{script_hint} Translate any part that is in another language; keep the meaning, names, tone and sentence "
    "order, and keep it natural to say aloud. Do not add or drop anything, and add no notes, titles or quotes. "
    "Answer with the script only."
)
SCRIPT_HINTS = {
    "Hindi": "in Devanagari script (simple, everyday Hindi).",
    "Hinglish": "as everyday Hinglish: Hindi mixed with common English words, written in the Latin alphabet.",
    "English": "in clear, simple English.",
    "Bengali": "in Bengali script.",
    "Tamil": "in Tamil script.",
    "Telugu": "in Telugu script.",
    "Marathi": "in Devanagari script.",
    "Arabic": "in Arabic script.",
    "Japanese": "in Japanese script.",
}
SPOKEN_AS = {"Hinglish": "Hinglish (Hindi mixed with English words, with an Indian accent)"}


def _script_is_in(text: str, language: str) -> bool | None:
    """Whether the script is plainly written in `language` already (None: cannot tell, ask the AI)."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    devanagari = sum(1 for c in letters if "\u0900" <= c <= "\u097f") / len(letters)
    latin = sum(1 for c in letters if c.isascii()) / len(letters)
    if language in ("Hindi", "Marathi"):
        return True if devanagari > 0.8 else None
    if language == "Hinglish":
        return True if latin > 0.95 and devanagari == 0 else None
    if language == "English":
        return True if latin > 0.95 and devanagari == 0 else None
    return None


WORDS_PER_PART = 40  # about 16 seconds of speech
WORDS_PER_SECOND = 2.5
AUDIO_PART_CHARS = 2500
STALE_AFTER = timedelta(hours=3)

# Everything made with Quick Create is kept for this long, then deleted (the row and its files).
RETENTION_DAYS = 30
_PURGE_EVERY = timedelta(minutes=10)
_last_purge: dict[str, datetime] = {}


def purge_expired(db: Session, *, force: bool = False) -> int:
    """
    Delete everything older than RETENTION_DAYS, for every user (rows and files). Runs at most every
    10 minutes per server process (Quick Create calls it on its own requests); `force` runs it now.
    Returns how many things were deleted.
    """
    now = _now()
    if not force and _last_purge.get("at") and now - _last_purge["at"] < _PURGE_EVERY:
        return 0
    _last_purge["at"] = now
    cutoff = now - timedelta(days=RETENTION_DAYS)
    old = (
        db.query(QuickCreation)
        .filter(QuickCreation.created_at < cutoff, QuickCreation.status != "working")
        .limit(500)
        .all()
    )
    for item in old:
        for key in (item.storage_key, item.source_key):
            path = QuickCreateService.path_of(key)
            if path:
                path.unlink(missing_ok=True)
        db.delete(item)
    if old:
        db.commit()
    return len(old)

STORY_EDIT_SYSTEM_PROMPT = """
You are an expert story editor.

Your task is to modify an existing story according to the user's
editing instruction.

Rules:
1. Preserve the original story's core meaning unless the instruction
   explicitly asks for a change.
2. Apply the requested changes naturally throughout the story.
3. Keep the story coherent and logically consistent.
4. Preserve important characters, setting, events, and narrative
   structure unless the user asks to change them.
5. Return ONLY valid JSON.
6. The JSON must contain exactly two fields:
   - "title": the story title
   - "content": the complete revised story
7. Do not include markdown, explanations, comments, or code fences.
"""


class QuickCreateError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _short(text: str, limit: int = 80) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?।॥])\s+|\n+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def split_script(script: str, words_per_part: int = WORDS_PER_PART) -> list[str]:
    """A script -> parts of about `words_per_part` words, cut at the end of a sentence where possible."""
    parts: list[str] = []
    current: list[str] = []
    for sentence in _sentences(script):
        words = sentence.split()
        # a very long sentence is cut by words
        while len(words) > words_per_part * 1.5:
            if current:
                parts.append(" ".join(current))
                current = []
            parts.append(" ".join(words[:words_per_part]))
            words = words[words_per_part:]
        if current and len(current) + len(words) > words_per_part:
            parts.append(" ".join(current))
            current = []
        current.extend(words)
    if current:
        parts.append(" ".join(current))
    return parts


def split_text(text: str, limit: int = AUDIO_PART_CHARS) -> list[str]:
    """A text -> pieces of at most `limit` characters, cut at the end of a sentence where possible."""
    pieces: list[str] = []
    current = ""
    for sentence in _sentences(text):
        while len(sentence) > limit:
            if current:
                pieces.append(current)
                current = ""
            pieces.append(sentence[:limit])
            sentence = sentence[limit:]
        if current and len(current) + 1 + len(sentence) > limit:
            pieces.append(current)
            current = ""
        current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


class QuickCreateService:
    def __init__(self, db: Session):
        self.db = db

    # ============================================================ access
    @staticmethod
    def require_user(user: User) -> None:
        if user.account_type == AccountType.CLIENT:
            raise QuickCreateError("Quick Create is not available on client accounts.", 403)

    def _check_daily(self, user: User, group: str) -> None:
        kinds = PICTURE_KINDS if group == "picture" else (group,)
        since = _now() - timedelta(days=1)
        used = (
            self.db.query(func.count(QuickCreation.id))
            .filter(QuickCreation.user_id == user.id, QuickCreation.kind.in_(kinds), QuickCreation.created_at >= since)
            .scalar()
        )
        if used >= DAILY_LIMITS[group]:
            raise QuickCreateError("You have reached today's limit for this tool. Please try again tomorrow.", 429)

    def _get(self, user: User, item_id: int) -> QuickCreation:
        item = self.db.get(QuickCreation, item_id)
        if item is None or item.user_id != user.id:
            raise QuickCreateError("Not found.", 404)
        return item

    # ============================================================ files
    @staticmethod
    def _save(user_id: int, data: bytes, ext: str) -> str:
        key = f"{user_id}/{uuid.uuid4().hex}{ext}"
        path = STORAGE / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    @staticmethod
    def path_of(key: str | None) -> Path | None:
        if not key:
            return None
        root = STORAGE.resolve()
        path = (root / key).resolve()
        if root not in path.parents or not path.is_file():
            return None
        return path

    def file_of(self, user: User, item_id: int, source: bool = False) -> tuple[Path, str, str]:
        item = self._get(user, item_id)
        key, mime = (item.source_key, item.source_mime_type) if source else (item.storage_key, item.mime_type)
        path = self.path_of(key)
        if path is None:
            raise QuickCreateError("This file is not ready.", 404)
        return path, mime or "application/octet-stream", f"{item.kind}-{item.id}{path.suffix}"

    # ============================================================ reading
    def serialize(self, item: QuickCreation) -> dict[str, Any]:
        created = item.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return {
            "expires_at": _iso(created + timedelta(days=RETENTION_DAYS)) if created else None,
            "id": item.id,
            "kind": item.kind,
            "status": item.status,
            "title": item.title,
            "prompt": item.prompt,
            "model_id": item.model_id,
            "settings": item.settings or {},
            "has_file": bool(item.storage_key),
            "mime_type": item.mime_type,
            "has_source": bool(item.source_key),
            "content": item.content or {},
            "error": item.error_message,
            "created_at": _iso(item.created_at),
            "updated_at": _iso(item.updated_at),
        }

    def _expire_stale(self, items: list[QuickCreation]) -> None:
        """A video still "working" long after its last change was stopped (the server restarted)."""
        changed = False
        for item in items:
            updated = item.updated_at
            if updated is not None and updated.tzinfo is None:
                updated = updated.replace(tzinfo=timezone.utc)
            if item.status == "working" and updated and _now() - updated > STALE_AFTER:
                item.status = "failed"
                item.error_message = "This was stopped before it finished. Please make it again."
                changed = True
        if changed:
            self.db.commit()

    def list(self, user: User, kind: str | None = None, limit: int = 60) -> list[dict[str, Any]]:
        purge_expired(self.db)
        query = self.db.query(QuickCreation).filter(QuickCreation.user_id == user.id)
        if kind:
            kinds = PICTURE_KINDS if kind == "picture" else (kind,)
            query = query.filter(QuickCreation.kind.in_(kinds))
        items = query.order_by(QuickCreation.id.desc()).limit(max(1, min(limit, 200))).all()
        self._expire_stale(items)
        return [self.serialize(i) for i in items]

    def get(self, user: User, item_id: int) -> dict[str, Any]:
        item = self._get(user, item_id)
        self._expire_stale([item])
        return self.serialize(item)

    def delete_many(self, user: User, ids: list[int]) -> int:
        """Delete several of the user's things at once; ones still being made are skipped. Returns how many."""
        items = self.db.query(QuickCreation).filter(QuickCreation.user_id == user.id, QuickCreation.id.in_(ids)).all()
        removed = 0
        for item in items:
            if item.status == "working" and item.kind == "avatar_video":
                continue
            for key in (item.storage_key, item.source_key):
                path = self.path_of(key)
                if path:
                    path.unlink(missing_ok=True)
            self.db.delete(item)
            removed += 1
        self.db.commit()
        return removed

    def delete(self, user: User, item_id: int) -> None:
        item = self._get(user, item_id)
        if item.status == "working" and item.kind == "avatar_video":
            raise QuickCreateError("This video is still being made. Delete it when it has finished.", 409)
        for key in (item.storage_key, item.source_key):
            path = self.path_of(key)
            if path:
                path.unlink(missing_ok=True)
        self.db.delete(item)
        self.db.commit()

    # ============================================================ options
    async def options(self) -> dict[str, Any]:
        video_models = [m for m in settings.OPENROUTER_VIDEO_MODELS if m]
        return {
            "picture_models": [{"id": k, "name": v} for k, v in IMAGE_MODELS.items()],
            "story_models": [{"id": m.id, "name": m.name} for m in get_all_models()],
            "video_models": [{"id": m, "name": _video_name(m)} for m in video_models],
            "default_video_model": settings.OPENROUTER_VIDEO_DEFAULT_MODEL,
            "audio_models": await qc.audio_models(),
            "aspect_ratios": qc.ASPECT_RATIOS,
            "limits": LIMITS,
            "daily_limits": DAILY_LIMITS,
            "retention_days": RETENTION_DAYS,
        }

    # ============================================================ character / location / image
    async def _polish(self, prompt: str) -> str:
        """"Improve prompt": an AI rewrites the request as a fuller image prompt (the original is kept if it fails)."""
        models = get_all_models()
        if not models:
            return prompt
        from app.clients.openrouter_client import OpenRouterClient

        try:
            better = await OpenRouterClient().generate(model_id=models[0].id, system_prompt=POLISH_SYSTEM_PROMPT, user_prompt=prompt, temperature=0.5)
        except LLMProviderError:
            return prompt
        better = better.strip().strip('"').strip()
        return better[: LIMITS["prompt"]] if better else prompt

    @staticmethod
    def _references(references: list[str]) -> list[str]:
        """Uploaded reference pictures (data URLs) -> checked data URLs."""
        if len(references) > MAX_REFERENCES:
            raise QuickCreateError(f"Add at most {MAX_REFERENCES} reference pictures.")
        out = []
        for ref in references:
            match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", ref or "")
            if not match:
                raise QuickCreateError("A reference picture could not be read. Use PNG, JPEG or WEBP.")
            try:
                data = base64.b64decode(match.group(2), validate=True)
            except ValueError as exc:
                raise QuickCreateError("A reference picture could not be read.") from exc
            if len(data) > REFERENCE_BYTES:
                raise QuickCreateError("A reference picture is too large (8 MB at most).", 413)
            try:
                mime, _ = inspect_image(data)
            except ValueError as exc:
                raise QuickCreateError(str(exc)) from exc
            out.append(f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}")
        return out

    async def create_pictures(
        self,
        user: User,
        *,
        kind: str,
        model_id: str,
        prompt: str,
        aspect_ratio: str,
        count: int,
        details: dict[str, str] | None = None,
        improve: bool = False,
        references: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        if kind not in PICTURE_KINDS:
            raise QuickCreateError("Unknown picture tool.")
        if model_id not in IMAGE_MODELS:
            raise QuickCreateError("Choose one of the offered image models.")
        if aspect_ratio not in qc.ASPECT_RATIOS:
            raise QuickCreateError("Choose one of the offered ratios.")
        prompt = prompt.strip()
        if not prompt:
            raise QuickCreateError("Describe what you want to see.")
        if len(prompt) > LIMITS["prompt"]:
            raise QuickCreateError(f"Keep the description under {LIMITS['prompt']} characters.")
        count = max(1, min(int(count), LIMITS["images"]))
        details = {k: " ".join(str(v).split())[:40] for k, v in (details or {}).items() if k in PICTURE_DETAILS and str(v).strip()}
        refs = self._references(references or [])
        self._check_daily(user, "picture")

        wording = await self._polish(prompt) if improve else prompt
        extra = "".join(f"\n{PICTURE_DETAILS[k]}: {v}." for k, v in details.items())
        if refs:
            extra += "\nFollow the reference pictures for the subject's face, clothes and look."
        try:
            images = await qc.generate_images(
                model_id=model_id,
                prompt=PICTURE_PROMPTS[kind].format(prompt=wording) + extra,
                aspect_ratio=aspect_ratio,
                count=count,
                references=refs,
            )
        except qc.QuickCreateProviderError as exc:
            raise QuickCreateError(str(exc), 502) from exc

        made = []
        for data, _ in images[:count]:
            try:
                mime, ext = inspect_image(data)
            except ValueError:
                continue
            item = QuickCreation(
                user_id=user.id,
                kind=kind,
                status="done",
                title=_short(prompt, 80),
                prompt=prompt,
                model_id=model_id,
                settings={"aspect_ratio": aspect_ratio, **details, "references": len(refs), **({"improved_prompt": wording} if improve else {})},
                storage_key=self._save(user.id, data, ext),
                mime_type=mime,
                file_size_bytes=len(data),
                content={},
            )
            self.db.add(item)
            made.append(item)
        if not made:
            raise QuickCreateError("The image model sent back no usable picture. Please try again.", 502)
        self.db.commit()
        return [self.serialize(i) for i in made]

    # ============================================================ story
    async def create_story(self, user: User, request: StoryRequest) -> dict[str, Any]:
        model = get_model(request.model)
        if model is None:
            raise QuickCreateError("Choose one of the offered story models.")
        self._check_daily(user, "story")
        from app.services.story_service import StoryService  # the story module's own checks, reused

        helper = StoryService(self.db)
        try:
            outline_system, outline_user = build_outline_prompts(request)
            raw_outline = await helper.llm_client.generate(model_id=model.id, system_prompt=outline_system, user_prompt=outline_user, temperature=0.3)
            outline = helper._parse_outline_response(raw_outline)
            helper._validate_outline(outline)
            story_system, story_user = build_story_from_outline_prompts(request, outline)
            raw_story = await helper.llm_client.generate(model_id=model.id, system_prompt=story_system, user_prompt=story_user, temperature=0.7)
            result = helper._parse_llm_response(raw_story)
            helper._validate_story_result(result)
        except LLMProviderError as exc:
            raise QuickCreateError(str(exc), 502) from exc
        except ValueError as exc:
            raise QuickCreateError(f"The story could not be written: {exc}", 502) from exc

        title = str(result.get("title") or "Untitled story").strip()[:300]
        text = str(result.get("content") or "").strip()
        options = request.model_dump(exclude={"model", "prompt"})
        item = QuickCreation(
            user_id=user.id,
            kind="story",
            status="done",
            title=title,
            prompt=request.prompt,
            model_id=model.id,
            settings=options,
            content={"versions": [{"no": 1, "title": title, "content": text, "instruction": None, "at": _now().isoformat()}], "current": 1},
        )
        self.db.add(item)
        self.db.commit()
        return self.serialize(item)

    async def edit_story(self, user: User, item_id: int, instruction: str) -> dict[str, Any]:
        item = self._get(user, item_id)
        if item.kind != "story":
            raise QuickCreateError("Only a story can be edited.")
        instruction = instruction.strip()
        if not instruction:
            raise QuickCreateError("Tell the AI what to change.")
        if len(instruction) > LIMITS["instruction"]:
            raise QuickCreateError(f"Keep the change under {LIMITS['instruction']} characters.")
        versions = list((item.content or {}).get("versions") or [])
        current_no = (item.content or {}).get("current") or (versions[-1]["no"] if versions else 1)
        base = next((v for v in versions if v["no"] == current_no), versions[-1] if versions else None)
        if base is None:
            raise QuickCreateError("This story has no text to edit.")
        from app.services.story_service import StoryService

        helper = StoryService(self.db)
        user_prompt = (
            f"\nExisting Story Title:\n{base['title']}\n\nExisting Story:\n{base['content']}\n\n"
            f"User's Editing Instruction:\n{instruction}\n\nReturn the complete revised story as JSON.\n"
        )
        try:
            raw = await helper.llm_client.generate(model_id=item.model_id, system_prompt=STORY_EDIT_SYSTEM_PROMPT, user_prompt=user_prompt, temperature=0.7)
            result = helper._parse_llm_response(raw)
            helper._validate_story_result(result)
        except LLMProviderError as exc:
            raise QuickCreateError(str(exc), 502) from exc
        except ValueError as exc:
            raise QuickCreateError(f"The change could not be made: {exc}", 502) from exc

        number = max(v["no"] for v in versions) + 1
        title = str(result.get("title") or base["title"]).strip()[:300]
        versions.append({"no": number, "title": title, "content": str(result.get("content") or "").strip(), "instruction": instruction, "at": _now().isoformat(), "from": base["no"]})
        item.content = {**(item.content or {}), "versions": versions, "current": number}
        item.title = title
        self.db.commit()
        return self.serialize(item)

    def use_story_version(self, user: User, item_id: int, number: int) -> dict[str, Any]:
        item = self._get(user, item_id)
        versions = (item.content or {}).get("versions") or []
        chosen = next((v for v in versions if v["no"] == number), None)
        if item.kind != "story" or chosen is None:
            raise QuickCreateError("That version was not found.", 404)
        item.content = {**(item.content or {}), "current": number}
        item.title = chosen["title"]
        self.db.commit()
        return self.serialize(item)

    # ============================================================ avatar video
    def start_avatar_video(
        self,
        user: User,
        *,
        image: bytes,
        script: str,
        model_id: str,
        aspect_ratio: str,
        language: str,
        voice_style: str,
    ) -> dict[str, Any]:
        if model_id not in settings.OPENROUTER_VIDEO_MODELS:
            raise QuickCreateError("Choose one of the offered video models.")
        if aspect_ratio not in qc.ASPECT_RATIOS:
            raise QuickCreateError("Choose one of the offered ratios.")
        script = script.strip()
        if not script:
            raise QuickCreateError("Write what the avatar should say.")
        if len(script) > LIMITS["script"]:
            raise QuickCreateError(f"Keep the script under {LIMITS['script']} characters.")
        if len(image) > LIMITS["upload_bytes"]:
            raise QuickCreateError("The picture is too large (10 MB at most).", 413)
        try:
            mime, ext = inspect_image(image)
        except ValueError as exc:
            raise QuickCreateError(str(exc)) from exc
        parts = split_script(script)
        if len(parts) > LIMITS["parts"]:
            raise QuickCreateError("This script is too long for one video. Please shorten it.")
        self._check_daily(user, "avatar_video")
        running = (
            self.db.query(QuickCreation)
            .filter(QuickCreation.user_id == user.id, QuickCreation.kind == "avatar_video", QuickCreation.status == "working")
            .all()
        )
        self._expire_stale(running)
        if any(r.status == "working" for r in running):
            raise QuickCreateError("One video is already being made. Please wait until it is ready.", 409)

        item = QuickCreation(
            user_id=user.id,
            kind="avatar_video",
            status="working",
            title=_short(script, 80),
            prompt=script,
            model_id=model_id,
            settings={"aspect_ratio": aspect_ratio, "language": language[:50], "voice_style": voice_style[:300]},
            source_key=self._save(user.id, image, ext),
            source_mime_type=mime,
            content={"parts": [{"no": i + 1, "text": t, "status": "waiting"} for i, t in enumerate(parts)], "stage": "parts"},
        )
        self.db.add(item)
        self.db.commit()
        return self.serialize(item)

    async def _script_in_language(self, script: str, language: str) -> str:
        """The script written in `language` (one AI pass; the script as it is when it already is, or if that fails)."""
        if _script_is_in(script, language):
            return script
        models = get_all_models()
        if not models:
            return script
        from app.clients.openrouter_client import OpenRouterClient

        system = SCRIPT_LANGUAGE_SYSTEM_PROMPT.format(language=language, script_hint=SCRIPT_HINTS.get(language, "in its usual script."))
        try:
            text = await OpenRouterClient().generate(model_id=models[0].id, system_prompt=system, user_prompt=script, temperature=0.2)
        except LLMProviderError:
            return script
        text = (text or "").strip().strip('"').strip()
        if not text or len(text) > LIMITS["script"] * 2:
            return script
        return text

    def run_avatar_video(self, item_id: int) -> None:
        """Make the video (a background task with its own database session)."""
        asyncio.run(self._run_avatar_video(item_id))

    def _set_part(self, item: QuickCreation, no: int, **changes) -> None:
        content = dict(item.content or {})
        content["parts"] = [{**p, **changes} if p["no"] == no else p for p in content.get("parts", [])]
        item.content = content
        self.db.commit()

    async def _run_avatar_video(self, item_id: int) -> None:
        item = self.db.get(QuickCreation, item_id)
        if item is None:
            return
        work = Path(tempfile.mkdtemp(prefix=f"qc-video-{item.id}-"))
        try:
            client = OpenRouterVideoClient()
            info = await client.get_model(item.model_id)
            if "first_frame" not in (info.get("supported_frame_images") or []):
                raise QuickCreateError("This video model cannot start from a picture. Please choose another model.")
            source = self.path_of(item.source_key)
            if source is None:
                raise QuickCreateError("The uploaded picture was not found.")
            frame = [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{item.source_mime_type};base64,{base64.b64encode(source.read_bytes()).decode('ascii')}"},
                    "frame_type": "first_frame",
                }
            ]
            ratio = item.settings.get("aspect_ratio") or "16:9"
            ratios = info.get("supported_aspect_ratios") or []
            aspect = ratio if not ratios or ratio in ratios else None
            resolutions = info.get("supported_resolutions") or []
            resolution = next((r for r in ["720p", "768p", "480p", "1080p"] if r in resolutions), resolutions[0] if resolutions else None)
            durations = sorted(d for d in (info.get("supported_durations") or []) if isinstance(d, int))
            audio = info.get("generate_audio")
            generate_audio = None if "heygen" in item.model_id else (True if audio is True else None)
            language = item.settings.get("language") or "English"
            spoken = SPOKEN_AS.get(language, language)
            style = item.settings.get("voice_style") or "natural, clear"

            # one language for the whole video: the script is written in it once, before it is cut into clips
            if not item.content.get("script_language"):
                text = await self._script_in_language(item.prompt, language)
                parts = split_script(text)
                content = dict(item.content)
                if text != item.prompt and 0 < len(parts) <= LIMITS["parts"]:
                    content["parts"] = [{"no": i + 1, "text": t, "status": "waiting"} for i, t in enumerate(parts)]
                    content["spoken_script"] = text
                content["script_language"] = language
                item.content = content
                self.db.commit()
            # every clip with the same seed, so the voice stays the same from clip to clip
            seed = (item.id * 7919) % 2_000_000_000 if info.get("seed") is not False else None

            clips: list[Path] = []
            all_parts = list(item.content.get("parts", []))
            for part in all_parts:
                self._set_part(item, part["no"], status="making")
                seconds = max(3, round(len(part["text"].split()) / WORDS_PER_SECOND) + 1)
                duration = next((d for d in durations if d >= seconds), durations[-1] if durations else None)
                prompt = (
                    f"Spoken language: {spoken} only. "
                    f"The person in the first frame looks into the camera and speaks {spoken}, with natural lip-sync, "
                    f"natural head movement and expressions. Voice: {style}. "
                    f"This is clip {part['no']} of {len(all_parts)} of one continuous video: use the same voice, accent "
                    f"and language ({spoken}) as in every other clip. Do not translate the words and never switch to "
                    f"English or any other language. "
                    f'They say exactly these {spoken} words, nothing more: "{part["text"]}"'
                )
                submission = await client.submit_video(
                    model=item.model_id,
                    prompt=prompt,
                    duration=duration,
                    aspect_ratio=aspect,
                    resolution=resolution,
                    generate_audio=generate_audio,
                    frame_images=frame,
                    seed=seed,
                )
                job = await client.poll_job(submission["id"], interval_seconds=8, max_wait_seconds=1500)
                clip = work / f"part-{part['no']:02d}.mp4"
                await client.download_video(job, str(clip))
                clips.append(clip)
                self._set_part(item, part["no"], status="done")

            content = dict(item.content)
            content["stage"] = "joining"
            item.content = content
            self.db.commit()
            size = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720), "4:3": (960, 720), "3:4": (720, 960), "21:9": (1680, 720)}.get(ratio, (1280, 720))
            if len(clips) == 1:
                final = clips[0]
            else:
                from app.services.video_assembly_service import VideoAssemblyService  # moviepy, the film module's joiner

                final = await asyncio.to_thread(VideoAssemblyService().assemble, clips, f"quick-{item.id}-{uuid.uuid4().hex[:8]}.mp4", resolution=size)
            key = f"{item.user_id}/{uuid.uuid4().hex}.mp4"
            target = STORAGE / key
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(final), target)
            item.storage_key = key
            item.mime_type = "video/mp4"
            item.file_size_bytes = target.stat().st_size
            item.status = "done"
            content = dict(item.content)
            content["stage"] = "done"
            item.content = content
            self.db.commit()
        except Exception as exc:  # noqa: BLE001 - every failure is shown on the item
            self.db.rollback()
            item = self.db.get(QuickCreation, item_id)
            if item is not None:
                item.status = "failed"
                message = exc.message if isinstance(exc, QuickCreateError) else str(exc)
                if isinstance(exc, (OpenRouterVideoError, TimeoutError)):
                    message = f"The video model could not make this: {message}"
                item.error_message = message[:1000] or "The video could not be made."
                content = dict(item.content or {})
                content["parts"] = [{**p, "status": "failed"} if p.get("status") == "making" else p for p in content.get("parts", [])]
                item.content = content
                self.db.commit()
        finally:
            shutil.rmtree(work, ignore_errors=True)

    # ============================================================ audio
    async def create_audio(
        self,
        user: User,
        *,
        model_id: str,
        voice: str,
        text: str,
        instructions: str,
        speed: float,
        language: str,
    ) -> dict[str, Any]:
        models = {m["id"]: m for m in await qc.audio_models()}
        model = models.get(model_id)
        if model is None:
            raise QuickCreateError("Choose one of the offered voice models.")
        if voice not in model["voices"]:
            raise QuickCreateError("Choose one of this model's voices.")
        text = text.strip()
        if not text:
            raise QuickCreateError("Write the text to be spoken.")
        if len(text) > LIMITS["audio_text"]:
            raise QuickCreateError(f"Keep the text under {LIMITS['audio_text']} characters.")
        speed = min(max(float(speed or 1.0), 0.5), 2.0)
        instructions = instructions.strip()[:500]
        if language and model["instructions"]:
            instructions = f"Speak in {language}. {instructions}".strip()
        self._check_daily(user, "audio")

        pieces = split_text(text)
        results: list[tuple[bytes, str]] = []
        try:
            for piece in pieces:
                results.append(await qc.speak(model_id=model_id, text=piece, voice=voice, instructions=instructions, speed=speed))
        except qc.QuickCreateProviderError as exc:
            raise QuickCreateError(str(exc), 502) from exc

        if all(kind == "pcm" for _, kind in results):
            data, ext, mime = qc.join_pcm([d for d, _ in results]), ".wav", "audio/wav"
        elif len(results) == 1:
            data, ext, mime = results[0][0], ".mp3", "audio/mpeg"
        else:
            data, ext, mime = await asyncio.to_thread(_join_mp3, results), ".mp3", "audio/mpeg"

        item = QuickCreation(
            user_id=user.id,
            kind="audio",
            status="done",
            title=_short(text, 80),
            prompt=text,
            model_id=model_id,
            settings={"voice": voice, "instructions": instructions, "speed": speed, "language": language[:50]},
            storage_key=self._save(user.id, data, ext),
            mime_type=mime,
            file_size_bytes=len(data),
            content={"pieces": len(pieces)},
        )
        self.db.add(item)
        self.db.commit()
        return self.serialize(item)


def _video_name(model_id: str) -> str:
    names = {
        "heygen/heygen-video-1": "HeyGen Video 1",
        "x-ai/grok-imagine-video-1.5-lite": "Grok Imagine Video 1.5 Lite",
        "black-forest-labs/flux-video-edit": "FLUX Video Edit",
        "minimax/hailuo-3-max": "Hailuo 3 Max",
        "alibaba/wan-3.0-prime": "Wan 3.0 Prime",
        "kwaivgi/kling-v3.0-std": "Kling 3.0",
    }
    return names.get(model_id, model_id.split("/")[-1])


def _join_mp3(results: list[tuple[bytes, str]]) -> bytes:
    """Several mp3 pieces -> one mp3 (moviepy)."""
    from moviepy import AudioFileClip, concatenate_audioclips

    work = Path(tempfile.mkdtemp(prefix="qc-audio-"))
    clips = []
    try:
        for i, (data, _) in enumerate(results):
            path = work / f"{i:02d}.mp3"
            path.write_bytes(data)
            clips.append(AudioFileClip(str(path)))
        joined = concatenate_audioclips(clips)
        out = work / "joined.mp3"
        joined.write_audiofile(str(out), codec="libmp3lame", logger=None)
        joined.close()
        return out.read_bytes()
    finally:
        for clip in clips:
            clip.close()
        shutil.rmtree(work, ignore_errors=True)
"""
Quick Create, "Short video": a finished short film (up to 30 seconds) from one prompt, made with Wan 3.0 only.

How one video is made (a background task; the item's `content` shows each step to the page):

    1. plan      a text model turns the prompt into a short film: a title, ONE look (the chosen style written out
                 as an art direction), the characters' exact looks, the sound, and 1 to 6 shots whose lengths add up
                 to the chosen length. Everything the user asked for is kept.
    2. frames    a key picture (the first frame) for every shot, drawn in that look. Shot 1's picture is passed as a
                 reference to every later one, so the characters, their clothes and the art style stay the same.
                 Starting each clip from a drawn frame is also what makes 2D, anime, clay or watercolor come out
                 as asked (a video model left alone drifts towards live action).
    3. clips     Wan 3.0 animates every frame into its shot (image-to-video, with sound), all shots with the same
                 seed, a few at a time.
    4. joining   the clips are joined, in order, into one MP4 (the film module's joiner).

The result is a QuickCreation of kind "short_video" (app/models/quick_creation.py): the video is its file, shot 1's
picture is its cover (the source file), and the shots' pictures are kept beside it (content["shots"][n]["frame_key"]).
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.clients import quick_create_clients as qc
from app.clients.openrouter_image_client import DEFAULT_IMAGE_MODEL, IMAGE_MODELS
from app.clients.openrouter_video_client import OpenRouterVideoClient, OpenRouterVideoError
from app.core.exceptions import LLMProviderError
from app.llm.model_registry import get_all_models, get_model
from app.models.quick_creation import QuickCreation

# ------------------------------------------------------------------ fixed choices
VIDEO_MODEL = "alibaba/wan-3.0"
VIDEO_MODEL_NAME = "Wan 3.0"
# the key pictures: a model that follows an art style closely and accepts reference pictures
FRAME_MODELS = ("openai/gpt-image-2.5-flare", "black-forest-labs/flux.2-pro", DEFAULT_IMAGE_MODEL)
# the planner: the strongest text model we have that writes clean JSON
PLAN_MODELS = ("google/gemini-2.5-flash", "openai/gpt-4o-mini")

LENGTHS = [5, 10, 15, 20, 30]  # seconds; 30 at most
MAX_SECONDS = 30
RATIOS = ["9:16", "16:9", "1:1"]
SHOT_MIN, SHOT_MAX = 3, 10  # seconds per shot
PARALLEL_CLIPS = 3

# The looks. `prompt` is the art direction every frame and clip is made with.
STYLES: dict[str, dict[str, str]] = {
    "auto": {
        "label": "Match my prompt",
        "prompt": "",  # the planner chooses the look that suits the prompt (and keeps any look the prompt names)
    },
    "realistic": {
        "label": "Realistic",
        "prompt": "photorealistic live-action footage, real people and real places, natural skin texture, true-to-life "
        "materials, natural lighting, shot on a modern cinema camera, shallow depth of field",
    },
    "cinematic": {
        "label": "Cinematic",
        "prompt": "cinematic film still, anamorphic widescreen look, dramatic motivated lighting, rich color grade, "
        "film grain, epic composition, movie-quality production design",
    },
    "3d": {
        "label": "3D animation",
        "prompt": "high-end 3D animated feature film look, stylized expressive characters with large eyes, soft global "
        "illumination, subsurface-scattered skin, detailed textures, polished CG render, family-film color palette",
    },
    "anime": {
        "label": "Anime",
        "prompt": "Japanese anime, cel-shaded characters with clean line art, expressive eyes, hand-painted detailed "
        "backgrounds, vivid colors, dramatic anime lighting and speed lines in action",
    },
    "2d": {
        "label": "2D cartoon",
        "prompt": "2D hand-drawn cartoon animation, flat colors, bold clean outlines, simple shapes, playful squash "
        "and stretch, bright cheerful palette, flat painted backgrounds",
    },
    "clay": {
        "label": "Claymation",
        "prompt": "stop-motion claymation, handmade plasticine characters with visible fingerprints and texture, "
        "miniature handcrafted sets, soft studio lighting, slightly choppy stop-motion movement",
    },
    "watercolor": {
        "label": "Watercolor",
        "prompt": "hand-painted watercolor animation, soft bleeding edges, visible paper texture, gentle washes of color, "
        "storybook illustration feel",
    },
    "comic": {
        "label": "Comic book",
        "prompt": "comic book and graphic novel art, bold ink lines, halftone shading, strong shadows, saturated colors, "
        "dynamic panel-like framing",
    },
    "pixel": {
        "label": "Pixel art",
        "prompt": "retro pixel art animation, crisp visible pixels, limited color palette, 16-bit video game look",
    },
}

LANGUAGES = ["English", "Hindi", "Hinglish", "Spanish", "French", "German", "Japanese", "Tamil", "Telugu", "Bengali", "Marathi"]
WORDS_PER_SECOND = 2.3  # how much can be said in a shot

PLAN_SYSTEM_PROMPT = """You are an award-winning director planning ONE short film of exactly {seconds} seconds, made with an
AI video model, shot by shot. Each shot starts from a picture (its first frame) and is then animated for its length,
with sound. The film must be excellent and must show exactly what the person asked for.

Rules
- Keep everything the person asked for: who, what, where, the mood, any look or style, any text they want said.
  Do not change the subject or add a different story. Make it vivid, specific and visually striking.
- A real arc in {seconds} seconds: a hook in the first shot, something that develops, a clear payoff in the last shot.
- {shots_rule}
- Every shot lasts {shot_min} to {shot_max} seconds (whole numbers) and the shot lengths add up to EXACTLY {seconds}.
- LOOK: {look_rule} Write it as one art direction (medium, rendering, palette, lighting, lens/camera feel). Every shot
  uses this same look.
- CHARACTERS: list each recurring character (at most 3) with a precise, unchanging look: age, build, face, hair,
  skin tone, clothes with colors, any prop. Use the same words every time they appear.
- frame: the exact first frame of the shot as a picture: who is where, pose, expression, composition, background,
  light. Self-contained (repeat the characters' looks briefly). Nothing written on screen, no captions, no logos.
- action: what moves during the shot, in time order, physically clear (one or two main movements; no sudden jumps).
- camera: one camera move or "static".
- sound: what is heard in the shot (ambience, effects, music mood). {sound_rule}
- line: {line_rule}
- Ratio {ratio}: compose for it.

Answer with JSON only, no other text:
{{"title": "...", "logline": "one sentence", "look": "...", "music": "the music and sound mood of the whole film",
  "setting": "...", "characters": [{{"name": "...", "look": "..."}}],
  "shots": [{{"seconds": 5, "frame": "...", "action": "...", "camera": "...", "sound": "...", "line": "", "speaker": ""}}]}}
"""


def _shots_rule(seconds: int) -> str:
    if seconds <= 5:
        return "Use exactly 1 shot."
    if seconds <= 10:
        return "Use 1 or 2 shots."
    if seconds <= 15:
        return "Use 2 or 3 shots."
    if seconds <= 20:
        return "Use 3 or 4 shots."
    return "Use 4 to 6 shots."


def _json_of(text: str) -> dict[str, Any] | None:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _clean(value: Any, limit: int = 1200) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def fit_lengths(wanted: list[int], total: int, durations: list[int]) -> list[int]:
    """
    Shot lengths that add up to `total`, each between SHOT_MIN and SHOT_MAX and one the video model accepts.
    `wanted` is what the planner asked for; the shots are kept in number when possible.
    """
    allowed = [d for d in durations if SHOT_MIN <= d <= SHOT_MAX] or list(range(SHOT_MIN, SHOT_MAX + 1))
    lo, hi = min(allowed), max(allowed)
    n = max(1, len(wanted))
    n = min(n, max(1, total // lo))  # not more shots than fit
    while n * hi < total:
        n += 1
    out = [min(max(int(w or 0), lo), hi) for w in (wanted + [lo] * n)[:n]]
    # spread the difference over the shots, last first
    diff = total - sum(out)
    i = n - 1
    guard = 0
    while diff != 0 and guard < 1000:
        step = 1 if diff > 0 else -1
        if lo <= out[i] + step <= hi:
            out[i] += step
            diff -= step
        i = (i - 1) % n
        guard += 1
    # snap to lengths the model accepts (Wan 3.0 takes every whole second, so this changes nothing there)
    out = [min(allowed, key=lambda d: abs(d - s)) for s in out]
    return out


class _Stopped(Exception):
    """The user stopped the video while it was being made."""


class ShortVideoMaker:
    """Makes one short video (QuickCreation, kind "short_video"); see the module notes."""

    def __init__(self, db: Session, service):
        self.db = db
        self.service = service  # QuickCreateService: files and storage

    # ============================================================ helpers
    def _item(self, item_id: int) -> QuickCreation | None:
        item = self.db.get(QuickCreation, item_id)
        if item is not None:
            self.db.refresh(item)
        return item

    def _update(self, item: QuickCreation, **content) -> None:
        data = dict(item.content or {})
        data.update(content)
        item.content = data
        self.db.commit()

    def _set_shot(self, item: QuickCreation, no: int, **changes) -> None:
        data = dict(item.content or {})
        data["shots"] = [{**s, **changes} if s["no"] == no else s for s in data.get("shots", [])]
        item.content = data
        self.db.commit()

    def _stopped(self, item: QuickCreation) -> bool:
        self.db.refresh(item)
        return item.status != "working"

    @staticmethod
    def _text_model() -> str | None:
        for model_id in PLAN_MODELS:
            if get_model(model_id) is not None:
                return model_id
        models = get_all_models()
        return models[0].id if models else None

    @staticmethod
    def frame_model() -> str:
        return next((m for m in FRAME_MODELS if m in IMAGE_MODELS), DEFAULT_IMAGE_MODEL)

    # ============================================================ 1. plan
    async def plan(self, *, prompt: str, style: str, seconds: int, ratio: str, language: str, sound: bool, durations: list[int]) -> dict[str, Any]:
        look = STYLES.get(style, STYLES["auto"])
        look_rule = (
            f"The person chose this look; use it exactly and make it rich and specific: {look['prompt']}."
            if look["prompt"]
            else "Choose the look that suits the prompt best. If the prompt names a look (anime, 3D, cartoon, realistic, "
            "claymation, watercolor...), use exactly that look."
        )
        sound_rule = "The film has sound." if sound else "The film is silent: write sound as an empty string."
        line_rule = (
            f'a short spoken line in {language} only (at most {WORDS_PER_SECOND:.0f} words per second of the shot), '
            f'or "" when nobody speaks. Only add speech when it helps the film or the person asked for it. '
            f'speaker: who says it ("Narrator" for a voice-over).'
            if sound
            else 'always "" (silent film).'
        )
        system = PLAN_SYSTEM_PROMPT.format(
            seconds=seconds,
            shots_rule=_shots_rule(seconds),
            shot_min=SHOT_MIN,
            shot_max=SHOT_MAX,
            look_rule=look_rule,
            sound_rule=sound_rule,
            line_rule=line_rule,
            ratio=ratio,
        )
        data: dict[str, Any] | None = None
        model_id = self._text_model()
        if model_id:
            from app.clients.openrouter_client import OpenRouterClient

            for attempt in range(2):
                try:
                    text = await OpenRouterClient().generate(model_id=model_id, system_prompt=system, user_prompt=prompt, temperature=0.7 if attempt == 0 else 0.4)
                except LLMProviderError:
                    continue
                data = _json_of(text)
                if data and isinstance(data.get("shots"), list) and data["shots"]:
                    break
                data = None
        return self._normalize(data, prompt=prompt, style=style, seconds=seconds, sound=sound, durations=durations)

    def _normalize(self, data: dict[str, Any] | None, *, prompt: str, style: str, seconds: int, sound: bool, durations: list[int]) -> dict[str, Any]:
        """The plan as the maker uses it; a plain one-shot plan from the prompt when the planner failed."""
        chosen = STYLES.get(style, STYLES["auto"])["prompt"]
        if not data:
            data = {
                "title": _clean(prompt, 80),
                "logline": _clean(prompt, 300),
                "look": chosen or "cinematic, beautifully lit, highly detailed",
                "music": "",
                "setting": "",
                "characters": [],
                "shots": [{"seconds": seconds, "frame": prompt, "action": prompt, "camera": "slow push in", "sound": "", "line": "", "speaker": ""}],
            }
        look = _clean(data.get("look"), 900)
        if chosen and chosen.split(",")[0].lower() not in look.lower():
            look = f"{chosen}. {look}".strip(". ")  # the chosen style always leads
        characters = [
            {"name": _clean(c.get("name"), 80), "look": _clean(c.get("look"), 600)}
            for c in (data.get("characters") or [])
            if isinstance(c, dict) and c.get("name")
        ][:3]
        raw = [s for s in data.get("shots") or [] if isinstance(s, dict)][:6] or [{"seconds": seconds, "frame": prompt, "action": prompt}]
        lengths = fit_lengths([int(s.get("seconds") or 0) if str(s.get("seconds") or "").isdigit() else 0 for s in raw], seconds, durations)
        shots = []
        for i, length in enumerate(lengths):
            s = raw[i] if i < len(raw) else raw[-1]
            line = _clean(s.get("line"), 400) if sound else ""
            words = line.split()
            limit = max(3, int(length * WORDS_PER_SECOND))
            if len(words) > limit:
                line = " ".join(words[:limit])
            shots.append(
                {
                    "no": i + 1,
                    "seconds": length,
                    "frame": _clean(s.get("frame") or s.get("action") or prompt),
                    "action": _clean(s.get("action") or s.get("frame") or prompt),
                    "camera": _clean(s.get("camera") or "static", 200),
                    "sound": _clean(s.get("sound"), 400) if sound else "",
                    "line": line,
                    "speaker": _clean(s.get("speaker"), 80) if line else "",
                    "frame_status": "waiting",
                    "clip_status": "waiting",
                }
            )
        return {
            "title": _clean(data.get("title") or prompt, 120),
            "logline": _clean(data.get("logline"), 400),
            "look": look,
            "music": _clean(data.get("music"), 400) if sound else "",
            "setting": _clean(data.get("setting"), 600),
            "characters": characters,
            "shots": shots,
        }

    # ============================================================ 2. frames
    def _frame_prompt(self, plan: dict[str, Any], shot: dict[str, Any], ratio: str) -> str:
        cast = " ".join(f"{c['name']}: {c['look']}." for c in plan["characters"] if c["name"].lower() in (shot["frame"] + shot["action"]).lower())
        parts = [
            f"Art style (follow exactly): {plan['look']}.",
            f"Scene: {shot['frame']}",
            f"Characters, exactly as described: {cast}" if cast else "",
            f"Setting: {plan['setting']}" if plan.get("setting") else "",
            f"A single {ratio} frame from a film, beautifully composed, sharp and detailed.",
            "No text, no letters, no captions, no subtitles, no watermark, no logo, no borders, no split panels.",
        ]
        return " ".join(p for p in parts if p)

    async def _draw(self, prompt: str, ratio: str, references: list[str]) -> tuple[bytes, str]:
        model = self.frame_model()
        try:
            pictures = await qc.generate_images(model_id=model, prompt=prompt, aspect_ratio=ratio, count=1, references=references or None)
        except qc.QuickCreateProviderError:
            if not references:
                raise
            # some models refuse references; the look is in the prompt too
            pictures = await qc.generate_images(model_id=model, prompt=prompt, aspect_ratio=ratio, count=1)
        return pictures[0]

    # ============================================================ 3. clips
    def _clip_prompt(self, plan: dict[str, Any], shot: dict[str, Any], total: int, language: str, sound: bool) -> str:
        cast = " ".join(f"{c['name']}: {c['look']}." for c in plan["characters"] if c["name"].lower() in (shot["frame"] + shot["action"]).lower())
        parts = [
            f"Shot {shot['no']} of {total} of one short film. Art style, keep it exactly as in the first frame: {plan['look']}.",
            f"Action: {shot['action']}",
            f"Camera: {shot['camera']}.",
            f"Characters keep exactly their look from the first frame. {cast}" if cast else "",
        ]
        if sound:
            heard = "; ".join(x for x in (shot.get("sound"), plan.get("music")) if x)
            if heard:
                parts.append(f"Sound: {heard}.")
            if shot.get("line"):
                who = shot.get("speaker") or "A voice"
                if who.lower() == "narrator":
                    parts.append(f'A narrator says in {language}, clearly: "{shot["line"]}"')
                else:
                    parts.append(f'{who} speaks {language} with natural lip-sync and says exactly: "{shot["line"]}"')
                parts.append(f"Speech in {language} only.")
        parts.append("Smooth natural motion, consistent characters, no text or captions on screen, no morphing, no flicker.")
        return " ".join(p for p in parts if p)

    async def _film(self, client: OpenRouterVideoClient, item: QuickCreation, shot: dict[str, Any], frame: Path, mime: str, *, prompt: str, ratio: str, resolution: str | None, sound: bool, seed: int | None, work: Path) -> Path:
        frames = [{"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(frame.read_bytes()).decode('ascii')}"}, "frame_type": "first_frame"}]
        last_error: Exception | None = None
        for attempt in range(2):  # one more try if the model fails a shot
            try:
                submission = await client.submit_video(
                    model=VIDEO_MODEL,
                    prompt=prompt,
                    duration=shot["seconds"],
                    aspect_ratio=ratio,
                    resolution=resolution,
                    generate_audio=True if sound else False,
                    frame_images=frames,
                    seed=seed if attempt == 0 else None,
                )
                job = await client.poll_job(submission["id"], interval_seconds=8, max_wait_seconds=1500)
                clip = work / f"shot-{shot['no']:02d}.mp4"
                await client.download_video(job, str(clip))
                return clip
            except (OpenRouterVideoError, TimeoutError) as exc:
                last_error = exc
        raise last_error or OpenRouterVideoError("The video model could not make this shot.")

    # ============================================================ the whole run
    async def run(self, item_id: int) -> None:
        from app.services.quick_create_service import STORAGE, QuickCreateError

        item = self._item(item_id)
        if item is None:
            return
        work = Path(tempfile.mkdtemp(prefix=f"qc-short-{item.id}-"))
        cfg = item.settings or {}
        seconds, ratio, style = int(cfg.get("seconds") or 15), cfg.get("aspect_ratio") or "9:16", cfg.get("style") or "auto"
        language, sound = cfg.get("language") or "English", bool(cfg.get("sound", True))
        try:
            client = OpenRouterVideoClient()
            try:
                info = await client.get_model(VIDEO_MODEL)
            except OpenRouterVideoError as exc:
                raise QuickCreateError("Wan 3.0 is not available right now. Please try again later.") from exc
            if "first_frame" not in (info.get("supported_frame_images") or ["first_frame"]):
                raise QuickCreateError("Wan 3.0 cannot start from a picture right now. Please try again later.")
            durations = sorted(d for d in (info.get("supported_durations") or list(range(2, 31))) if isinstance(d, int))
            ratios = info.get("supported_aspect_ratios") or []
            aspect = ratio if not ratios or ratio in ratios else None
            resolutions = info.get("supported_resolutions") or []
            resolution = next((r for r in ["720p", "1080p", "480p"] if r in resolutions), resolutions[0] if resolutions else None)
            seed = (item.id * 7919) % 2_000_000_000 if info.get("seed") is not False else None
            can_sound = info.get("generate_audio") is not False
            sound = sound and can_sound

            # 1. plan
            self._update(item, stage="planning")
            plan = await self.plan(prompt=item.prompt, style=style, seconds=seconds, ratio=ratio, language=language, sound=sound, durations=durations)
            if self._stopped(item):
                return
            item.title = plan["title"][:300] or item.title
            self._update(item, stage="frames", plan={k: v for k, v in plan.items() if k != "shots"}, shots=plan["shots"])

            # 2. frames, in order (shot 1's picture is the reference for the rest)
            frames: dict[int, tuple[Path, str]] = {}
            reference: list[str] = []
            for shot in plan["shots"]:
                if self._stopped(item):
                    return
                self._set_shot(item, shot["no"], frame_status="making")
                data, mime = await self._draw(self._frame_prompt(plan, shot, ratio), ratio, reference)
                ext = ".jpg" if "jpeg" in mime else ".webp" if "webp" in mime else ".png"
                key = self.service._save(item.user_id, data, ext)
                frames[shot["no"]] = (STORAGE / key, mime)
                if not reference:
                    reference = [f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"]
                    item.source_key, item.source_mime_type = key, mime  # the cover
                self._set_shot(item, shot["no"], frame_status="done", frame_key=key, frame_mime=mime)

            # 3. clips, a few at a time
            if self._stopped(item):
                return
            self._update(item, stage="clips")
            gate = asyncio.Semaphore(PARALLEL_CLIPS)
            total = len(plan["shots"])

            async def one(shot: dict[str, Any]) -> Path:
                async with gate:
                    if self._stopped(item):
                        raise _Stopped
                    self._set_shot(item, shot["no"], clip_status="making")
                    frame, mime = frames[shot["no"]]
                    clip = await self._film(
                        client, item, shot, frame, mime,
                        prompt=self._clip_prompt(plan, shot, total, language, sound),
                        ratio=aspect, resolution=resolution, sound=sound, seed=seed, work=work,
                    )
                    self._set_shot(item, shot["no"], clip_status="done")
                    return clip

            results = await asyncio.gather(*(one(s) for s in plan["shots"]), return_exceptions=True)
            if any(isinstance(r, _Stopped) for r in results) or self._stopped(item):
                return
            failed = next((r for r in results if isinstance(r, BaseException)), None)
            if failed is not None:
                raise failed
            clips = list(results)

            # 4. join
            if self._stopped(item):
                return
            self._update(item, stage="joining")
            size = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720)}.get(ratio, (1280, 720))
            if len(clips) == 1:
                final = clips[0]
            else:
                from app.services.video_assembly_service import VideoAssemblyService

                final = await asyncio.to_thread(VideoAssemblyService().assemble, list(clips), f"short-{item.id}-{uuid.uuid4().hex[:8]}.mp4", resolution=size)
            key = f"{item.user_id}/{uuid.uuid4().hex}.mp4"
            target = STORAGE / key
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(final), target)
            if self._stopped(item):
                target.unlink(missing_ok=True)
                return
            item.storage_key = key
            item.mime_type = "video/mp4"
            item.file_size_bytes = target.stat().st_size
            item.status = "done"
            self._update(item, stage="done")
        except Exception as exc:  # noqa: BLE001 - every failure is shown on the item
            self.db.rollback()
            item = self.db.get(QuickCreation, item_id)
            if item is not None and item.status == "working":
                message = getattr(exc, "message", None) or str(exc)
                if isinstance(exc, (OpenRouterVideoError, TimeoutError)):
                    message = f"Wan 3.0 could not make this video: {message}"
                elif isinstance(exc, qc.QuickCreateProviderError):
                    message = f"A picture for the video could not be made: {message}"
                item.status = "failed"
                item.error_message = (message or "The video could not be made.")[:1000]
                data = dict(item.content or {})
                data["shots"] = [
                    {**s, **({"frame_status": "failed"} if s.get("frame_status") == "making" else {}), **({"clip_status": "failed"} if s.get("clip_status") == "making" else {})}
                    for s in data.get("shots", [])
                ]
                item.content = data
                self.db.commit()
        finally:
            shutil.rmtree(work, ignore_errors=True)
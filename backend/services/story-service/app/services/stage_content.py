"""
What one stage of one story holds, for "Submit for review".

    has_content  the stage has some work in it (a written story, a storyboard, a character
                 profile or image, ...). An empty stage cannot be sent for review.
    fingerprint  a hash of that work. It is saved with every submission, so after a reviewer
                 asks for changes the same work cannot be sent again unchanged.

Only the stage's own work counts (for Characters: the profiles and images made in the Character
Studio, not the character list that comes from the storyboard). Times are left out, so saving
the same thing again does not count as a change.
"""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.models.character_master_image import CharacterMasterImage
from app.models.character_profile import CharacterProfile
from app.models.location_master_image import LocationMasterImage
from app.models.location_profile import LocationProfile
from app.models.scene_sketch import SceneSketch
from app.models.scene_video_clip import SceneVideoClip
from app.models.scenes import Scene
from app.models.story import Story
from app.models.story_board import StoryBoard
from app.models.video_generation_job import VideoGenerationJob

_TIMES = {"created_at", "updated_at", "started_at", "completed_at"}

EMPTY_MESSAGES = {
    "story": "The story is empty. Write it first, then send it for review.",
    "storyboard": "There is no storyboard for this story yet. Make it first, then send it for review.",
    "characters": "No character has a profile or an image yet. Make them first, then send them for review.",
    "locations": "No location has a profile or an image yet. Make them first, then send them for review.",
    "sketches": "No scene has a sketch yet. Make the sketches first, then send them for review.",
    "animation": "No scene has a clip yet. Make the clips first, then send them for review.",
}


def _plain(rows) -> list[dict]:
    """Every column of every row except the times, in a stable order."""
    out = []
    for row in rows:
        mapper = sa_inspect(row).mapper
        out.append({c.key: getattr(row, c.key) for c in mapper.column_attrs if c.key not in _TIMES})
    return sorted(out, key=lambda r: (str(r.get("id")),))


def _hash(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _has_file(row, *fields: str) -> bool:
    return any(getattr(row, f, None) for f in fields)


def stage_content(db: Session, story: Story, stage: str) -> tuple[bool, str]:
    """(has_content, fingerprint) of one stage of one story."""
    if stage == "story":
        text = (story.content or "").strip()
        return bool(text), _hash({"title": story.title, "content": text})

    boards = db.query(StoryBoard).filter(StoryBoard.story_id == story.id).all()
    board_ids = [b.id for b in boards]
    scenes = db.query(Scene).filter(Scene.story_board_id.in_(board_ids)).all() if board_ids else []
    scene_ids = [s.id for s in scenes]

    if stage == "storyboard":
        has = any(b.storyboard_data for b in boards)
        return has, _hash({"boards": _plain(boards), "scenes": _plain(scenes)})

    if stage in ("characters", "locations"):
        profile_model, image_model = (
            (CharacterProfile, CharacterMasterImage) if stage == "characters" else (LocationProfile, LocationMasterImage)
        )
        profiles = db.query(profile_model).filter(profile_model.story_board_id.in_(board_ids)).all() if board_ids else []
        images = db.query(image_model).filter(image_model.story_board_id.in_(board_ids)).all() if board_ids else []
        has = bool(profiles) or any(_has_file(i, "image_url", "storage_key") for i in images)
        return has, _hash({"profiles": _plain(profiles), "images": _plain(images)})

    if stage == "sketches":
        sketches = db.query(SceneSketch).filter(SceneSketch.scene_id.in_(scene_ids)).all() if scene_ids else []
        has = any(_has_file(s, "image_url", "storage_key") for s in sketches)
        return has, _hash({"sketches": _plain(sketches)})

    if stage == "animation":
        clips = db.query(SceneVideoClip).filter(SceneVideoClip.scene_id.in_(scene_ids)).all() if scene_ids else []
        jobs = db.query(VideoGenerationJob).filter(VideoGenerationJob.story_id == story.id).all()
        has = any(_has_file(c, "video_url", "storage_key") for c in clips) or any(
            _has_file(j, "output_video_url", "output_storage_key") for j in jobs
        )
        return has, _hash({"clips": _plain(clips), "jobs": _plain(jobs)})

    return False, _hash({})
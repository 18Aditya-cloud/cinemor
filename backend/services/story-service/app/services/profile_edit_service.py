"""
Changing a character's or a location's profile by hand.

The profile is made by AI (CharacterProfileGenerationService / LocationProfileGenerationService). People may then
change any single detail of it (a nose shape, the lighting of a place), so the next master image follows exactly
what they want. The latest profile row is updated in place; the master image, the sketches and the clips read it
from there. Making the profile again with AI replaces these changes.

Lists (clothing, landmarks...) are sent as "a, b, c" and kept as lists.
"""

from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.character_profile import CharacterProfile
from app.models.location_profile import LocationProfile

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
NOT_EDITABLE = {"style_name", "generation_metadata"}
MAX_VALUE = 1000
MAX_ITEMS = 30


@lru_cache(maxsize=2)
def _schema_keys(name: str) -> frozenset[str]:
    """The details a profile has, from its schema file (a JSON schema, or an example object)."""
    try:
        data = json.loads((PROMPTS / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return frozenset()
    keys = data.get("properties", data) if isinstance(data, dict) else {}
    return frozenset(k for k in keys if k not in NOT_EDITABLE)


class ProfileEditService:
    def __init__(self, db: Session):
        self.db = db

    def latest_character(self, storyboard_id: int, character_json_id: int) -> CharacterProfile | None:
        return (
            self.db.query(CharacterProfile)
            .filter(CharacterProfile.story_board_id == storyboard_id, CharacterProfile.character_json_id == character_json_id)
            .order_by(CharacterProfile.version.desc(), CharacterProfile.id.desc())
            .first()
        )

    def latest_location(self, storyboard_id: int, location_json_id: int) -> LocationProfile | None:
        return (
            self.db.query(LocationProfile)
            .filter(LocationProfile.story_board_id == storyboard_id, LocationProfile.location_json_id == location_json_id)
            .order_by(LocationProfile.version.desc(), LocationProfile.id.desc())
            .first()
        )

    def update(self, profile, fields: dict[str, str], *, schema: str):
        """Change some details of `profile`; unknown details are refused. Returns the profile."""
        if profile is None:
            raise LookupError("Make the profile first; then you can change its details.")
        if not fields:
            raise ValueError("Nothing to change.")
        data = copy.deepcopy(profile.profile_data or {})
        allowed = (set(_schema_keys(schema)) | set(data)) - NOT_EDITABLE
        for key, raw in fields.items():
            if key not in allowed:
                raise ValueError(f"“{key}” is not a detail of this profile.")
            text = " ".join(str(raw or "").split())
            if len(text) > MAX_VALUE:
                raise ValueError(f"Keep each detail under {MAX_VALUE} characters.")
            if isinstance(data.get(key), list):
                items = [part.strip() for part in text.replace(";", ",").split(",") if part.strip()]
                data[key] = items[:MAX_ITEMS]
            else:
                data[key] = text
        profile.profile_data = data
        flag_modified(profile, "profile_data")
        self.db.commit()
        self.db.refresh(profile)
        return profile
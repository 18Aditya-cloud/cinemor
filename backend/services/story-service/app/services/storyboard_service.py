
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.clients.openrouter_client import OpenRouterClient
from app.models.story_board import StoryBoard
from app.repositories.story_repository import StoryRepository
from app.repositories.storyboard_repository import StoryBoardRepository
from app.repositories.storyboard_entity_repository import (
    StoryboardEntityRepository,
)
from app.prompts.storyboard_prompt_loader import build_storyboard_prompt


class StoryboardGenerationError(Exception):
    """Raised when storyboard generation, validation, or persistence fails."""


class StoryboardService:
    """Generate a storyboard and persist its data across all storyboard tables."""

    REQUIRED_KEYS = {
        "story_metadata",
        "characters",
        "relationships",
        "locations",
        "objects",
        "narrator",
        "scenes",
    }

    LIST_KEYS = (
        "characters",
        "relationships",
        "locations",
        "objects",
        "scenes",
    )

    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm_client = OpenRouterClient()
        self.story_repository = StoryRepository(db)
        self.storyboard_repository = StoryBoardRepository(db)
        self.entity_repository = StoryboardEntityRepository(db)

    async def generate_storyboard(
        self,
        *,
        story_id: int,
        model_id: str | None = None,
    ) -> StoryBoard:
        """Generate, validate, and transactionally persist a complete storyboard."""

        try:
            story = self.story_repository.get_by_id(story_id)

            if story is None:
                raise ValueError(f"Story with ID {story_id} was not found.")

            story_content = (story.content or "").strip()
            if not story_content:
                raise ValueError(
                    "Cannot generate a storyboard from an empty story."
                )

            selected_model_id = model_id or getattr(story, "model_id", None)
            if not selected_model_id:
                raise ValueError(
                    "No model ID is available. Provide a model ID or save one "
                    "with the story before generating its storyboard."
                )

            prompt = build_storyboard_prompt(story_content)

            raw_response = await self.llm_client.generate(
                model_id=selected_model_id,
                system_prompt=(
                    "You are a precise story-to-storyboard JSON extraction "
                    "engine. Follow the supplied instructions and schema. "
                    "Return only one valid JSON object."
                ),
                user_prompt=prompt,
                temperature=0.1,
            )

            data = self._parse_and_validate(raw_response)

            metadata = data["story_metadata"]
            title = (
                self._text(metadata.get("title"))
                or self._text(getattr(story, "title", None))
                or f"Storyboard for Story {story_id}"
            )

            # Save the parent first. flush() assigns its database ID without
            # committing the transaction.
            storyboard = self.storyboard_repository.create_or_update(
                story_id=story_id,
                title=title[:500],
                metadata=metadata,
                storyboard_data=data,
                status="draft",
            )

            self.db.flush()

            # Remove old child records when regenerating an existing storyboard.
            # The complete operation remains inside the same transaction.
            self.entity_repository.delete_entities(storyboard.id)

            self._persist_entities(
                storyboard_id=storyboard.id,
                data=data,
            )

            self.db.commit()
            self.db.refresh(storyboard)
            return storyboard

        except ValueError:
            self.db.rollback()
            raise

        except StoryboardGenerationError:
            self.db.rollback()
            raise

        except Exception as exc:
            self.db.rollback()
            raise StoryboardGenerationError(
                f"Failed to generate or persist the storyboard for story "
                f"{story_id}: {exc}"
            ) from exc

    def _persist_entities(
        self,
        *,
        storyboard_id: int,
        data: dict[str, Any],
    ) -> None:
        """Insert all normalized records while preserving their original JSON IDs."""

        metadata = data["story_metadata"]
        default_language = (
            self._text(metadata.get("language")) or "unknown"
        )

        # JSON ID -> database primary key mappings.
        location_ids: dict[int, int] = {}
        scene_ids: dict[int, int] = {}
        character_ids: dict[int, int] = {}

        # ---------------------------------------------------------------
        # 1. Global locations
        # ---------------------------------------------------------------
        for item in data["locations"]:
            json_id = self._required_id(item, "location_id", "location")

            location = self.entity_repository.add_location(
                story_board_id=storyboard_id,
                location_json_id=json_id,
                name=self._text(item.get("name")),
                aliases=self._list(item.get("aliases")),
                description=self._text(item.get("description")),
                location_type=self._text(item.get("type")) or "unknown",
                first_appearance_scene_id=self._int(
                    item.get("first_appearance_scene_id"), default=0
                ),
                location_data=item,
            )
            location_ids[json_id] = location.id

        # Build a case-insensitive lookup from global location names/aliases.
        location_name_to_db_id: dict[str, int] = {}

        for item in data["locations"]:
            json_id = self._required_id(item, "location_id", "location")
            db_id = location_ids[json_id]

            for name in [
                item.get("name"),
                *self._list(item.get("aliases")),
            ]:
                normalized = self._text(name).strip().casefold()
                if normalized:
                    location_name_to_db_id.setdefault(normalized, db_id)

        # ---------------------------------------------------------------
        # 2. Scenes
        # ---------------------------------------------------------------
        for item in data["scenes"]:
            json_id = self._required_id(item, "scene_id", "scene")
            nested_location = item.get("location")
            if not isinstance(nested_location, dict):
                nested_location = {}

            location_name = self._text(nested_location.get("name"))
            location_key = location_name.strip().casefold()
            location_db_id = location_name_to_db_id.get(location_key)

            scene = self.entity_repository.add_scene(
                story_board_id=storyboard_id,
                scene_json_id=json_id,
                location_id=location_db_id,
                title=self._text(item.get("title")),
                importance=self._text(item.get("importance")) or "minor",
                summary=self._text(item.get("summary")),
                primary_action=self._text(item.get("primary_action")),
                overall_emotion=(
                    self._text(item.get("overall_emotion")) or "unknown"
                ),
                visual_description=self._text(
                    item.get("visual_description")
                ),
                camera_suggestion=self._text(item.get("camera_suggestion")),
                scene_transition=self._text(item.get("scene_transition")),
                language=(
                    self._text(item.get("language")) or default_language
                )[:20],
                extraction_confidence=self._int(
                    item.get("extraction_confidence"), default=95
                ),
                scene_location_name=location_name,
                scene_location_type=(
                    self._text(nested_location.get("type")) or "unknown"
                ),
                scene_location_time_of_day=(
                    self._text(nested_location.get("time_of_day"))
                    or "unspecified"
                ),
                scene_location_description=self._text(
                    nested_location.get("description")
                ),
                scene_data=item,
            )
            scene_ids[json_id] = scene.id

        # ---------------------------------------------------------------
        # 3. Characters
        # ---------------------------------------------------------------
        for item in data["characters"]:
            json_id = self._required_id(
                item, "character_id", "character"
            )
            appearance = item.get("appearance")
            if not isinstance(appearance, dict):
                appearance = {}

            character = self.entity_repository.add_character(
                story_board_id=storyboard_id,
                character_json_id=json_id,
                name=self._text(item.get("name")),
                aliases=self._list(item.get("aliases")),
                is_revealed=bool(item.get("is_revealed", False)),
                revealed_identity=self._text(
                    item.get("revealed_identity")
                ),
                role=self._text(item.get("role")) or "minor",
                importance=self._text(item.get("importance")) or "tertiary",
                first_appearance_scene_id=self._int(
                    item.get("first_appearance_scene_id"), default=0
                ),
                description=self._text(item.get("description")),
                appearance=appearance,
                gender=self._text(item.get("gender")) or "unknown",
                age_group=self._text(item.get("age_group")) or "unknown",
                dominant_emotions=self._list(
                    item.get("dominant_emotions")
                ),
            )
            character_ids[json_id] = character.id

        # ---------------------------------------------------------------
        # 4. Character appearance history
        # ---------------------------------------------------------------
        for item in data["characters"]:
            character_json_id = self._required_id(
                item, "character_id", "character"
            )
            history = item.get("appearance_history", [])

            if history is None:
                history = []
            if not isinstance(history, list):
                raise StoryboardGenerationError(
                    f"appearance_history for character "
                    f"{character_json_id} must be an array."
                )

            for entry in history:
                if not isinstance(entry, dict):
                    raise StoryboardGenerationError(
                        "Each character appearance history entry must be "
                        "a JSON object."
                    )

                scene_json_id = self._int(
                    entry.get("scene_id"), default=0
                )

                self.entity_repository.add_appearance(
                    character_id=character_ids[character_json_id],
                    scene_id=scene_ids.get(scene_json_id),
                    age_group=(
                        self._text(entry.get("age_group")) or "unknown"
                    ),
                    physical_traits=self._text(
                        entry.get("physical_traits")
                    ),
                    clothing=self._text(entry.get("clothing")),
                    special_features=self._text(
                        entry.get("special_features")
                    ),
                    appearance_data=entry,
                )

        # ---------------------------------------------------------------
        # 5. Character relationships
        # ---------------------------------------------------------------
        for item in data["relationships"]:
            source_id = self._required_id(
                item, "source_id", "relationship source"
            )
            target_id = self._required_id(
                item, "target_id", "relationship target"
            )

            if source_id not in character_ids or target_id not in character_ids:
                raise StoryboardGenerationError(
                    f"Relationship references an unknown character ID: "
                    f"{source_id} -> {target_id}."
                )

            self.entity_repository.add_relationship(
                story_board_id=storyboard_id,
                source_json_id=source_id,
                target_json_id=target_id,
                relationship_type=(
                    self._text(item.get("type")) or "relative"
                ),
                directional=bool(item.get("directional", False)),
                description=self._text(item.get("description")),
                relationship_data=item,
            )

        # ---------------------------------------------------------------
        # 6. Story objects
        # ---------------------------------------------------------------
        for item in data["objects"]:
            object_json_id = self._required_id(
                item, "object_id", "object"
            )
            first_scene_json_id = self._int(
                item.get("first_appearance_scene_id"), default=0
            )

            self.entity_repository.add_object(
                story_board_id=storyboard_id,
                object_json_id=object_json_id,
                scene_id=scene_ids.get(first_scene_json_id),
                name=self._text(item.get("name")),
                aliases=self._list(item.get("aliases")),
                description=self._text(item.get("description")),
                category=self._text(item.get("category")) or "other",
                owner_character_json_id=self._int(
                    item.get("owner_character_id"), default=0
                ),
                current_location_json_id=self._int(
                    item.get("current_location_id"), default=0
                ),
                first_appearance_scene_id=first_scene_json_id,
                object_data=item,
            )

        # ---------------------------------------------------------------
        # 7. Narrator (one record per storyboard)
        # ---------------------------------------------------------------
        narrator_data = data["narrator"]

        self.entity_repository.add_narrator(
            story_board_id=storyboard_id,
            present=bool(narrator_data.get("present", False)),
            narrator_json_id=self._int(
                narrator_data.get("narrator_id"), default=0
            ),
            point_of_view=(
                self._text(narrator_data.get("point_of_view"))
                or "third_person_omniscient"
            ),
            description=self._text(narrator_data.get("description")),
            narrator_data=narrator_data,
        )

        # ---------------------------------------------------------------
        # 8. Characters present in each scene
        # ---------------------------------------------------------------
        for item in data["scenes"]:
            scene_json_id = self._required_id(
                item, "scene_id", "scene"
            )
            scene_db_id = scene_ids[scene_json_id]

            present_characters = item.get("characters_present", [])
            if present_characters is None:
                present_characters = []
            if not isinstance(present_characters, list):
                raise StoryboardGenerationError(
                    f"characters_present for scene {scene_json_id} "
                    "must be an array."
                )

            for entry in present_characters:
                if not isinstance(entry, dict):
                    raise StoryboardGenerationError(
                        "Each characters_present entry must be a JSON object."
                    )

                character_json_id = self._required_id(
                    entry, "character_id", "scene character"
                )

                if character_json_id not in character_ids:
                    raise StoryboardGenerationError(
                        f"Scene {scene_json_id} references unknown "
                        f"character ID {character_json_id}."
                    )

                self.entity_repository.add_scene_character(
                    scene_id=scene_db_id,
                    character_id=character_ids[character_json_id],
                    emotion=self._text(entry.get("emotion")),
                    emotion_intensity=(
                        self._text(entry.get("emotion_intensity"))
                        or "medium"
                    ),
                )

        # ---------------------------------------------------------------
        # 9. Dialogues
        # ---------------------------------------------------------------
        for item in data["scenes"]:
            scene_json_id = self._required_id(
                item, "scene_id", "scene"
            )
            scene_db_id = scene_ids[scene_json_id]

            dialogues = item.get("dialogues", [])
            if dialogues is None:
                dialogues = []
            if not isinstance(dialogues, list):
                raise StoryboardGenerationError(
                    f"Dialogues for scene {scene_json_id} must be an array."
                )

            scene_language = (
                self._text(item.get("language")) or default_language
            )[:20]

            for entry in dialogues:
                if not isinstance(entry, dict):
                    raise StoryboardGenerationError(
                        "Each dialogue entry must be a JSON object."
                    )

                speaker_type = (
                    self._text(entry.get("speaker_type")) or "narrator"
                )
                speaker_json_id = self._int(
                    entry.get("speaker_id"), default=0
                )

                if (
                    speaker_type == "character"
                    and speaker_json_id not in character_ids
                ):
                    raise StoryboardGenerationError(
                        f"Dialogue in scene {scene_json_id} references "
                        f"unknown character ID {speaker_json_id}."
                    )

                self.entity_repository.add_dialogue(
                    scene_id=scene_db_id,
                    dialogue_json_id=self._int(
                        entry.get("dialogue_id"), default=0
                    ),
                    speaker_type=speaker_type,
                    speaker_json_id=speaker_json_id,
                    speaker_name=self._text(entry.get("speaker_name")),
                    dialogue_text=self._text(entry.get("text")),
                    language=(
                        self._text(entry.get("language"))
                        or scene_language
                    )[:20],
                    emotion=(
                        self._text(entry.get("emotion")) or "unknown"
                    ),
                    delivery=self._text(entry.get("delivery")),
                    dialogue_data=entry,
                )


    def import_storyboard(
        self,
        *,
        story_id: int,
        data: dict[str, Any],
    ) -> StoryBoard:
        """Validate and import an uploaded storyboard transactionally."""

        try:
            story = self.story_repository.get_by_id(story_id)

            if story is None:
                raise ValueError(f"Story with ID {story_id} was not found.")

            # Reuse the existing structure and reference validation.
            data = self._parse_and_validate(
                json.dumps(data, ensure_ascii=False)
            )

            # Validate references before changing existing records.
            character_ids = {
                self._required_id(item, "character_id", "character")
                for item in data["characters"]
            }
            location_ids = {
                self._required_id(item, "location_id", "location")
                for item in data["locations"]
            }
            scene_ids = {
                self._required_id(item, "scene_id", "scene")
                for item in data["scenes"]
            }

            for item in data["relationships"]:
                source_id = self._required_id(
                    item, "source_id", "relationship source"
                )
                target_id = self._required_id(
                    item, "target_id", "relationship target"
                )
                if (
                    source_id not in character_ids
                    or target_id not in character_ids
                ):
                    raise StoryboardGenerationError(
                        f"Relationship references an unknown character: "
                        f"{source_id} -> {target_id}."
                    )

            for character in data["characters"]:
                first_scene_id = self._int(
                    character.get("first_appearance_scene_id")
                )
                if first_scene_id and first_scene_id not in scene_ids:
                    raise StoryboardGenerationError(
                        f"Character {character['character_id']} references "
                        f"unknown scene {first_scene_id}."
                    )

                for appearance in character.get("appearance_history") or []:
                    appearance_scene_id = self._int(
                        appearance.get("scene_id")
                    )
                    if (
                        appearance_scene_id
                        and appearance_scene_id not in scene_ids
                    ):
                        raise StoryboardGenerationError(
                            f"Character appearance references unknown scene "
                            f"{appearance_scene_id}."
                        )

            for item in data["scenes"]:
                for entry in item.get("characters_present") or []:
                    character_id = self._required_id(
                        entry, "character_id", "scene character"
                    )
                    if character_id not in character_ids:
                        raise StoryboardGenerationError(
                            f"Scene {item['scene_id']} references unknown "
                            f"character {character_id}."
                        )

                for entry in item.get("dialogues") or []:
                    if entry.get("speaker_type") == "character":
                        speaker_id = self._int(entry.get("speaker_id"))
                        if speaker_id not in character_ids:
                            raise StoryboardGenerationError(
                                f"Dialogue references unknown character "
                                f"{speaker_id}."
                            )

                nested_location = item.get("location") or {}
                location_name = self._text(nested_location.get("name")).strip()

                if location_name and not any(
                    location_name.casefold() == self._text(loc.get("name")).strip().casefold()
                    or location_name.casefold() in {
                        self._text(alias).strip().casefold()
                        for alias in (loc.get("aliases") or [])
                    }
                    for loc in data["locations"]
                ):
                    raise StoryboardGenerationError(
                        f"Scene {item['scene_id']} references an unknown "
                        f"location '{location_name}'."
                    )

            for item in data["objects"]:
                owner_id = self._int(item.get("owner_character_id"))
                location_id = self._int(item.get("current_location_id"))
                first_scene_id = self._int(
                    item.get("first_appearance_scene_id")
                )

                if owner_id and owner_id not in character_ids:
                    raise StoryboardGenerationError(
                        f"Object {item.get('object_id')} references unknown "
                        f"owner character {owner_id}."
                    )

                if location_id and location_id not in location_ids:
                    raise StoryboardGenerationError(
                        f"Object {item.get('object_id')} references unknown "
                        f"location {location_id}."
                    )

                if first_scene_id and first_scene_id not in scene_ids:
                    raise StoryboardGenerationError(
                        f"Object {item.get('object_id')} references unknown "
                        f"scene {first_scene_id}."
                    )

            metadata = data["story_metadata"]
            title = (
                self._text(metadata.get("title"))
                or self._text(getattr(story, "title", None))
                or f"Storyboard for Story {story_id}"
            )

            storyboard = self.storyboard_repository.create_or_update(
                story_id=story_id,
                title=title[:500],
                metadata=metadata,
                storyboard_data=data,
                status="draft",
            )

            self.db.flush()
            self.entity_repository.delete_entities(storyboard.id)
            self._persist_entities(
                storyboard_id=storyboard.id,
                data=data,
            )

            self.db.commit()
            self.db.refresh(storyboard)
            return storyboard

        except ValueError:
            self.db.rollback()
            raise

        except StoryboardGenerationError:
            self.db.rollback()
            raise

        except Exception as exc:
            self.db.rollback()
            raise StoryboardGenerationError(
                f"Failed to import storyboard for story {story_id}: {exc}"
            ) from exc


    @classmethod
    def _parse_and_validate(cls, raw_response: str) -> dict[str, Any]:
        """Parse the model output and validate the expected JSON structure."""

        if not isinstance(raw_response, str) or not raw_response.strip():
            raise StoryboardGenerationError(
                "The model returned an empty storyboard response."
            )

        response = raw_response.strip()
        response = re.sub(
            r"\A```(?:json)?\s*|\s*```\Z",
            "",
            response,
            flags=re.IGNORECASE,
        ).strip()

        try:
            data = json.loads(response)
        except json.JSONDecodeError as exc:
            raise StoryboardGenerationError(
                f"The model returned invalid JSON: {exc.msg} "
                f"(line {exc.lineno}, column {exc.colno})."
            ) from exc

        if not isinstance(data, dict):
            raise StoryboardGenerationError(
                "The storyboard response must be a JSON object."
            )

        missing_keys = cls.REQUIRED_KEYS - data.keys()
        if missing_keys:
            raise StoryboardGenerationError(
                "The storyboard response is missing required top-level keys: "
                + ", ".join(sorted(missing_keys))
            )

        if not isinstance(data["story_metadata"], dict):
            raise StoryboardGenerationError(
                "Storyboard field 'story_metadata' must be a JSON object."
            )

        if not isinstance(data["narrator"], dict):
            raise StoryboardGenerationError(
                "Storyboard field 'narrator' must be a JSON object."
            )

        for key in cls.LIST_KEYS:
            if not isinstance(data[key], list):
                raise StoryboardGenerationError(
                    f"Storyboard field '{key}' must be a JSON array."
                )

            for index, item in enumerate(data[key]):
                if not isinstance(item, dict):
                    raise StoryboardGenerationError(
                        f"Entry {index} in '{key}' must be a JSON object."
                    )

        # Ensure IDs are usable as unambiguous mapping keys.
        id_fields = {
            "characters": "character_id",
            "locations": "location_id",
            "objects": "object_id",
            "scenes": "scene_id",
        }

        for collection, id_field in id_fields.items():
            seen: set[int] = set()

            for item in data[collection]:
                json_id = cls._required_id(item, id_field, collection)

                if json_id in seen:
                    raise StoryboardGenerationError(
                        f"Duplicate {id_field} {json_id} in '{collection}'."
                    )
                seen.add(json_id)

        for scene in data["scenes"]:
            for nested_key in ("characters_present", "dialogues"):
                nested_value = scene.get(nested_key, [])

                if nested_value is None:
                    continue

                if not isinstance(nested_value, list):
                    raise StoryboardGenerationError(
                        f"'{nested_key}' in scene "
                        f"{scene.get('scene_id')} must be an array."
                    )

                if any(not isinstance(entry, dict) for entry in nested_value):
                    raise StoryboardGenerationError(
                        f"Every entry in '{nested_key}' must be an object."
                    )

            nested_location = scene.get("location", {})
            if nested_location is not None and not isinstance(
                nested_location, dict
            ):
                raise StoryboardGenerationError(
                    f"'location' in scene {scene.get('scene_id')} "
                    "must be an object."
                )
        character_ids = {item.get("character_id") for item in data["characters"]}
        data["relationships"] = [
            item
            for item in data["relationships"]
            if item.get("source_id") in character_ids
            and item.get("target_id") in character_ids
        ]
        return data

    @staticmethod
    def _text(value: Any) -> str:
        """Convert optional text fields to safe, non-null strings."""
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return str(value)

    @staticmethod
    def _list(value: Any) -> list:
        """Return a list for JSON array fields."""
        if value is None:
            return []
        if isinstance(value, list):
            return value
        raise StoryboardGenerationError(
            "Expected a JSON array but received a different data type."
        )

    @staticmethod
    def _int(value: Any, *, default: int = 0) -> int:
        """Convert an ID or integer field safely."""
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, str):
            try:
                return int(value.strip())
            except ValueError:
                return default
        return default

    @classmethod
    def _required_id(
        cls,
        item: dict[str, Any],
        field: str,
        entity_name: str,
    ) -> int:
        """Require an integer JSON ID, without silently replacing missing IDs."""

        value = item.get(field)

        if isinstance(value, bool):
            raise StoryboardGenerationError(
                f"Invalid {field} in {entity_name}: expected an integer ID."
            )

        if isinstance(value, int):
            return value

        if isinstance(value, str):
            try:
                return int(value.strip())
            except ValueError:
                pass

        raise StoryboardGenerationError(
            f"Missing or invalid '{field}' in {entity_name}."
        )

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.clients.openrouter_client import OpenRouterClient
from app.llm.model_service import ModelService
from app.models.character_profile import CharacterProfile
from app.models.story_board import StoryBoard

logger = logging.getLogger(__name__)


class CharacterProfileGenerationService:
    """Generate, validate, and persist structured character profiles."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm_client = OpenRouterClient()
        self.model_service = ModelService()
        self.prompt_dir = Path(__file__).resolve().parents[1] / "prompts"
        self.prompt_path = self.prompt_dir / "character_profile_prompt.txt"
        self.schema_path = self.prompt_dir / "character_profile_schema.json"

    async def generate_storyboard_character_profile(
        self,
        *,
        storyboard_id: int,
        character_json_id: int,
        style_name: str,
        style_instructions: str = "",
        customization_instructions: str = "",
        reference_information: str = "",
        model_id: str | None = None,
    ) -> CharacterProfile:
        """Generate a profile using a character from the saved storyboard."""
        storyboard = (
            self.db.query(StoryBoard)
            .filter(StoryBoard.id == storyboard_id)
            .first()
        )
        if storyboard is None:
            raise ValueError("Storyboard not found.")

        data = storyboard.storyboard_data or {}
        characters = data.get("characters", [])
        character = next(
            (
                item
                for item in characters
                if isinstance(item, dict)
                and str(item.get("character_id")) == str(character_json_id)
            ),
            None,
        )
        if character is None:
            raise ValueError(
                f"Character ID {character_json_id} was not found "
                f"in storyboard {storyboard_id}."
            )

        selected_model_id = model_id or data.get("story_metadata", {}).get("model_id")
        if not selected_model_id:
            raise ValueError(
                "Provide model_id because the storyboard does not "
                "contain a model_id in story_metadata."
            )

        character_information = {
            "character_id": character.get("character_id"),
            "name": character.get("name", ""),
            "description": character.get("description", ""),
            "appearance": character.get("appearance", {}),
            "appearance_history": character.get("appearance_history", []),
            "role": character.get("role", ""),
            "gender": character.get("gender", ""),
            "age_group": character.get("age_group", ""),
            "dominant_emotions": character.get("dominant_emotions", []),
        }

        return await self.generate_profile(
            storyboard_id=storyboard_id,
            character_json_id=character_json_id,
            character_name=str(character.get("name") or "Unnamed Character"),
            character_information=character_information,
            style_name=style_name,
            style_instructions=style_instructions,
            customization_instructions=customization_instructions,
            reference_information=reference_information,
            model_id=selected_model_id,
        )

    @staticmethod
    def _remove_code_fences(response: str) -> str:
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[-1]
            if response.rstrip().endswith("```"):
                response = response.rstrip()[:-3]
        return response.strip()

    def _load_template(self) -> tuple[str, dict[str, Any]]:
        if not self.prompt_path.exists():
            raise FileNotFoundError(
                f"Character profile prompt not found: {self.prompt_path}"
            )
        if not self.schema_path.exists():
            raise FileNotFoundError(
                f"Character profile schema not found: {self.schema_path}"
            )
        template = self.prompt_path.read_text(encoding="utf-8")
        schema = json.loads(self.schema_path.read_text(encoding="utf-8"))
        return template, schema

    @staticmethod
    def _validate_profile(
        profile: dict[str, Any], schema: dict[str, Any]
    ) -> None:
        try:
            import jsonschema
            jsonschema.validate(instance=profile, schema=schema)
        except ImportError as exc:
            raise RuntimeError(
                "Install jsonschema using: pip install jsonschema"
            ) from exc
        except Exception as exc:
            raise ValueError(
                f"Generated character profile failed schema validation: {exc}"
            ) from exc

    async def generate_profile(
        self,
        *,
        storyboard_id: int,
        character_json_id: int,
        character_name: str,
        character_information: dict[str, Any],
        style_name: str,
        style_instructions: str = "",
        customization_instructions: str = "",
        reference_information: str = "",
        model_id: str,
    ) -> CharacterProfile:
        """Generate and save one character's canonical profile."""
        if not character_name.strip():
            raise ValueError("Character name cannot be empty.")
        if not style_name.strip():
            raise ValueError("A character design style must be selected.")

        # Lock the storyboard row while selecting the next version. This prevents
        # two concurrent requests for this storyboard from selecting the same
        # version number. The lock is released when the generating row is committed.
        storyboard = (
            self.db.query(StoryBoard)
            .filter(StoryBoard.id == storyboard_id)
            .with_for_update()
            .first()
        )
        if storyboard is None:
            raise ValueError("Storyboard not found.")

        template, schema = self._load_template()
        selected_model = self.model_service.validate_model(model_id)
        replacements = {
            "{{STYLE_NAME}}": style_name,
            "{{STYLE_INSTRUCTIONS}}": style_instructions,
            "{{CUSTOMIZATION_INSTRUCTIONS}}": customization_instructions,
            "{{REFERENCE_INFORMATION}}": reference_information,
            "{{CHARACTER_INFORMATION}}": json.dumps(
                character_information, ensure_ascii=False, indent=2
            ),
            "{{OUTPUT_SCHEMA}}": json.dumps(schema, ensure_ascii=False, indent=2),
        }
        prompt = template
        for placeholder, value in replacements.items():
            prompt = prompt.replace(placeholder, value)

        max_version = (
            self.db.query(func.max(CharacterProfile.version))
            .filter(
                CharacterProfile.story_board_id == storyboard_id,
                CharacterProfile.character_json_id == character_json_id,
            )
            .scalar()
        )
        next_version = (max_version or 0) + 1

        record = CharacterProfile(
            story_board_id=storyboard_id,
            character_json_id=character_json_id,
            character_name=character_name.strip(),
            profile_data={},
            customization_prompt=customization_instructions,
            style_name=style_name,
            status="generating",
            model_name=selected_model.id,
            model_version="",
            error_message=None,
            version=next_version,
        )
        self.db.add(record)
        try:
            # Flush/commit the new version before the long-running LLM request.
            self.db.commit()
            self.db.refresh(record)
        except Exception:
            self.db.rollback()
            logger.exception(
                "Could not create character profile row: storyboard=%s, "
                "character=%s, attempted_version=%s",
                storyboard_id,
                character_json_id,
                next_version,
            )
            raise

        try:
            raw_response = await self.llm_client.generate(
                model_id=selected_model.id,
                system_prompt=prompt,
                user_prompt=(
                    "Generate the permanent visual identity profile for this "
                    "character. Follow the supplied prompt and JSON schema. "
                    "Return only the JSON object."
                ),
                temperature=0.2,
            )
            profile = json.loads(self._remove_code_fences(raw_response))
            if not isinstance(profile, dict):
                raise ValueError("The generated profile must be a JSON object.")
            self._validate_profile(profile, schema)

            # Keep style and model metadata consistent with the actual request.
            profile["style_name"] = style_name
            metadata = profile.setdefault("generation_metadata", {})
            metadata["model"] = selected_model.id

            record.profile_data = profile
            record.model_name = selected_model.id
            record.model_version = str(metadata.get("version", ""))
            record.status = "generated"
            record.error_message = None
            self.db.commit()
            self.db.refresh(record)
            return record

        except Exception as exc:
            logger.exception(
                "Character profile generation failed: character=%s, model=%s",
                character_name,
                selected_model.id,
            )
            self.db.rollback()
            failed_record = (
                self.db.query(CharacterProfile)
                .filter(CharacterProfile.id == record.id)
                .first()
            )
            if failed_record is not None:
                failed_record.status = "failed"
                failed_record.error_message = str(exc)[:4000]
                self.db.commit()
            raise

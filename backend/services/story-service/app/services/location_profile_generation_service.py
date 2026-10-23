
import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.clients.openrouter_client import OpenRouterClient
from app.llm.model_service import ModelService
from app.models.location_profile import LocationProfile
from app.models.story_board import StoryBoard

logger = logging.getLogger(__name__)


class LocationProfileGenerationService:
    """Generate, validate, and persist structured location profiles."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm_client = OpenRouterClient()
        self.model_service = ModelService()

        self.prompt_dir = Path(__file__).resolve().parents[1] / "prompts"
        self.prompt_path = self.prompt_dir / "location_profile_prompt.txt"
        self.schema_path = self.prompt_dir / "location_profile_schema.json"

    async def generate_storyboard_location_profile(
        self,
        *,
        storyboard_id: int,
        location_json_id: int,
        style_name: str,
        style_instructions: str = "",
        customization_instructions: str = "",
        reference_information: str = "",
        model_id: str | None = None,
    ) -> LocationProfile:
        storyboard = (
            self.db.query(StoryBoard)
            .filter(StoryBoard.id == storyboard_id)
            .first()
        )

        if storyboard is None:
            raise ValueError("Storyboard not found.")

        data = storyboard.storyboard_data or {}
        locations = data.get("locations", [])

        location = next(
            (
                item
                for item in locations
                if isinstance(item, dict)
                and str(
                    item.get("location_id", item.get("id", ""))
                ) == str(location_json_id)
            ),
            None,
        )

        if location is None:
            raise ValueError(
                f"Location ID {location_json_id} was not found "
                f"in storyboard {storyboard_id}."
            )

        selected_model_id = (
            model_id or data.get("story_metadata", {}).get("model_id")
        )

        if not selected_model_id:
            raise ValueError(
                "Provide model_id because the storyboard does not "
                "contain a model_id in story_metadata."
            )

        location_name = str(
            location.get("name")
            or location.get("location_name")
            or "Unnamed Location"
        )

        location_information = {
            "location_id": location.get(
                "location_id", location.get("id")
            ),
            "name": location_name,
            "description": location.get("description", ""),
            "type": location.get("type", location.get("location_type", "")),
            "environment": location.get("environment", ""),
            "geography": location.get("geography", ""),
            "architecture": location.get("architecture", ""),
            "landmarks": location.get("landmarks", []),
            "visual_details": location.get("visual_details", {}),
            "atmosphere": location.get("atmosphere", ""),
            "additional_information": location,
        }

        return await self.generate_profile(
            storyboard_id=storyboard_id,
            location_json_id=location_json_id,
            location_name=location_name,
            location_information=location_information,
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
                f"Location profile prompt not found: {self.prompt_path}"
            )

        if not self.schema_path.exists():
            raise FileNotFoundError(
                f"Location profile schema not found: {self.schema_path}"
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
                f"Generated location profile failed schema validation: {exc}"
            ) from exc

    async def generate_profile(
        self,
        *,
        storyboard_id: int,
        location_json_id: int,
        location_name: str,
        location_information: dict[str, Any],
        style_name: str,
        style_instructions: str = "",
        customization_instructions: str = "",
        reference_information: str = "",
        model_id: str,
    ) -> LocationProfile:
        if not location_name.strip():
            raise ValueError("Location name cannot be empty.")

        if not style_name.strip():
            raise ValueError("A location design style must be selected.")

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
            "{{LOCATION_INFORMATION}}": json.dumps(
                location_information,
                ensure_ascii=False,
                indent=2,
            ),
            "{{OUTPUT_SCHEMA}}": json.dumps(
                schema,
                ensure_ascii=False,
                indent=2,
            ),
        }

        prompt = template
        for placeholder, value in replacements.items():
            prompt = prompt.replace(placeholder, value)

        max_version = (
            self.db.query(func.max(LocationProfile.version))
            .filter(
                LocationProfile.story_board_id == storyboard_id,
                LocationProfile.location_json_id == location_json_id,
            )
            .scalar()
        )
        next_version = (max_version or 0) + 1

        record = LocationProfile(
            story_board_id=storyboard_id,
            location_json_id=location_json_id,
            location_name=location_name.strip(),
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
            self.db.commit()
            self.db.refresh(record)
        except Exception:
            self.db.rollback()
            logger.exception(
                "Could not create location profile row: storyboard=%s, "
                "location=%s, attempted_version=%s",
                storyboard_id,
                location_json_id,
                next_version,
            )
            raise

        try:
            raw_response = await self.llm_client.generate(
                model_id=selected_model.id,
                system_prompt=prompt,
                user_prompt=(
                    "Generate the permanent visual identity profile for "
                    "this story location. Follow the prompt and JSON schema. "
                    "Return only the JSON object."
                ),
                temperature=0.2,
            )

            profile = json.loads(self._remove_code_fences(raw_response))

            if not isinstance(profile, dict):
                raise ValueError("The generated profile must be a JSON object.")

            self._validate_profile(profile, schema)

            profile["style_name"] = style_name
            metadata = profile.setdefault("generation_metadata", {})
            metadata["model"] = selected_model.id
            metadata.setdefault("version", "")

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
                "Location profile generation failed: location=%s, model=%s",
                location_name,
                selected_model.id,
            )
            self.db.rollback()

            failed_record = (
                self.db.query(LocationProfile)
                .filter(LocationProfile.id == record.id)
                .first()
            )

            if failed_record is not None:
                failed_record.status = "failed"
                failed_record.error_message = str(exc)[:4000]
                self.db.commit()

            raise

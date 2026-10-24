
from io import BytesIO

from app.core.image_safety import inspect_image
from sqlalchemy.orm import Session

from app.clients.openrouter_image_client import (
    DEFAULT_IMAGE_MODEL,
    OpenRouterImageClient,
)
from app.models.character_master_image import CharacterMasterImage
from app.models.character_profile import CharacterProfile
from app.models.story_board import StoryBoard
from app.repositories.character_master_image_repository import (
    CharacterMasterImageRepository,
)
from app.services.character_master_image_storage import (
    CharacterMasterImageStorage,
)


class CharacterMasterImageService:
    """Generate and persist character master images."""

    VALID_IMAGE_TYPES = {"canonical", "reference_sheet"}

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = CharacterMasterImageRepository(db)
        self.storage = CharacterMasterImageStorage()
        self.image_client = OpenRouterImageClient()

    def _build_prompt(
        self,
        *,
        character_name: str,
        profile_data: dict,
        image_type: str,
        customization_instructions: str = "",
    ) -> str:
        if image_type == "canonical":
            composition = """
Create one clean, production-ready canonical character reference.
Show exactly one character, full body, facing directly forward,
standing upright in a neutral, relaxed pose. Keep the arms slightly
separated from the torso so the silhouette and clothing are visible.
Use a plain white background, neutral studio lighting, and no
environment, props unrelated to the character, text, labels,
watermarks, borders, or additional characters. Show the entire
head and feet without cropping.
"""
        else:
            composition = """
Create a professional character model reference sheet on a plain
white background. Include consistent front, side, and back views,
plus a clear face close-up and a few small design-detail views
where useful. Every view must depict the exact same character
with identical face, hair, body proportions, clothing, footwear,
accessories, and colors. Use a clean, organized layout with no
decorative scenery, watermarks, or unnecessary text.
"""

        return f"""
You are creating a production character reference for an animation
and video-generation pipeline.

CHARACTER NAME:
{character_name}

APPROVED CHARACTER PROFILE (source of truth):
{profile_data}

IMAGE TYPE:
{image_type}

COMPOSITION:
{composition}

CONSISTENCY RULES:
- Follow the approved profile's visual traits.
- Preserve the exact specified hair and eye colors.
- Preserve clothing, footwear, accessories, and color palette.
- Do not introduce new scars, tattoos, jewellery, weapons,
  accessories, or other defining features.
- Do not redesign or reinterpret the character.
- Keep the same identity across all views.
- Do not add story scenes or temporary actions.
- The character profile takes precedence over unsupported guesses.

USER CUSTOMIZATION:
{customization_instructions or "No additional customization."}

Generate the image only, with no explanatory response.
""".strip()

    @staticmethod
    def _validate_image(image_bytes: bytes) -> tuple[str, str]:
        """Only single-frame PNG / JPEG / WEBP pass; no other decoder runs (app/core/image_safety.py)."""
        try:
            return inspect_image(image_bytes)
        except ValueError as exc:
            raise ValueError(
                "The provider did not return a valid image file."
            ) from exc

    async def generate(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        character_id: int,
        image_type: str,
        model_id: str | None = None,
        customization_instructions: str = "",
    ) -> CharacterMasterImage:
        if image_type not in self.VALID_IMAGE_TYPES:
            raise ValueError(
                "image_type must be 'canonical' or 'reference_sheet'."
            )

        storyboard = (
            self.db.query(StoryBoard)
            .filter(
                StoryBoard.id == storyboard_id,
                StoryBoard.story_id == story_id,
            )
            .first()
        )
        if storyboard is None:
            raise ValueError("Storyboard not found for this story.")

        characters = (storyboard.storyboard_data or {}).get(
            "characters", []
        )
        character = next(
            (
                item
                for item in characters
                if isinstance(item, dict)
                and str(item.get("character_id")) == str(character_id)
            ),
            None,
        )
        if character is None:
            raise ValueError("Character not found in this storyboard.")

        # Use the latest successful profile for this exact character.
        profile = (
            self.db.query(CharacterProfile)
            .filter(
                CharacterProfile.story_board_id == storyboard_id,
                CharacterProfile.character_json_id == character_id,
                CharacterProfile.status.in_(["generated", "approved"]),
            )
            .order_by(
                CharacterProfile.version.desc(),
                CharacterProfile.id.desc(),
            )
            .first()
        )
        if profile is None:
            raise ValueError(
                "Generate a character profile before generating its master image."
            )

        selected_model = model_id or DEFAULT_IMAGE_MODEL
        character_name = str(
            character.get("name") or profile.character_name
        )

        prompt = self._build_prompt(
            character_name=character_name,
            profile_data=profile.profile_data,
            image_type=image_type,
            customization_instructions=customization_instructions,
        )

        version = self.repository.get_next_version(
            storyboard_id=storyboard_id,
            character_json_id=character_id,
            image_type=image_type,
        )

        record = CharacterMasterImage(
            character_profile_id=profile.id,
            story_board_id=storyboard_id,
            character_json_id=character_id,
            character_name=character_name,
            image_type=image_type,
            source_type="generated",
            image_url=None,
            storage_key=None,
            prompt=prompt,
            model_name=selected_model,
            model_version="",
            status="generating",
            version=version,
        )

        self.repository.create(record)
        self.db.commit()
        self.db.refresh(record)

        saved_storage_key = None

        try:
            image_bytes, provider_mime_type = (
                await self.image_client.generate_image(
                    model_id=selected_model,
                    prompt=prompt,
                    resolution="1K",
                    output_format="png",
                )
            )

            actual_mime_type, extension = self._validate_image(
                image_bytes
            )

            if provider_mime_type != actual_mime_type:
                raise ValueError(
                    "Image MIME type does not match the returned image content."
                )

            _, storage_key = self.storage.save_bytes(
                image_bytes=image_bytes,
                project_id=project_id,
                story_id=story_id,
                character_id=character_id,
                image_type=f"{image_type}-v{version}",
                extension=extension,
            )
            saved_storage_key = storage_key

            record.storage_key = storage_key
            # A protected download endpoint will serve this storage key.
            record.image_url = None
            record.mime_type = actual_mime_type
            record.file_size_bytes = len(image_bytes)
            record.status = "generated"
            record.error_message = None

            self.db.commit()
            self.db.refresh(record)
            return record

        except Exception as exc:
            self.db.rollback()

            # Remove a newly saved file if persistence fails.
            if saved_storage_key:
                try:
                    self.storage.delete_file(saved_storage_key)
                except Exception:
                    pass

            failed_record = self.db.query(
                CharacterMasterImage
            ).filter(
                CharacterMasterImage.id == record.id
            ).first()

            if failed_record is not None:
                failed_record.status = "failed"
                failed_record.error_message = str(exc)[:4000]
                self.db.commit()

            raise

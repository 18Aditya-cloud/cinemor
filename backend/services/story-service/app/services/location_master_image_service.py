
from io import BytesIO

from PIL import Image
from sqlalchemy.orm import Session

from app.clients.openrouter_image_client import (
    DEFAULT_IMAGE_MODEL,
    OpenRouterImageClient,
)
from app.models.location_master_image import LocationMasterImage
from app.models.location_profile import LocationProfile
from app.models.story_board import StoryBoard
from app.repositories.location_master_image_repository import (
    LocationMasterImageRepository,
)
from app.services.location_master_image_storage import (
    LocationMasterImageStorage,
)


class LocationMasterImageService:
    """Generate and persist canonical location master images."""

    VALID_IMAGE_TYPES = {"canonical"}

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = LocationMasterImageRepository(db)
        self.storage = LocationMasterImageStorage()
        self.image_client = OpenRouterImageClient()

    def _build_prompt(
        self,
        *,
        location_name: str,
        profile_data: dict,
        image_type: str,
        customization_instructions: str = "",
    ) -> str:
        composition = """
Create one clean, production-ready canonical environment reference
image for the specified location.

Show the environment clearly, with enough spatial context to establish
its permanent layout, major structures, distinctive landmarks,
terrain, and defining materials.

Use a coherent, readable composition that communicates the location's
identity. Keep important structures and their spatial relationships
visually understandable.

Do not include characters, crowds, foreground subjects, unrelated props,
captions, labels, watermarks, borders, or interface elements.

Do not crop out the principal landmark or defining structure when it
is central to the location's identity.

The image must represent the environment itself, not a particular
story scene or character interaction.
"""

        return f"""
You are creating a production environment reference image for an
animation and video-generation pipeline.

LOCATION NAME:
{location_name}

APPROVED LOCATION PROFILE — SOURCE OF TRUTH:
{profile_data}

IMAGE TYPE:
{image_type}

COMPOSITION:
{composition}

ENVIRONMENT CONSISTENCY RULES:
- Follow the approved location profile.
- Preserve the location's defining architecture, terrain, and landmarks.
- Preserve established spatial relationships between permanent structures.
- Follow the specified materials and dominant color palette.
- Follow the selected artistic style exactly.
- Do not mix unrelated artistic styles.
- Do not invent major landmarks or structures unsupported by the profile.
- Do not redesign the environment.
- Do not introduce characters or scene-specific actions.
- Do not permanently impose temporary weather or time-of-day conditions.
- Keep the environment suitable for reuse across different scenes.
- The approved location profile takes precedence over unsupported guesses.

USER CUSTOMIZATION:
{customization_instructions or "No additional customization."}

Generate the image only, with no explanatory response.
""".strip()

    @staticmethod
    def _validate_image(image_bytes: bytes) -> tuple[str, str]:
        try:
            with Image.open(BytesIO(image_bytes)) as image:
                image.verify()

            with Image.open(BytesIO(image_bytes)) as image:
                image_format = image.format

        except Exception as exc:
            raise ValueError(
                "The provider did not return a valid image file."
            ) from exc

        formats = {
            "PNG": ("image/png", ".png"),
            "JPEG": ("image/jpeg", ".jpg"),
            "WEBP": ("image/webp", ".webp"),
        }

        if image_format not in formats:
            raise ValueError(
                f"Unsupported generated image format: {image_format}"
            )

        return formats[image_format]

    async def generate(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        location_id: int,
        image_type: str = "canonical",
        model_id: str | None = None,
        customization_instructions: str = "",
    ) -> LocationMasterImage:
        if image_type not in self.VALID_IMAGE_TYPES:
            raise ValueError("image_type must be 'canonical'.")

        # Lock the storyboard while selecting the next image version.
        storyboard = (
            self.db.query(StoryBoard)
            .filter(
                StoryBoard.id == storyboard_id,
                StoryBoard.story_id == story_id,
            )
            .with_for_update()
            .first()
        )

        if storyboard is None:
            raise ValueError("Storyboard not found for this story.")

        locations = (storyboard.storyboard_data or {}).get(
            "locations", []
        )

        location = next(
            (
                item
                for item in locations
                if isinstance(item, dict)
                and str(
                    item.get("location_id", item.get("id", ""))
                ) == str(location_id)
            ),
            None,
        )

        if location is None:
            raise ValueError("Location not found in this storyboard.")

        profile = (
            self.db.query(LocationProfile)
            .filter(
                LocationProfile.story_board_id == storyboard_id,
                LocationProfile.location_json_id == location_id,
                LocationProfile.status.in_(["generated", "approved"]),
            )
            .order_by(
                LocationProfile.version.desc(),
                LocationProfile.id.desc(),
            )
            .first()
        )

        if profile is None:
            raise ValueError(
                "Generate a location profile before generating "
                "its master image."
            )

        selected_model = model_id or DEFAULT_IMAGE_MODEL
        location_name = str(
            location.get("name")
            or location.get("location_name")
            or profile.location_name
        )

        prompt = self._build_prompt(
            location_name=location_name,
            profile_data=profile.profile_data,
            image_type=image_type,
            customization_instructions=customization_instructions,
        )

        version = self.repository.get_next_version(
            storyboard_id=storyboard_id,
            location_json_id=location_id,
            image_type=image_type,
        )

        record = LocationMasterImage(
            location_profile_id=profile.id,
            story_board_id=storyboard_id,
            location_json_id=location_id,
            location_name=location_name,
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
                location_id=location_id,
                image_type=f"{image_type}-v{version}",
                extension=extension,
            )
            saved_storage_key = storage_key

            record.storage_key = storage_key
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

            if saved_storage_key:
                try:
                    self.storage.delete_file(saved_storage_key)
                except Exception:
                    pass

            failed_record = (
                self.db.query(LocationMasterImage)
                .filter(LocationMasterImage.id == record.id)
                .first()
            )

            if failed_record is not None:
                failed_record.status = "failed"
                failed_record.error_message = str(exc)[:4000]
                self.db.commit()

            raise

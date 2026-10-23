
from sqlalchemy.orm import Session
from fastapi import UploadFile

from app.models.character_master_image import CharacterMasterImage
from app.models.story_board import StoryBoard
from app.repositories.character_master_image_repository import (
    CharacterMasterImageRepository,
)
from app.services.character_master_image_storage import (
    CharacterMasterImageStorage,
)
from app.services.character_master_image_service import (
    CharacterMasterImageService,
)


class CharacterMasterImageUploadService:
    """Validate, store, and register user-uploaded character images."""

    ALLOWED_IMAGE_TYPES = {
        "canonical",
        "reference_sheet",
        "user_upload",
    }

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = CharacterMasterImageRepository(db)
        self.storage = CharacterMasterImageStorage()
        self.validator = CharacterMasterImageService(db)

    async def upload(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        character_id: int,
        image_type: str,
        upload: UploadFile,
    ) -> CharacterMasterImage:
        if image_type not in self.ALLOWED_IMAGE_TYPES:
            raise ValueError(
                "image_type must be canonical, reference_sheet, or user_upload."
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

        path = None

        try:
            path, storage_key, image_bytes = await self.storage.save_upload(
                upload=upload,
                project_id=project_id,
                story_id=story_id,
                character_id=character_id,
                image_type=image_type,
            )

            mime_type, _ = self.validator._validate_image(image_bytes)

            if mime_type != upload.content_type:
                raise ValueError(
                    "Uploaded file content does not match its MIME type."
                )

            latest_profile = (
                self.db.query(CharacterMasterImage)
                .filter(
                    CharacterMasterImage.story_board_id == storyboard_id,
                    CharacterMasterImage.character_json_id == character_id,
                    CharacterMasterImage.image_type == image_type,
                )
                .order_by(
                    CharacterMasterImage.version.desc(),
                    CharacterMasterImage.id.desc(),
                )
                .first()
            )

            version = self.repository.get_next_version(
                storyboard_id=storyboard_id,
                character_json_id=character_id,
                image_type=image_type,
            )

            record = CharacterMasterImage(
                character_profile_id=(
                    latest_profile.character_profile_id
                    if latest_profile
                    else None
                ),
                story_board_id=storyboard_id,
                character_json_id=character_id,
                character_name=str(
                    character.get("name") or "Unnamed Character"
                ),
                image_type=image_type,
                source_type="uploaded",
                image_url=None,
                storage_key=storage_key,
                original_filename=upload.filename,
                mime_type=mime_type,
                file_size_bytes=len(image_bytes),
                prompt="",
                model_name="",
                model_version="",
                status="uploaded",
                version=version,
            )

            self.repository.create(record)
            self.db.commit()
            self.db.refresh(record)
            return record

        except Exception:
            self.db.rollback()
            if path:
                try:
                    path_obj = self.storage.storage_dir / path
                    if path_obj.is_file():
                        path_obj.unlink()
                except Exception:
                    pass
            raise

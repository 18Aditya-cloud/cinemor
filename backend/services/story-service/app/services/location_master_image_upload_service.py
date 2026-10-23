
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.location_master_image import LocationMasterImage
from app.models.location_profile import LocationProfile
from app.models.story_board import StoryBoard
from app.repositories.location_master_image_repository import (
    LocationMasterImageRepository,
)
from app.services.location_master_image_service import (
    LocationMasterImageService,
)
from app.services.location_master_image_storage import (
    LocationMasterImageStorage,
)


class LocationMasterImageUploadService:
    """Validate, store, and register uploaded location images."""

    IMAGE_TYPE = "user_upload"

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = LocationMasterImageRepository(db)
        self.storage = LocationMasterImageStorage()
        self.validator = LocationMasterImageService(db)

    async def upload(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        location_id: int,
        upload: UploadFile,
    ) -> LocationMasterImage:
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

        latest_profile = (
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

        saved_storage_key = None

        try:
            path, storage_key, image_bytes = (
                await self.storage.save_upload(
                    upload=upload,
                    project_id=project_id,
                    story_id=story_id,
                    location_id=location_id,
                    image_type=self.IMAGE_TYPE,
                )
            )
            saved_storage_key = storage_key

            mime_type, _ = self.validator._validate_image(image_bytes)

            if mime_type != upload.content_type:
                raise ValueError(
                    "Uploaded file content does not match its MIME type."
                )

            version = self.repository.get_next_version(
                storyboard_id=storyboard_id,
                location_json_id=location_id,
                image_type=self.IMAGE_TYPE,
            )

            location_name = str(
                location.get("name")
                or location.get("location_name")
                or "Unnamed Location"
            )

            record = LocationMasterImage(
                location_profile_id=(
                    latest_profile.id if latest_profile else None
                ),
                story_board_id=storyboard_id,
                location_json_id=location_id,
                location_name=location_name,
                image_type=self.IMAGE_TYPE,
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

            if saved_storage_key:
                try:
                    self.storage.delete_file(saved_storage_key)
                except Exception:
                    pass

            raise


from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.location_master_image import LocationMasterImage


class LocationMasterImageRepository:
    """Database operations for location master images."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, record: LocationMasterImage) -> LocationMasterImage:
        self.db.add(record)
        self.db.flush()
        return record

    def get_next_version(
        self,
        *,
        storyboard_id: int,
        location_json_id: int,
        image_type: str,
    ) -> int:
        max_version = (
            self.db.query(func.max(LocationMasterImage.version))
            .filter(
                LocationMasterImage.story_board_id == storyboard_id,
                LocationMasterImage.location_json_id == location_json_id,
                LocationMasterImage.image_type == image_type,
            )
            .scalar()
        )
        return (max_version or 0) + 1

    def get_latest(
        self,
        *,
        storyboard_id: int,
        location_json_id: int,
        image_type: str,
    ) -> LocationMasterImage | None:
        return (
            self.db.query(LocationMasterImage)
            .filter(
                LocationMasterImage.story_board_id == storyboard_id,
                LocationMasterImage.location_json_id == location_json_id,
                LocationMasterImage.image_type == image_type,
            )
            .order_by(
                LocationMasterImage.version.desc(),
                LocationMasterImage.id.desc(),
            )
            .first()
        )


from sqlalchemy.orm import Session

from app.models.character_master_image import CharacterMasterImage


class CharacterMasterImageRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, image_id: int) -> CharacterMasterImage | None:
        return (
            self.db.query(CharacterMasterImage)
            .filter(CharacterMasterImage.id == image_id)
            .first()
        )

    def get_latest(
        self,
        *,
        storyboard_id: int,
        character_json_id: int,
        image_type: str,
    ) -> CharacterMasterImage | None:
        return (
            self.db.query(CharacterMasterImage)
            .filter(
                CharacterMasterImage.story_board_id == storyboard_id,
                CharacterMasterImage.character_json_id == character_json_id,
                CharacterMasterImage.image_type == image_type,
                CharacterMasterImage.status.in_(
                    ["generated", "uploaded"]
                ),
            )
            .order_by(
                CharacterMasterImage.version.desc(),
                CharacterMasterImage.id.desc(),
            )
            .first()
        )

    def list_by_character(
        self,
        *,
        storyboard_id: int,
        character_json_id: int,
    ) -> list[CharacterMasterImage]:
        return (
            self.db.query(CharacterMasterImage)
            .filter(
                CharacterMasterImage.story_board_id == storyboard_id,
                CharacterMasterImage.character_json_id == character_json_id,
            )
            .order_by(
                CharacterMasterImage.image_type.asc(),
                CharacterMasterImage.version.desc(),
            )
            .all()
        )

    def get_next_version(
        self,
        *,
        storyboard_id: int,
        character_json_id: int,
        image_type: str,
    ) -> int:
        latest_version = (
            self.db.query(CharacterMasterImage.version)
            .filter(
                CharacterMasterImage.story_board_id == storyboard_id,
                CharacterMasterImage.character_json_id == character_json_id,
                CharacterMasterImage.image_type == image_type,
            )
            .order_by(CharacterMasterImage.version.desc())
            .first()
        )
        return (latest_version[0] if latest_version else 0) + 1

    def create(
        self,
        image: CharacterMasterImage,
    ) -> CharacterMasterImage:
        self.db.add(image)
        self.db.flush()
        return image

    def save(
        self,
        image: CharacterMasterImage,
    ) -> CharacterMasterImage:
        self.db.add(image)
        self.db.flush()
        return image

    def delete(self, image_id: int) -> bool:
        image = self.get_by_id(image_id)
        if image is None:
            return False

        self.db.delete(image)
        self.db.flush()
        return True

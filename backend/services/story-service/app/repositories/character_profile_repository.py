
from sqlalchemy.orm import Session

from app.models.character_profile import CharacterProfile


class CharacterProfileRepository:
    """Database operations for character profiles."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, profile_id: int) -> CharacterProfile | None:
        return (
            self.db.query(CharacterProfile)
            .filter(CharacterProfile.id == profile_id)
            .first()
        )

    def get_latest(
        self,
        *,
        storyboard_id: int,
        character_json_id: int,
    ) -> CharacterProfile | None:
        return (
            self.db.query(CharacterProfile)
            .filter(
                CharacterProfile.story_board_id == storyboard_id,
                CharacterProfile.character_json_id == character_json_id,
            )
            .order_by(
                CharacterProfile.version.desc(),
                CharacterProfile.id.desc(),
            )
            .first()
        )

    def list_by_storyboard(
        self,
        storyboard_id: int,
    ) -> list[CharacterProfile]:
        return (
            self.db.query(CharacterProfile)
            .filter(CharacterProfile.story_board_id == storyboard_id)
            .order_by(
                CharacterProfile.character_json_id.asc(),
                CharacterProfile.version.desc(),
            )
            .all()
        )

    def create(self, profile: CharacterProfile) -> CharacterProfile:
        self.db.add(profile)
        self.db.flush()
        return profile

    def save(self, profile: CharacterProfile) -> CharacterProfile:
        self.db.add(profile)
        self.db.flush()
        return profile

    def delete(self, profile_id: int) -> bool:
        profile = self.get_by_id(profile_id)

        if profile is None:
            return False

        self.db.delete(profile)
        self.db.flush()
        return True

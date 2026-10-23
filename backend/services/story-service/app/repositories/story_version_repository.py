from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.story_version import StoryVersion


class StoryVersionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_next_version_number(
        self,
        story_id: int,
    ) -> int:
        statement = (
            select(StoryVersion.version_number)
            .where(StoryVersion.story_id == story_id)
            .order_by(StoryVersion.version_number.desc())
            .limit(1)
        )

        latest_version = self.db.scalar(statement)

        if latest_version is None:
            return 1

        return latest_version + 1

    def create(
        self,
        story_id: int,
        title: str,
        content: str,
        source_type: str,
    ) -> StoryVersion:
        version_number = self.get_next_version_number(
            story_id=story_id,
        )

        db_version = StoryVersion(
            story_id=story_id,
            version_number=version_number,
            title=title,
            content=content,
            source_type=source_type,
        )

        self.db.add(db_version)
        self.db.commit()
        self.db.refresh(db_version)

        return db_version

    def get_by_id(
        self,
        version_id: int,
    ) -> StoryVersion | None:
        statement = select(StoryVersion).where(
            StoryVersion.id == version_id
        )

        return self.db.scalar(statement)

    def get_by_story(
        self,
        story_id: int,
    ) -> list[StoryVersion]:
        statement = (
            select(StoryVersion)
            .where(StoryVersion.story_id == story_id)
            .order_by(StoryVersion.version_number.desc())
        )

        return list(self.db.scalars(statement).all())

    def delete(
        self,
        version: StoryVersion,
    ) -> None:
        self.db.delete(version)
        self.db.commit()

    def create_initial_version(
        self,
        story_id: int,
        title: str,
        content: str,
        source_type: str,
    ) -> StoryVersion:
        db_version = StoryVersion(
            story_id=story_id,
            version_number=1,
            title=title,
            content=content,
            source_type=source_type,
        )

        self.db.add(db_version)
        self.db.commit()
        self.db.refresh(db_version)

        return db_version
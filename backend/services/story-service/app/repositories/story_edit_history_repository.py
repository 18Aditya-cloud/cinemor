
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.story_edit_history import StoryEditHistory


class StoryEditHistoryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        story_id: int,
        action_type: str,
        instruction: str | None = None,
        status: str = "completed",
        before_version_id: int | None = None,
        after_version_id: int | None = None,
        details: dict | None = None,
    ) -> StoryEditHistory:
        history = StoryEditHistory(
            story_id=story_id,
            action_type=action_type,
            instruction=instruction,
            status=status,
            before_version_id=before_version_id,
            after_version_id=after_version_id,
            details=details or {},
        )

        self.db.add(history)
        self.db.flush()
        self.db.refresh(history)

        return history

    def update(
        self,
        history_id: int,
        *,
        status: str | None = None,
        after_version_id: int | None = None,
        details: dict | None = None,
    ) -> StoryEditHistory | None:
        history = self.get_by_id(history_id)

        if history is None:
            return None

        if status is not None:
            history.status = status

        if after_version_id is not None:
            history.after_version_id = after_version_id

        if details is not None:
            history.details = details

        self.db.flush()
        self.db.refresh(history)

        return history

    def get_by_story(
        self,
        story_id: int,
    ) -> list[StoryEditHistory]:
        statement = (
            select(StoryEditHistory)
            .where(StoryEditHistory.story_id == story_id)
            .order_by(
                StoryEditHistory.created_at.desc(),
                StoryEditHistory.id.desc(),
            )
        )

        return list(self.db.scalars(statement).all())

    def get_by_id(
        self,
        history_id: int,
    ) -> StoryEditHistory | None:
        statement = select(StoryEditHistory).where(
            StoryEditHistory.id == history_id
        )

        return self.db.scalar(statement)


    def get_by_preview_id(
        self,
        story_id: int,
        preview_id: int,
    ) -> StoryEditHistory | None:
        history_items = self.get_by_story(story_id=story_id)

        for item in history_items:
            if item.details and item.details.get("preview_id") == preview_id:
                return item

        return None


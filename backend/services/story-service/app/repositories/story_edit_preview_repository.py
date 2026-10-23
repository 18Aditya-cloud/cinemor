from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.story_edit_preview import StoryEditPreview


class StoryEditPreviewRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        story_id: int,
        base_version_id: int,
        instruction: str,
        title: str,
        content: str,
    ) -> StoryEditPreview:
        preview = StoryEditPreview(
            story_id=story_id,
            base_version_id=base_version_id,
            instruction=instruction,
            title=title,
            content=content,
            status="pending",
        )

        self.db.add(preview)
        self.db.commit()
        self.db.refresh(preview)

        return preview

    def get_by_id(
        self,
        preview_id: int,
    ) -> StoryEditPreview | None:
        statement = select(StoryEditPreview).where(
            StoryEditPreview.id == preview_id
        )

        return self.db.scalar(statement)

    def get_pending_by_story(
        self,
        story_id: int,
    ) -> list[StoryEditPreview]:
        statement = (
            select(StoryEditPreview)
            .where(
                StoryEditPreview.story_id == story_id,
                StoryEditPreview.status == "pending",
            )
            .order_by(StoryEditPreview.created_at.desc())
        )

        return list(self.db.scalars(statement).all())

    def get_pending_by_id(
        self,
        preview_id: int,
    ) -> StoryEditPreview | None:
        statement = select(StoryEditPreview).where(
            StoryEditPreview.id == preview_id,
            StoryEditPreview.status == "pending",
        )

        return self.db.scalar(statement)

    def update_status(
        self,
        preview: StoryEditPreview,
        status: str,
    ) -> StoryEditPreview:
        preview.status = status

        self.db.commit()
        self.db.refresh(preview)

        return preview

    def delete(
        self,
        preview: StoryEditPreview,
    ) -> None:
        self.db.delete(preview)
        self.db.commit()
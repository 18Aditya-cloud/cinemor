
from sqlalchemy.orm import Session

from app.models.story_board import StoryBoard


class StoryBoardRepository:
    """Database operations for storyboards."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        story_id: int,
        title: str,
        metadata: dict,
        storyboard_data: dict,
        status: str = "draft",
    ) -> StoryBoard:
        """Create and persist a storyboard for an existing story."""

        storyboard = StoryBoard(
            story_id=story_id,
            title=title,
            metadata_json=metadata,
            storyboard_data=storyboard_data,
            status=status,
        )

        self.db.add(storyboard)
        self.db.flush()
        return storyboard

    def get_by_id(self, storyboard_id: int) -> StoryBoard | None:
        """Fetch a storyboard by its primary key."""

        return (
            self.db.query(StoryBoard)
            .filter(StoryBoard.id == storyboard_id)
            .first()
        )

    def get_by_story_id(self, story_id: int) -> StoryBoard | None:
        """Fetch the storyboard associated with a story."""

        return (
            self.db.query(StoryBoard)
            .filter(StoryBoard.story_id == story_id)
            .first()
        )

    def create_or_update(
        self,
        *,
        story_id: int,
        title: str,
        metadata: dict,
        storyboard_data: dict,
        status: str = "draft",
    ) -> StoryBoard:
        """Create a storyboard or replace the existing story's storyboard."""

        storyboard = self.get_by_story_id(story_id)

        if storyboard is None:
            return self.create(
                story_id=story_id,
                title=title,
                metadata=metadata,
                storyboard_data=storyboard_data,
                status=status,
            )

        storyboard.title = title
        storyboard.metadata_json = metadata
        storyboard.storyboard_data = storyboard_data
        storyboard.status = status

        self.db.flush()
        return storyboard

    def update_status(
        self,
        storyboard_id: int,
        status: str,
    ) -> StoryBoard | None:
        """Update the status of a storyboard."""

        storyboard = self.get_by_id(storyboard_id)

        if storyboard is None:
            return None

        storyboard.status = status
        self.db.flush()
        return storyboard

    def delete(self, storyboard_id: int) -> bool:
        """Delete a storyboard by its primary key."""

        storyboard = self.get_by_id(storyboard_id)

        if storyboard is None:
            return False

        self.db.delete(storyboard)
        self.db.flush()
        return True

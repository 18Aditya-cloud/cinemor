from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class StoryBoard(Base):
    __tablename__ = "story_board"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    story_id: Mapped[int] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # "metadata" is reserved by SQLAlchemy's declarative base,
    # so the Python attribute is metadata_json.
    metadata_json: Mapped[dict] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )

    # Complete generated storyboard document.
    storyboard_data: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict
    )

    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft", server_default="draft"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
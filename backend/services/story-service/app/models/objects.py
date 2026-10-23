
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class StoryObject(Base):
    __tablename__ = "objects"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Original JSON object_id, not the database primary key.
    object_json_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Keep JSON IDs separate from database foreign keys.
    scene_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(250), nullable=False)
    aliases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="other")

    owner_character_json_id: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    current_location_json_id: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    first_appearance_scene_id: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    object_data: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

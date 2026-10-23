
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Original JSON scene_id; separate from the database primary key.
    scene_json_id: Mapped[int] = mapped_column(Integer, nullable=False)

    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    importance: Mapped[str] = mapped_column(String(50), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    primary_action: Mapped[str] = mapped_column(Text, nullable=False, default="")
    overall_emotion: Mapped[str] = mapped_column(String(100), nullable=False)
    visual_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    camera_suggestion: Mapped[str] = mapped_column(Text, nullable=False, default="")
    scene_transition: Mapped[str] = mapped_column(Text, nullable=False, default="")
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    extraction_confidence: Mapped[int] = mapped_column(
        Integer, nullable=False, default=95
    )

    # Nested scene.location data from the original JSON.
    scene_location_name: Mapped[str] = mapped_column(
        String(250), nullable=False, default=""
    )
    scene_location_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unknown"
    )
    scene_location_time_of_day: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unspecified"
    )
    scene_location_description: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )

    # Stores any additional source fields without losing the original data.
    scene_data: Mapped[dict[str, Any]] = mapped_column(
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

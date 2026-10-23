from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class SceneVideoClip(Base):
    __tablename__ = "scene_video_clips"

    __table_args__ = (
        UniqueConstraint(
            "scene_id",
            "clip_number",
            "version",
            name="uq_scene_video_clip_version",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    scene_id: Mapped[int] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    clip_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    title: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
        default="",
        server_default="",
    )

    scene_description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default="",
    )

    dialogue_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default="",
    )

    prompt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default="",
    )

    provider: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="fal",
        server_default="fal",
    )

    model_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="",
        server_default="",
    )

    planned_duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    actual_duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    video_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    storage_key: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    mime_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    file_size_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # Reference to the previous clip's final frame.
    continuation_frame_key: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    previous_clip_id: Mapped[int | None] = mapped_column(
        ForeignKey("scene_video_clips.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Character, location, sketch, and generation settings.
    generation_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    # pending, generating, generated, failed.
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
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
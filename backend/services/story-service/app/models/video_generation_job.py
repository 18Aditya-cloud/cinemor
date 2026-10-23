from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class VideoGenerationJob(Base):
    __tablename__ = "video_generation_jobs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # Story whose scenes are being processed.
    story_id: Mapped[int] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Optional project association for project-level access.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("individual_projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # all, selected, or newly_added.
    generation_mode: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="all",
        server_default="all",
    )

    # queued, planning, generating, assembling, completed, failed.
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="queued",
        server_default="queued",
        index=True,
    )

    total_scenes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    completed_scenes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    failed_scenes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    # Scene IDs selected when this job was created.
    scene_ids: Mapped[list[Any]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
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

    # Final assembled movie.
    output_video_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    output_storage_key: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    job_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
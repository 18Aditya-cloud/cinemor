from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class OneClickFilm(Base):
    """
    One-click generation (individual creators): one prompt -> a finished film.

    A run makes, one after the other, with the project's own modules (see app/services/one_click_service.py):
        story -> storyboard -> characters -> locations -> sketches -> clips -> the joined film
    Everything it makes is ordinary project content (the story is in the project's Stories, with its storyboard,
    images, sketches and clips), so it can be opened and changed module by module later.

    status: queued | running | done | failed | cancelled
    stage:  story | storyboard | characters | locations | sketches | clips | done
    progress: {"steps": {stage: "waiting" | "active" | "done" | "skipped" | "failed"}, "detail": str,
               "characters": {"done": n, "total": n}, "locations": {...}, "sketches": {...}}
    """

    __tablename__ = "one_click_films"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    individual_project_id: Mapped[int] = mapped_column(
        ForeignKey("individual_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # the story this run wrote (or the script it was given); set once it exists
    story_id: Mapped[int | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"),
        nullable=True,
    )
    # the clips-and-film job (the Animation module's own job)
    video_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("video_generation_jobs.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", server_default="queued")
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="story", server_default="story")

    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # text_model, image_model, video_model, length, style, language, from_script, script_title
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    progress: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
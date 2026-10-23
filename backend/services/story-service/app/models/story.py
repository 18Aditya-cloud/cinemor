from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Story(Base):
    """
    Database model for a generated Cinemor story.
    """

    __tablename__ = "stories"

    # ---------------------------------------------------------
    # Primary Key
    # ---------------------------------------------------------

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # ---------------------------------------------------------
    # Individual Project
    #
    # A story can belong to an Individual Project.
    # Nullable for backward compatibility with the existing
    # generic /stories/generate flow.
    # ---------------------------------------------------------

    individual_project_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "individual_projects.id",
            ondelete="CASCADE",
        ),
        nullable=True,
        index=True,
    )

    source_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="ai_generated",
        server_default="ai_generated",
    )

    # ---------------------------------------------------------
    # Generated Story
    # ---------------------------------------------------------

    title: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # ---------------------------------------------------------
    # Generation Configuration
    # ---------------------------------------------------------

    language: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="English",
    )


    point_of_view: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="third_person_limited",
        server_default="third_person_limited",
    )

    story_format: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="prose_narrative",
        server_default="prose_narrative",
    )


    model_id: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    word_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ---------------------------------------------------------
    # Creative Inputs
    # ---------------------------------------------------------

    genre: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    style: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    tone: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    characters: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    # ---------------------------------------------------------
    # Optional Story Information
    # ---------------------------------------------------------

    target_audience: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    subject: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    educational_objective: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    grade_level: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    learning_points: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    setting: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    additional_details: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ---------------------------------------------------------
    # User Story Prompt
    # ---------------------------------------------------------

    prompt: Mapped[str] = mapped_column(
        Text,
        nullable=True,
    )

    # ---------------------------------------------------------
    # Timestamps
    # ---------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    current_version_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "story_versions.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
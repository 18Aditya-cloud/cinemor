
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CharacterMasterImage(Base):
    __tablename__ = "character_master_images"

    __table_args__ = (
        UniqueConstraint(
            "story_board_id",
            "character_json_id",
            "image_type",
            "version",
            name="uq_character_master_image_version",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # Character profile used to generate or organize this image.
    character_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("character_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Stable ID from storyboard_data["characters"].
    character_json_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
    )

    character_name: Mapped[str] = mapped_column(
        String(250),
        nullable=False,
    )

    # canonical, reference_sheet, or user_upload.
    image_type: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        index=True,
    )

    # generated or uploaded.
    source_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # Durable URL and/or object-storage key.
    image_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    storage_key: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Original filename for uploaded images.
    original_filename: Mapped[str | None] = mapped_column(
        String(500),
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

    # Prompt and model metadata for generated images.
    prompt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default="",
    )

    model_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="",
        server_default="",
    )

    model_version: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="",
        server_default="",
    )

    # pending, generating, generated, uploaded, failed.
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
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

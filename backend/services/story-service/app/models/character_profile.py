
from datetime import datetime

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


class CharacterProfile(Base):
    __tablename__ = "character_profiles"

    __table_args__ = (
        UniqueConstraint(
            "story_board_id",
            "character_json_id",
            "version",
            name="uq_character_profile_version",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Stable character ID from storyboard JSON, not the database row ID.
    character_json_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
    )

    character_name: Mapped[str] = mapped_column(
        String(250),
        nullable=False,
    )

    # Exact profile JSON schema supplied for character design.
    profile_data: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    # User's optional customization instructions.
    customization_prompt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default="",
    )

    # Style selected for this character.
    style_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        default="",
        server_default="",
    )

    # pending, generating, generated, failed, approved
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
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

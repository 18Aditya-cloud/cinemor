
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
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


class Character(Base):
    __tablename__ = "characters"

    # Database primary key; separate from the original JSON character_id.
    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    character_json_id: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    name: Mapped[str] = mapped_column(String(250), nullable=False)
    aliases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    is_revealed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    revealed_identity: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )

    role: Mapped[str] = mapped_column(String(50), nullable=False)
    importance: Mapped[str] = mapped_column(String(50), nullable=False)

    first_appearance_scene_id: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    description: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )

    # Original JSON's nested appearance object.
    appearance: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    gender: Mapped[str] = mapped_column(String(50), nullable=False)
    age_group: Mapped[str] = mapped_column(String(50), nullable=False)

    dominant_emotions: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list
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

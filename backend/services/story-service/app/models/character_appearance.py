
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CharacterAppearance(Base):
    __tablename__ = "character_appearance"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Original JSON appearance_history.scene_id; not the DB scene primary key.
    scene_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    age_group: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unknown"
    )
    physical_traits: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )
    clothing: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )
    special_features: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )

    # Preserves the complete original appearance_history entry if needed.
    appearance_data: Mapped[dict[str, Any]] = mapped_column(
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


from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Location(Base):
    __tablename__ = "location"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Original JSON location_id, separate from the database primary key.
    location_json_id: Mapped[int] = mapped_column(Integer, nullable=False)

    name: Mapped[str] = mapped_column(String(250), nullable=False)
    aliases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    location_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unknown"
    )
    first_appearance_scene_id: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    # Preserve any additional original location fields.
    location_data: Mapped[dict[str, Any]] = mapped_column(
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


from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Narrator(Base):
    __tablename__ = "narrator"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    present: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # The original JSON always uses narrator_id = 0.
    narrator_json_id: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )

    point_of_view: Mapped[str] = mapped_column(
        String(100), nullable=False, default="third_person_omniscient"
    )
    description: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )

    narrator_data: Mapped[dict[str, Any]] = mapped_column(
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

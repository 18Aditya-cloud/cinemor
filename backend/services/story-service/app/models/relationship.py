
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


class CharacterRelationship(Base):
    __tablename__ = "relationship"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    story_board_id: Mapped[int] = mapped_column(
        ForeignKey("story_board.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # These are original JSON character IDs, not database primary keys.
    source_json_id: Mapped[int] = mapped_column(Integer, nullable=False)
    target_json_id: Mapped[int] = mapped_column(Integer, nullable=False)

    relationship_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    directional: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    description: Mapped[str] = mapped_column(
        Text, nullable=False, default=""
    )

    relationship_data: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

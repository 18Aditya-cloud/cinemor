
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Dialogue(Base):
    __tablename__ = "dialogues"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    scene_id: Mapped[int] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Original JSON dialogue_id and speaker_id remain separate from DB IDs.
    dialogue_json_id: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker_type: Mapped[str] = mapped_column(String(50), nullable=False)
    speaker_json_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    speaker_name: Mapped[str] = mapped_column(
        String(250), nullable=False, default=""
    )

    dialogue_text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    emotion: Mapped[str] = mapped_column(String(100), nullable=False)
    delivery: Mapped[str] = mapped_column(String(150), nullable=False, default="")

    dialogue_data: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

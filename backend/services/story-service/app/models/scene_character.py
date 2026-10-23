
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class SceneCharacter(Base):
    __tablename__ = "scene_character"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    scene_id: Mapped[int] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Fields from scenes[].characters_present[] in the original JSON.
    emotion: Mapped[str] = mapped_column(
        String(100), nullable=False, default=""
    )

    emotion_intensity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

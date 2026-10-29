from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class QuickCreation(Base):
    """
    One thing made with the Quick Create tools, on its own, outside any project.

    kind:
        character | location | image   one picture (a file)
        story                           a story; its versions are in `content["versions"]`
        avatar_video                    a video of an uploaded picture speaking a script (a file);
                                        the parts it is made of are in `content["parts"]`
        audio                           a voice reading a text (a file)

    status: working (still being made) | done | failed
    """

    __tablename__ = "quick_creations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="working", server_default="working")

    title: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    model_id: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")

    # the choices made in the tool (ratio, voice, language, story options...)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # the result file, under storage/quick-create/
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # the picture the user uploaded (avatar video)
    source_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # story versions, video parts, audio length...
    content: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

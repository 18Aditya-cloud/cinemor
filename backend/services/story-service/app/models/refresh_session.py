from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class RefreshSession(Base):
    """
    Server-side refresh-token session.

    Only the SHA-256 hash of the refresh token is stored.
    The raw refresh token is never persisted.
    """

    __tablename__ = "refresh_sessions"

    # ---------------------------------------------------------
    # Primary Key
    # ---------------------------------------------------------

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # ---------------------------------------------------------
    # User
    # ---------------------------------------------------------

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # ---------------------------------------------------------
    # Token Hash
    # ---------------------------------------------------------

    token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    # ---------------------------------------------------------
    # Token Expiration
    # ---------------------------------------------------------

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # ---------------------------------------------------------
    # Revocation
    # ---------------------------------------------------------

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ---------------------------------------------------------
    # Token Rotation
    # ---------------------------------------------------------

    replaced_by_token_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    # ---------------------------------------------------------
    # Optional Client Information
    # ---------------------------------------------------------

    user_agent: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )

    # ---------------------------------------------------------
    # Timestamps
    # ---------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ---------------------------------------------------------
    # Relationship
    # ---------------------------------------------------------

    user = relationship(
        "User",
        back_populates="refresh_sessions",
    )
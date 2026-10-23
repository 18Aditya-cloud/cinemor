from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Client(Base):
    """
    Client belonging to an organization.
    """

    __tablename__ = "clients"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "email",
            name="uq_client_organization_email",
        ),
    )

    # =========================================================
    # Primary Key
    # =========================================================

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # =========================================================
    # Organization
    # =========================================================

    organization_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organizations.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # =========================================================
    # Client Information
    # =========================================================

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # =========================================================
    # Project Statistics
    # =========================================================

    successfully_delivered_projects: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    @property
    def ongoing_projects(self) -> int:
        """
        Number of currently ongoing projects.

        This will be calculated from actual Project records
        after the Project module is implemented.
        """
        return 0

    # =========================================================
    # Timestamps
    # =========================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # =========================================================
    # Relationships
    # =========================================================

    organization = relationship(
        "Organization",
    )
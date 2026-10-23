from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Organization(Base):
    """
    Organization account.

    Organization profile information can be completed after
    the initial organization account is created.

    Employees are onboarded through email invitations.
    """

    __tablename__ = "organizations"

    # =========================================================
    # Primary Key
    # =========================================================

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # =========================================================
    # Organization Information
    # =========================================================
    #
    # These fields are optional during initial signup.
    # The organization can complete its profile later.
    #

    name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    business_type: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    official_address: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # =========================================================
    # Organization Status
    # =========================================================

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

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

    memberships = relationship(
        "OrganizationMembership",
        back_populates="organization",
        cascade="all, delete-orphan",
    )

    job_roles = relationship(
        "OrganizationJobRole",
        back_populates="organization",
        cascade="all, delete-orphan",
    )

    employee_invitations = relationship(
        "EmployeeInvitation",
        back_populates="organization",
        cascade="all, delete-orphan",
    )

    tools = relationship(
        "OrganizationTool",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
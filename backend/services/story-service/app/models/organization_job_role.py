from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class OrganizationJobRole(Base):
    """
    Configurable production/job role belonging to an organization.

    Examples:
        Animator
        Character Designer
        Writer
        Storyboard Artist
        3D Artist
        Video Editor
    """

    __tablename__ = "organization_roles"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "name",
            name="uq_organization_job_role_name",
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
    # Role Information
    # =========================================================

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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

    organization = relationship(
        "Organization",
        back_populates="job_roles",
    )

    employee_assignments = relationship(
        "EmployeeJobRole",
        back_populates="job_role",
        cascade="all, delete-orphan",
    )

    tool_assignments = relationship(
        "OrganizationJobRoleTool",
        back_populates="job_role",
        cascade="all, delete-orphan",
    )

    feature_assignments = relationship(
        "OrganizationJobRoleFeature",
        back_populates="job_role",
        cascade="all, delete-orphan",
    )
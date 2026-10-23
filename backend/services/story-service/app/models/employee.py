from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Employee(Base):
    """
    Organization employee profile.

    OrganizationMembership stores:
        - organization membership
        - system-level RBAC role
        - active/inactive status
        - team leader assignment

    Employee stores:
        - maximum concurrent projects
        - team leader responsibility
        - reviewer responsibility

    Employee job roles are stored separately in
    EmployeeJobRole because one employee can have multiple
    organization-specific job roles.
    """

    __tablename__ = "employees"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_employee_organization_user",
        ),
    )

    # ========================================================
    # Primary Key
    # ========================================================

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # ========================================================
    # Organization
    # ========================================================

    organization_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organizations.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # User
    # ========================================================

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Maximum Concurrent Projects
    # ========================================================

    max_concurrent_projects: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # ========================================================
    # Team Leader Responsibility
    # ========================================================

    is_team_leader: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # ========================================================
    # Reviewer Responsibility
    # ========================================================

    is_reviewer: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # ========================================================
    # Timestamps
    # ========================================================

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

    # ========================================================
    # Relationships
    # ========================================================

    organization = relationship(
        "Organization",
    )

    user = relationship(
        "User",
        back_populates="employee_profiles",
    )

    job_roles = relationship(
        "EmployeeJobRole",
        back_populates="employee",
        cascade="all, delete-orphan",
    )

    reviewer_job_roles = relationship(
        "EmployeeReviewerJobRole",
        back_populates="employee",
        cascade="all, delete-orphan",
    )
from __future__ import annotations

from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    DateTime,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


# ============================================================
# Project Status
# ============================================================


class ProjectStatus(str, PyEnum):
    """
    Project lifecycle.

    PENDING:
        Project has been created but work has not started.

    STARTED:
        Project work has started.

    COMPLETED:
        Project has been completed.

    ABORTED:
        Project has been stopped/aborted.
    """

    PENDING = "pending"
    STARTED = "started"
    COMPLETED = "completed"
    ABORTED = "aborted"


# ============================================================
# Project
# ============================================================


class Project(Base):
    """
    Production project belonging to an organization.

    Project creation:
        Organization Admin

    Project status control:
        Assigned Team Leader

    Employee/reviewer assignment:
        Assigned Team Leader

    Project structure:

        Organization
            |
            +---- Client
            |
            +---- Team Leader
            |
            +---- Project Members
                     |
                     +---- Employee
                     +---- Reviewer

    Project members are stored in ProjectMember.
    """

    __tablename__ = "projects"

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
    # Client
    # ========================================================

    client_id: Mapped[int] = mapped_column(
        ForeignKey(
            "clients.id",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Project Information
    # ========================================================

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ========================================================
    # Project Status
    # ========================================================
    #
    # New project always starts as PENDING.
    #
    # Valid lifecycle:
    #
    #     PENDING
    #         |
    #         v
    #      STARTED
    #       /   \
    #      v     v
    # COMPLETED  ABORTED
    #

    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(
            ProjectStatus,
            name="project_status",
            values_callable=lambda enum_class: [
                member.value
                for member in enum_class
            ],
        ),
        nullable=False,
        default=ProjectStatus.PENDING,
        server_default=ProjectStatus.PENDING.value,
        index=True,
    )

    # ========================================================
    # Team Leader
    # ========================================================
    #
    # The organization admin must assign a team leader
    # while creating the project.
    #
    # The referenced user must have:
    #
    #     Employee.is_team_leader == True
    #

    team_leader_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
        index=True,
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

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Set by the organization admin. The start date is fixed once the
    # Team Leader starts the project; the deadline can always be moved.
    start_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    deadline: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    # ========================================================
    # Relationships
    # ========================================================

    organization = relationship(
        "Organization",
    )

    client = relationship(
        "Client",
    )

    team_leader = relationship(
        "User",
        foreign_keys=[team_leader_id],
    )

    members = relationship(
        "ProjectMember",
        back_populates="project",
        cascade="all, delete-orphan",
    )
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

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.database.base import Base


class ProjectMember(Base):
    """
    Employee/reviewer assignment to a project.

    A user may have multiple roles on the same project.

    Employee assignment:
        project_id + user_id + job_role_id + is_reviewer=False

    Reviewer assignment:
        project_id + user_id + job_role_id + is_reviewer=True

    Example:

        Project: Mahabharat

        Rahul:
            Animator       -> employee assignment
            Writer         -> employee assignment

        Priya:
            Writer         -> reviewer assignment
            Editor         -> reviewer assignment

    The same assignment cannot be created twice for the
    same user, project, job role and assignment type.

    Uniqueness is therefore:

        project_id + user_id + job_role_id + is_reviewer
    """

    __tablename__ = "project_members"

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "user_id",
            "job_role_id",
            "is_reviewer",
            name="uq_project_member_project_user_role_type",
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
    # Project
    # ========================================================

    project_id: Mapped[int] = mapped_column(
        ForeignKey(
            "projects.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Employee / Reviewer
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
    # Job Role
    # ========================================================

    job_role_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "organization_roles.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    # ========================================================
    # Assignment Type
    # ========================================================

    is_reviewer: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        index=True,
    )

    # ========================================================
    # Assignment Timestamp
    # ========================================================

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ========================================================
    # Relationships
    # ========================================================

    project = relationship(
        "Project",
        back_populates="members",
    )

    user = relationship(
        "User",
    )

    job_role = relationship(
        "OrganizationJobRole",
    )
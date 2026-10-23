from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EmployeeInvitation(Base):
    """
    Invitation used to onboard an employee into an organization.

    The invitation initializes only:

        - employee email
        - organization
        - job role
        - system role
        - maximum concurrent projects

    Reviewer and team leader are intentionally NOT part of
    the invitation.

    They are assigned later through organization member
    management APIs after the employee has joined.
    """

    __tablename__ = "employee_invitations"

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
    # Employee Email
    # ========================================================

    email: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Job Role
    # ========================================================

    job_role_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organization_roles.id",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Organization System Role
    # ========================================================

    system_role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="employee",
        server_default="employee",
    )

    # ========================================================
    # Maximum Concurrent Projects
    # ========================================================

    max_concurrent_projects: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # ========================================================
    # Invitation Security
    # ========================================================

    token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # ========================================================
    # Invitation Status
    # ========================================================

    is_accepted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    job_role = relationship(
        "OrganizationJobRole",
    )
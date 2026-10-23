from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


# ============================================================
# Organization System Roles
# ============================================================


class OrganizationRole(str, PyEnum):
    """
    System-level roles inside an organization.

    These roles control organization-level permissions.

    Production/job responsibilities such as:
        - Animator
        - Writer
        - Character Designer
        - Team Leader
        - Reviewer

    are NOT organization system roles.

    Team Leader and Reviewer are employee responsibilities
    stored in the Employee model.
    """

    ADMIN = "organization_admin"
    EMPLOYEE = "employee"


# ============================================================
# Organization Membership
# ============================================================


class OrganizationMembership(Base):
    """
    Connects a user to an organization.

    Membership stores organization-level membership and
    reporting hierarchy.

    It does NOT store:

        - job role
        - reviewer status
        - team leader status
        - project capacity

    Those belong to Employee.

    team_leader_id identifies the employee's assigned
    team leader.
    """

    __tablename__ = "organization_memberships"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_organization_user_membership",
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
    # System / RBAC Role
    # ========================================================

    role: Mapped[OrganizationRole] = mapped_column(
        SAEnum(
            OrganizationRole,
            name="organization_role",
            values_callable=lambda enum_class: [
                member.value
                for member in enum_class
            ],
        ),
        nullable=False,
        default=OrganizationRole.EMPLOYEE,
        server_default=OrganizationRole.EMPLOYEE.value,
    )

    # ========================================================
    # Membership Status
    # ========================================================

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    # ========================================================
    # Team Leader
    # ========================================================
    #
    # For an employee:
    #
    #     team_leader_id = the user who leads this employee.
    #
    # For an organization administrator:
    #
    #     normally NULL.
    #
    # The referenced user must be an active Team Leader
    # employee. This validation belongs in the service layer.
    #

    team_leader_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    # ========================================================
    # Timestamps
    # ========================================================

    joined_at: Mapped[datetime] = mapped_column(
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
        back_populates="memberships",
    )

    user = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="memberships",
    )

    team_leader = relationship(
        "User",
        foreign_keys=[team_leader_id],
    )
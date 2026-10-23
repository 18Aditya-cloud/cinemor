from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Integer,
    String,
    func,
)

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class AccountType(str, PyEnum):
    """
    Account type selected by the user during onboarding.

    NULL:
        User has authenticated but has not selected
        an account type yet.

    individual:
        User selected an Individual account.

    organization:
        User selected an Organization account.
    """

    INDIVIDUAL = "individual"
    ORGANIZATION = "organization"


class User(Base):
    """
    Authentication identity for Cinemor.

    A user can belong to:

        - an individual account
        - an organization
        - one or more organization memberships

    Employee-specific production information is stored in
    the Employee model.
    """

    __tablename__ = "users"

    # =========================================================
    # Primary Key
    # =========================================================

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # =========================================================
    # Authentication Identity
    # =========================================================

    email: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # =========================================================
    # Account Type
    # =========================================================
    #
    # NULL:
    #   User has authenticated but has not selected
    #   Individual or Organization yet.
    #
    # individual:
    #   User selected Individual.
    #
    # organization:
    #   User selected Organization.
    #
    # =========================================================

    account_type: Mapped[AccountType | None] = mapped_column(
        SAEnum(
            AccountType,
            name="account_type",
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=True,
    )

    # =========================================================
    # Account Status
    # =========================================================

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    is_email_verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # =========================================================
    # Login Security
    # =========================================================

    failed_login_attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
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

    memberships = relationship(
        "OrganizationMembership",
        foreign_keys="OrganizationMembership.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    refresh_sessions = relationship(
        "RefreshSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    employee_profiles = relationship(
        "Employee",
        back_populates="user",
        cascade="all, delete-orphan",
    )
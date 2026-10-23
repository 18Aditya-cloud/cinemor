from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EmployeeJobRole(Base):
    """
    Associates an employee with an organization-specific job role.

    One employee can have multiple job roles.

    Example:

        Employee:
            User #15

        Roles:
            Animator
            3D Artist
            Character Designer
    """

    __tablename__ = "employee_job_roles"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "job_role_id",
            name="uq_employee_job_role",
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
    # Employee
    # ========================================================

    employee_id: Mapped[int] = mapped_column(
        ForeignKey(
            "employees.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Organization Job Role
    # ========================================================

    job_role_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organization_roles.id",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Timestamp
    # ========================================================

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ========================================================
    # Relationships
    # ========================================================

    employee = relationship(
        "Employee",
        back_populates="job_roles",
    )

    job_role = relationship(
        "OrganizationJobRole",
    )

class EmployeeReviewerJobRole(Base):
    """
    Associates an employee with a job role that the employee
    is responsible for reviewing.

    The job role must already be assigned to the employee
    through EmployeeJobRole.

    Example:

        Employee:

            User #15

        Assigned Job Roles:

            Animator
            3D Artist
            Character Designer

        Reviewer Roles:

            Animator
            3D Artist
    """

    __tablename__ = "employee_reviewer_job_roles"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "job_role_id",
            name="uq_employee_reviewer_job_role",
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
    # Employee
    # ========================================================

    employee_id: Mapped[int] = mapped_column(
        ForeignKey(
            "employees.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Organization Job Role
    # ========================================================

    job_role_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organization_roles.id",
        ),
        nullable=False,
        index=True,
    )

    # ========================================================
    # Timestamp
    # ========================================================

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ========================================================
    # Relationships
    # ========================================================

    employee = relationship(
        "Employee",
        back_populates="reviewer_job_roles",
    )

    job_role = relationship(
        "OrganizationJobRole",
    )
from __future__ import annotations

from sqlalchemy import (
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.database.base import Base


class OrganizationJobRoleTool(Base):
    """
    Associates an organization job role with an
    organization tool.

    Example:

        Animator
            ├── Maya
            ├── Blender
            └── After Effects

    The same tool can be assigned to multiple job roles.
    """

    __tablename__ = "organization_job_role_tools"

    __table_args__ = (
        UniqueConstraint(
            "job_role_id",
            "tool_id",
            name="uq_job_role_tool",
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
    # Job Role
    # =========================================================

    job_role_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organization_roles.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # =========================================================
    # Organization Tool
    # =========================================================

    tool_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organization_tools.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # =========================================================
    # Relationships
    # =========================================================

    job_role = relationship(
        "OrganizationJobRole",
        back_populates="tool_assignments",
    )

    tool = relationship(
        "OrganizationTool",
    )
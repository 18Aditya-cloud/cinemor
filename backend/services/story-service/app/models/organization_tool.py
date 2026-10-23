from __future__ import annotations

from sqlalchemy import (
    Boolean,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.database.base import Base


class OrganizationTool(Base):
    """
    Tool/software used by an organization.

    Each tool belongs to one organization.

    Example:
        React
        FastAPI
        PostgreSQL
        Docker
        GitHub
    """

    __tablename__ = "organization_tools"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "name",
            name="uq_organization_tool_name",
        ),
    )

    # ========================================================
    # Primary Key
    # ========================================================

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
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
    # Tool Information
    # ========================================================

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    website_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # ========================================================
    # Status
    # ========================================================

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # ========================================================
    # Relationship
    # ========================================================

    organization = relationship(
        "Organization",
        back_populates="tools",
    )
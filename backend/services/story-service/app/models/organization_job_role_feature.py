from __future__ import annotations

from sqlalchemy import (
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.database.base import Base


class OrganizationJobRoleFeature(Base):
    """
    Associates an organization job role with a
    Cinemor platform feature.

    Features themselves are hardcoded in:
        app/constants/cinemor_features.py

    Example:

        Animator
            ├── character_creation
            ├── scene_creation
            └── video_generation

        Writer
            ├── story_creation
            └── storyboard_creation
    """

    __tablename__ = "organization_job_role_features"

    __table_args__ = (
        UniqueConstraint(
            "job_role_id",
            "feature_key",
            name="uq_job_role_feature",
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
    # Cinemor Feature
    # =========================================================

    feature_key: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    # =========================================================
    # Relationships
    # =========================================================

    job_role = relationship(
        "OrganizationJobRole",
        back_populates="feature_assignments",
    )
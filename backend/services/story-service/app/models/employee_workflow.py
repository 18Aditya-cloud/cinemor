"""
Employee workflow for organization projects.

    OrganizationProjectWorkspace
        Every organization project gets one "workspace": a hidden individual
        project that holds its story, storyboard, characters, locations,
        sketches and video. The existing /api/individual/... code does all
        the AI work on it; employees reach it through /api/employee/projects/
        {project_id}/work/..., which checks their role and the stage first.

    ProjectWorkflowStage
        The stored status of one stage of one project (in_review,
        changes_requested, approved). A stage without a row is "open" when the
        stages it depends on are approved, and "locked" when they are not.

    ProjectStageSubmission
        One "Submit for review": who sent which stage to which reviewer, and
        the reviewer's answer.

    EmployeeNotification
        Messages shown on the employee dashboard ("Story approved. You can now
        work on the Storyboard.").

Only new tables: no existing table or column is changed.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class OrganizationProjectWorkspace(Base):
    __tablename__ = "organization_project_workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # The hidden individual project that holds the project's AI work.
    individual_project_id: Mapped[int] = mapped_column(
        ForeignKey("individual_projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # The user the hidden individual project belongs to (the project's
    # Team Leader when the workspace was made).
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # The approved story every later stage works on (set when Story is approved).
    story_id: Mapped[int | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ProjectWorkflowStage(Base):
    __tablename__ = "project_workflow_stages"
    __table_args__ = (
        UniqueConstraint("project_id", "stage", name="uq_project_workflow_stage"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # story | storyboard | characters | locations | sketches | animation
    stage: Mapped[str] = mapped_column(String(30), nullable=False)

    # in_review | changes_requested | approved
    status: Mapped[str] = mapped_column(String(30), nullable=False)

    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ProjectStageSubmission(Base):
    __tablename__ = "project_stage_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    stage: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # For the Story stage: which story was sent.
    story_id: Mapped[int | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), nullable=True
    )

    submitted_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    reviewer_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # pending | approved | changes_requested | withdrawn | cancelled
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", server_default="pending", index=True
    )

    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submitted_by = relationship("User", foreign_keys=[submitted_by_user_id])
    reviewer = relationship("User", foreign_keys=[reviewer_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])


class EmployeeNotification(Base):
    __tablename__ = "employee_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )

    stage: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # stage_opened | submitted | approved | changes_requested | reopened | withdrawn
    kind: Mapped[str] = mapped_column(String(40), nullable=False)

    message: Mapped[str] = mapped_column(Text, nullable=False)

    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

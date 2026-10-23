"""add employee workflow (workspaces, stages, submissions, notifications)

Revision ID: e3f7a9c1d2b4
Revises: b92a7bf9e1ae
Create Date: 2026-10-22 20:00:00

Only new tables. No existing table or column is changed.

If `alembic heads` shows a different head in your project, put that revision
in down_revision below before running `alembic upgrade head`.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f7a9c1d2b4"
down_revision: Union[str, Sequence[str], None] = "b92a7bf9e1ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_project_workspaces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("individual_project_id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("story_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["individual_project_id"], ["individual_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("individual_project_id"),
    )
    op.create_index(
        "ix_organization_project_workspaces_project_id",
        "organization_project_workspaces",
        ["project_id"],
        unique=True,
    )

    op.create_table(
        "project_workflow_stages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "stage", name="uq_project_workflow_stage"),
    )
    op.create_index("ix_project_workflow_stages_project_id", "project_workflow_stages", ["project_id"])

    op.create_table(
        "project_stage_submissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=30), nullable=False),
        sa.Column("story_id", sa.Integer(), nullable=True),
        sa.Column("submitted_by_user_id", sa.Integer(), nullable=False),
        sa.Column("reviewer_user_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("review_comment", sa.Text(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_stage_submissions_project_id", "project_stage_submissions", ["project_id"])
    op.create_index("ix_project_stage_submissions_stage", "project_stage_submissions", ["stage"])
    op.create_index("ix_project_stage_submissions_status", "project_stage_submissions", ["status"])
    op.create_index("ix_project_stage_submissions_submitted_by_user_id", "project_stage_submissions", ["submitted_by_user_id"])
    op.create_index("ix_project_stage_submissions_reviewer_user_id", "project_stage_submissions", ["reviewer_user_id"])

    op.create_table(
        "employee_notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("stage", sa.String(length=30), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employee_notifications_user_id", "employee_notifications", ["user_id"])
    op.create_index("ix_employee_notifications_created_at", "employee_notifications", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_employee_notifications_created_at", table_name="employee_notifications")
    op.drop_index("ix_employee_notifications_user_id", table_name="employee_notifications")
    op.drop_table("employee_notifications")

    op.drop_index("ix_project_stage_submissions_reviewer_user_id", table_name="project_stage_submissions")
    op.drop_index("ix_project_stage_submissions_submitted_by_user_id", table_name="project_stage_submissions")
    op.drop_index("ix_project_stage_submissions_status", table_name="project_stage_submissions")
    op.drop_index("ix_project_stage_submissions_stage", table_name="project_stage_submissions")
    op.drop_index("ix_project_stage_submissions_project_id", table_name="project_stage_submissions")
    op.drop_table("project_stage_submissions")

    op.drop_index("ix_project_workflow_stages_project_id", table_name="project_workflow_stages")
    op.drop_table("project_workflow_stages")

    op.drop_index("ix_organization_project_workspaces_project_id", table_name="organization_project_workspaces")
    op.drop_table("organization_project_workspaces")

"""add one_click_films (one-click generation: one prompt -> a finished film)

Revision ID: b7d3e5f9a2c4
Revises: a6c2e8f4b1d3
Create Date: 2026-10-29 18:00:00

Only a new table. No existing table or column is changed.

If `alembic heads` shows a different head in your project, put that revision
in down_revision below before running `alembic upgrade head`.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7d3e5f9a2c4"
down_revision: Union[str, Sequence[str], None] = "a6c2e8f4b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "one_click_films",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("individual_project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("story_id", sa.Integer(), nullable=True),
        sa.Column("video_job_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("stage", sa.String(length=20), server_default="story", nullable=False),
        sa.Column("prompt", sa.Text(), server_default="", nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("progress", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["individual_project_id"], ["individual_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["video_job_id"], ["video_generation_jobs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_one_click_films_individual_project_id", "one_click_films", ["individual_project_id"])
    op.create_index("ix_one_click_films_user_id", "one_click_films", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_one_click_films_user_id", table_name="one_click_films")
    op.drop_index("ix_one_click_films_individual_project_id", table_name="one_click_films")
    op.drop_table("one_click_films")
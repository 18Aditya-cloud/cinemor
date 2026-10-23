"""every story of an organization project has its own workflow

Revision ID: b8d4f0e2c6a3
Revises: a7c3e9d1b5f2
Create Date: 2026-10-23 23:00:00

project_workflow_stages gets a story_id: a project can have several stories, and each
one goes Story -> Storyboard -> Characters + Locations -> Sketches -> AI Animation on its
own. Existing rows are given the story they were about (from their submissions, or the
project's approved story).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8d4f0e2c6a3"
down_revision: Union[str, Sequence[str], None] = "a7c3e9d1b5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_workflow_stages", sa.Column("story_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_project_workflow_stages_story_id", "project_workflow_stages", "stories",
        ["story_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_project_workflow_stages_story_id", "project_workflow_stages", ["story_id"])
    # which story each existing row was about
    op.execute(
        """
        UPDATE project_workflow_stages w
        SET story_id = (
            SELECT s.story_id FROM project_stage_submissions s
            WHERE s.project_id = w.project_id AND s.stage = w.stage AND s.story_id IS NOT NULL
            ORDER BY s.id DESC LIMIT 1
        )
        """
    )
    op.execute(
        """
        UPDATE project_workflow_stages w
        SET story_id = ws.story_id
        FROM organization_project_workspaces ws
        WHERE w.story_id IS NULL AND ws.project_id = w.project_id
        """
    )
    op.execute("DELETE FROM project_workflow_stages WHERE story_id IS NULL")
    op.drop_constraint("uq_project_workflow_stage", "project_workflow_stages", type_="unique")
    op.create_unique_constraint(
        "uq_project_story_workflow_stage", "project_workflow_stages", ["project_id", "story_id", "stage"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_project_story_workflow_stage", "project_workflow_stages", type_="unique")
    # keep one row per project and stage (the newest)
    op.execute(
        """
        DELETE FROM project_workflow_stages a USING project_workflow_stages b
        WHERE a.project_id = b.project_id AND a.stage = b.stage AND a.id < b.id
        """
    )
    op.create_unique_constraint("uq_project_workflow_stage", "project_workflow_stages", ["project_id", "stage"])
    op.drop_index("ix_project_workflow_stages_story_id", table_name="project_workflow_stages")
    op.drop_constraint("fk_project_workflow_stages_story_id", "project_workflow_stages", type_="foreignkey")
    op.drop_column("project_workflow_stages", "story_id")

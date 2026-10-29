"""add quick_creations (the Quick Create tools: character, location, image, story, avatar video, audio)

Revision ID: a6c2e8f4b1d3
Revises: f4a7c1e9b3d5
Create Date: 2026-10-28 22:00:00

Only a new table. No existing table or column is changed.

If `alembic heads` shows a different head in your project, put that revision
in down_revision below before running `alembic upgrade head`.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a6c2e8f4b1d3"
down_revision: Union[str, Sequence[str], None] = "f4a7c1e9b3d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quick_creations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="working", nullable=False),
        sa.Column("title", sa.String(length=300), server_default="", nullable=False),
        sa.Column("prompt", sa.Text(), server_default="", nullable=False),
        sa.Column("model_id", sa.String(length=200), server_default="", nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("mime_type", sa.String(length=100), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("source_key", sa.String(length=500), nullable=True),
        sa.Column("source_mime_type", sa.String(length=100), nullable=True),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quick_creations_user_id", "quick_creations", ["user_id"])
    op.create_index("ix_quick_creations_kind", "quick_creations", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_quick_creations_kind", table_name="quick_creations")
    op.drop_index("ix_quick_creations_user_id", table_name="quick_creations")
    op.drop_table("quick_creations")

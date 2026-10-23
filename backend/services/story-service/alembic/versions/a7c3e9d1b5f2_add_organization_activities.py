"""add the organization activity feed

Revision ID: a7c3e9d1b5f2
Revises: f1a2b3c4d5e6
Create Date: 2026-10-23 12:30:00

One new table, organization_activities (Overview -> Recent activity). Nothing else changes.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c3e9d1b5f2"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_activities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("actor_role", sa.String(length=30), nullable=True),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organization_activities_organization_id", "organization_activities", ["organization_id"])
    op.create_index("ix_organization_activities_kind", "organization_activities", ["kind"])
    op.create_index("ix_organization_activities_created_at", "organization_activities", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_organization_activities_created_at", table_name="organization_activities")
    op.drop_index("ix_organization_activities_kind", table_name="organization_activities")
    op.drop_index("ix_organization_activities_organization_id", table_name="organization_activities")
    op.drop_table("organization_activities")

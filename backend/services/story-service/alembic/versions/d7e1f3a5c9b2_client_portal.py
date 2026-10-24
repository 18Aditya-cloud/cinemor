"""client portal (client accounts, invitations, comments, film decisions) and display names

Revision ID: d7e1f3a5c9b2
Revises: c5e9a3f7d2b1
Create Date: 2026-10-24 15:30:00

- account_type gets the value "client".
- users.display_name: the name a person chooses in Settings.
- client_invitations, client_accounts, client_comments, client_story_decisions (app/models/client_portal.py).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e1f3a5c9b2"
down_revision: Union[str, Sequence[str], None] = "c5e9a3f7d2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # a new enum value cannot be used in the transaction that adds it, so it is added on its own
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'client'")

    op.add_column("users", sa.Column("display_name", sa.String(length=120), nullable=True))

    op.create_table(
        "client_invitations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("invited_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_client_invitations_organization_id", "client_invitations", ["organization_id"])
    op.create_index("ix_client_invitations_client_id", "client_invitations", ["client_id"])

    op.create_table(
        "client_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "client_id", name="uq_client_account_user_client"),
    )
    op.create_index("ix_client_accounts_user_id", "client_accounts", ["user_id"])
    op.create_index("ix_client_accounts_client_id", "client_accounts", ["client_id"])

    op.create_table(
        "client_comments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_side", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_client_comments_project_id", "client_comments", ["project_id"])

    op.create_table(
        "client_story_decisions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("decision", sa.String(length=30), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "story_id", name="uq_client_story_decision"),
    )
    op.create_index("ix_client_story_decisions_project_id", "client_story_decisions", ["project_id"])


def downgrade() -> None:
    op.drop_table("client_story_decisions")
    op.drop_table("client_comments")
    op.drop_table("client_accounts")
    op.drop_table("client_invitations")
    op.drop_column("users", "display_name")
    # (PostgreSQL cannot drop one value from an enum; "client" stays in account_type)

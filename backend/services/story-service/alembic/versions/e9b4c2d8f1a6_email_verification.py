"""email verification tokens

Revision ID: e9b4c2d8f1a6
Revises: d7e1f3a5c9b2
Create Date: 2026-10-24 19:40:00

- email_verification_tokens: one-time links that prove a user owns their inbox.
- Every user that already exists is marked verified, so nobody who signed up
  before email verification existed is locked out after this deploy.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e9b4c2d8f1a6"
down_revision: Union[str, Sequence[str], None] = "d7e1f3a5c9b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"])
    op.create_index("ix_email_verification_tokens_token_hash", "email_verification_tokens", ["token_hash"], unique=True)

    # Existing accounts predate verification: treat them as verified.
    op.execute("UPDATE users SET is_email_verified = true WHERE is_email_verified = false")


def downgrade() -> None:
    op.drop_index("ix_email_verification_tokens_token_hash", table_name="email_verification_tokens")
    op.drop_index("ix_email_verification_tokens_user_id", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")

"""a submission remembers the work it sent (so unchanged work is not sent again)

Revision ID: c5e9a3f7d2b1
Revises: b8d4f0e2c6a3
Create Date: 2026-10-24 10:30:00

project_stage_submissions gets content_fingerprint: a hash of the stage's work at the moment it
was sent for review. After a reviewer asks for changes, the same work cannot be sent again.
Existing submissions keep NULL (no check for them).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5e9a3f7d2b1"
down_revision: Union[str, Sequence[str], None] = "b8d4f0e2c6a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_stage_submissions", sa.Column("content_fingerprint", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("project_stage_submissions", "content_fingerprint")
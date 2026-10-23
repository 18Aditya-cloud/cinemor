"""add start date and deadline to organization projects

Revision ID: f1a2b3c4d5e6
Revises: e3f7a9c1d2b4
Create Date: 2026-10-23 10:30:00

Two new, empty (nullable) columns on projects. Nothing else changes.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e3f7a9c1d2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("projects", sa.Column("deadline", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "deadline")
    op.drop_column("projects", "start_date")
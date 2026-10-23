"""add account type to users

Revision ID: c8951fd2d15a
Revises: dfdc8fc00cb2
Create Date: 2026-09-18 23:25:26.649301
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8951fd2d15a"
down_revision: Union[str, Sequence[str], None] = "dfdc8fc00cb2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""

    account_type_enum = sa.Enum(
        "individual",
        "organization",
        name="account_type",
    )

    # Create the PostgreSQL enum type first.
    account_type_enum.create(
        op.get_bind(),
        checkfirst=True,
    )

    # Add the account_type column.
    op.add_column(
        "users",
        sa.Column(
            "account_type",
            account_type_enum,
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Revert this migration."""

    # Remove the column first.
    op.drop_column(
        "users",
        "account_type",
    )

    # Then remove the PostgreSQL enum type.
    account_type_enum = sa.Enum(
        "individual",
        "organization",
        name="account_type",
    )

    account_type_enum.drop(
        op.get_bind(),
        checkfirst=True,
    )
"""update project status enum

Revision ID: 86b94c3f7980
Revises: 3fd9f71df6ac
Create Date: 2026-08-25 22:31:17.423916

"""

from typing import Sequence, Union

from alembic import op


revision: str = "<GENERATED_REVISION_ID>"
down_revision: Union[str, Sequence[str], None] = "3fd9f71df6ac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN status DROP DEFAULT
        """
    )

    op.execute(
        """
        ALTER TYPE project_status
        RENAME TO project_status_old
        """
    )

    op.execute(
        """
        CREATE TYPE project_status AS ENUM (
            'pending',
            'started',
            'completed',
            'aborted'
        )
        """
    )

    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN status
        TYPE project_status
        USING (
            CASE status::text
                WHEN 'draft' THEN 'pending'
                WHEN 'active' THEN 'started'
                WHEN 'review' THEN 'pending'
                WHEN 'completed' THEN 'completed'
                WHEN 'cancelled' THEN 'aborted'
            END
        )::project_status
        """
    )

    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN status
        SET DEFAULT 'pending'
        """
    )

    op.execute(
        """
        DROP TYPE project_status_old
        """
    )


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade is not supported because "
        "'draft' and 'review' both map to 'pending'."
    )
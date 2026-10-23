"""add reviewer type to project members

Revision ID: a1914018e279
Revises: 202c29dc7a02
Create Date: 2026-09-24 18:56:49.974223

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1914018e279"
down_revision: Union[str, Sequence[str], None] = "202c29dc7a02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""

    # ========================================================
    # 1. Add reviewer flag
    # ========================================================

    op.add_column(
        "project_members",
        sa.Column(
            "is_reviewer",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )

    # ========================================================
    # 2. Preserve existing reviewer assignments
    #
    # Before this migration:
    #
    #   job_role_id IS NULL
    #
    # was used to identify reviewers.
    #
    # After this migration:
    #
    #   is_reviewer = TRUE
    #
    # identifies reviewers.
    # ========================================================

    op.execute(
        """
        UPDATE project_members
        SET is_reviewer = TRUE
        WHERE job_role_id IS NULL
        """
    )

    # ========================================================
    # 3. Remove old uniqueness constraint
    # ========================================================

    op.drop_constraint(
        op.f("uq_project_member_project_user_role"),
        "project_members",
        type_="unique",
    )

    # ========================================================
    # 4. Add index for reviewer filtering
    # ========================================================

    op.create_index(
        op.f("ix_project_members_is_reviewer"),
        "project_members",
        ["is_reviewer"],
        unique=False,
    )

    # ========================================================
    # 5. New uniqueness rule
    #
    # Same project + same user + same role can exist twice
    # only when assignment type is different:
    #
    #   employee:
    #       is_reviewer = FALSE
    #
    #   reviewer:
    #       is_reviewer = TRUE
    #
    # This allows:
    #
    #   Project 1 / User 10 / Writer / employee
    #   Project 1 / User 10 / Writer / reviewer
    #
    # but prevents:
    #
    #   Project 1 / User 10 / Writer / reviewer
    #   Project 1 / User 10 / Writer / reviewer
    # ========================================================

    op.create_unique_constraint(
        "uq_project_member_project_user_role_type",
        "project_members",
        [
            "project_id",
            "user_id",
            "job_role_id",
            "is_reviewer",
        ],
    )


def downgrade() -> None:
    """Revert this migration."""

    # ========================================================
    # 1. Remove new uniqueness constraint
    # ========================================================

    op.drop_constraint(
        "uq_project_member_project_user_role_type",
        "project_members",
        type_="unique",
    )

    # ========================================================
    # 2. Remove reviewer index
    # ========================================================

    op.drop_index(
        op.f("ix_project_members_is_reviewer"),
        table_name="project_members",
    )

    # ========================================================
    # 3. Restore old uniqueness constraint
    # ========================================================

    op.create_unique_constraint(
        op.f("uq_project_member_project_user_role"),
        "project_members",
        [
            "project_id",
            "user_id",
            "job_role_id",
        ],
        postgresql_nulls_not_distinct=False,
    )

    # ========================================================
    # 4. Remove reviewer flag
    # ========================================================

    op.drop_column(
        "project_members",
        "is_reviewer",
    )
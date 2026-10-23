"""
What happened in an organization, newest first: the Overview's "Recent activity".

Rows are written automatically when organization data changes (projects, clients,
job roles, tools, invitations, employees, project teams): see
app/services/activity_log.py. Nothing writes them by hand.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class OrganizationActivity(Base):
    __tablename__ = "organization_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # who did it (empty when nobody was signed in, e.g. someone accepting an invitation)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # kept as they were at the time, so the feed still reads well if the person leaves
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Admin | Team Leader | Reviewer | Employee
    actor_role: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # project | client | role | tool | invitation | employee | organization
    kind: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # created | updated | deleted | started | completed | aborted | deadline | ...
    action: Mapped[str] = mapped_column(String(40), nullable=False)

    # "created the project “Mahabharat”" (the actor is shown before it)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

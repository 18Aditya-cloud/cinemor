"""
The organization's activity feed (Overview → Recent activity, and the Activity page).

    GET /api/organizations/{organization_id}/activity?limit=20&before_id=&kind=

Admins only. Newest first. `before_id` pages back (send the id of the last row you
have); `kind` filters: project, stage, client, role, tool, invitation, employee,
organization.

Only the last RETENTION_DAYS (14) days are kept: older rows are deleted from the database,
for every organization, at most every 10 minutes (when someone reads the feed).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies.auth import OrganizationAdmin
from app.database.session import get_db
from app.models.organization_activity import OrganizationActivity

router = APIRouter(
    prefix="/api/organizations/{organization_id}",
    tags=["Organization Activity"],
)

RETENTION_DAYS = 14
_PURGE_EVERY = timedelta(minutes=10)
_last_purge: dict[str, datetime] = {}

KINDS = {"project", "stage", "client", "role", "tool", "invitation", "employee", "organization"}


def purge_old_activity(db: Session, *, force: bool = False) -> int:
    """Delete activity older than RETENTION_DAYS (all organizations). At most every 10 minutes unless `force`."""
    now = datetime.now(timezone.utc)
    if not force and _last_purge.get("at") and now - _last_purge["at"] < _PURGE_EVERY:
        return 0
    _last_purge["at"] = now
    cutoff = now - timedelta(days=RETENTION_DAYS)
    deleted = (
        db.query(OrganizationActivity)
        .filter(OrganizationActivity.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return deleted


class ActivityActor(BaseModel):
    user_id: int | None
    email: str | None
    role: str | None


class ActivityItem(BaseModel):
    id: int
    kind: str
    action: str
    message: str
    actor: ActivityActor
    entity_type: str | None
    entity_id: int | None
    created_at: datetime


class ActivityPage(BaseModel):
    items: list[ActivityItem]
    has_more: bool


@router.get("/activity", response_model=ActivityPage)
def list_activity(
    organization_id: int,
    membership: OrganizationAdmin,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    before_id: int | None = Query(default=None, ge=1),
    kind: str | None = Query(default=None),
) -> ActivityPage:
    if membership.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this organization.")
    purge_old_activity(db)
    since = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    query = db.query(OrganizationActivity).filter(
        OrganizationActivity.organization_id == organization_id,
        OrganizationActivity.created_at >= since,
    )
    if before_id is not None:
        query = query.filter(OrganizationActivity.id < before_id)
    if kind:
        wanted = [k for k in kind.split(",") if k in KINDS]
        if wanted:
            query = query.filter(OrganizationActivity.kind.in_(wanted))
    rows = query.order_by(OrganizationActivity.id.desc()).limit(limit + 1).all()
    return ActivityPage(
        items=[
            ActivityItem(
                id=row.id,
                kind=row.kind,
                action=row.action,
                message=row.message,
                actor=ActivityActor(user_id=row.actor_user_id, email=row.actor_email, role=row.actor_role),
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                created_at=row.created_at,
            )
            for row in rows[:limit]
        ],
        has_more=len(rows) > limit,
    )
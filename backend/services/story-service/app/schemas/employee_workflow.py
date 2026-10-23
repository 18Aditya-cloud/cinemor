from __future__ import annotations

from pydantic import BaseModel, Field


class StageSubmitRequest(BaseModel):
    """Send a stage to a reviewer of that stage."""

    reviewer_user_id: int = Field(..., gt=0)
    note: str | None = Field(default=None, max_length=2000)
    # Story stage only: which story to send (the newest one when left out).
    story_id: int | None = Field(default=None, gt=0)


class ReviewAnswerRequest(BaseModel):
    """Approve (comment optional) or ask for changes (comment required)."""

    comment: str | None = Field(default=None, max_length=4000)


class StageReopenRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)
    # which story's stage (every story has its own stages)
    story_id: int | None = None


class NotificationsReadRequest(BaseModel):
    """Mark these notifications as read; every unread one when `ids` is empty."""

    ids: list[int] = Field(default_factory=list)

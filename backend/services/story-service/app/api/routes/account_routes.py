"""
Deleting your own account (individual creators, and organization administrators with their organization).
See app/services/account_deletion_service.py for what is deleted.

    GET  /api/auth/me/deletion          what would be deleted (shown before confirming)
    POST /api/auth/me/deletion/code     email a 6-digit confirmation code (for people without a password)
    POST /api/auth/me/delete            { confirm: "DELETE", password? | code? }   delete the account for good
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.api.routes.auth_routes import _clear_refresh_cookie
from app.core.rate_limit import rate_limit
from app.database.session import get_db
from app.services.account_deletion_service import AccountDeletionError, AccountDeletionService

router = APIRouter(prefix="/api/auth/me", tags=["Account deletion"])


class DeleteAccountRequest(BaseModel):
    confirm: str = Field(..., max_length=20)
    password: str | None = Field(default=None, max_length=200)
    code: str | None = Field(default=None, max_length=12)


def _fail(exc: AccountDeletionError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/deletion")
def deletion_summary(current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return AccountDeletionService(db).summary(current_user)
    except AccountDeletionError as exc:
        raise _fail(exc) from exc


@router.post("/deletion/code", status_code=202, dependencies=[Depends(rate_limit(limit=3, window_seconds=600))])
def send_deletion_code(current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        AccountDeletionService(db).send_code(current_user)
    except AccountDeletionError as exc:
        raise _fail(exc) from exc
    return {"sent": True, "email": current_user.email}


@router.post("/delete", dependencies=[Depends(rate_limit(limit=5, window_seconds=900))])
def delete_my_account(body: DeleteAccountRequest, response: Response, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        result = AccountDeletionService(db).delete(current_user, confirm=body.confirm, password=body.password, code=body.code)
    except AccountDeletionError as exc:
        raise _fail(exc) from exc
    _clear_refresh_cookie(response)
    return result
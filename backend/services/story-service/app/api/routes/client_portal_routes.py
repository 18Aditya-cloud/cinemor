"""
The client portal, and everyone's own account settings.

Organization admin (Clients page)
    GET    /api/organizations/{id}/client-portal                    each client: not_invited | invited | joined
    POST   /api/organizations/{id}/clients/{client_id}/portal-invite send (or send again) the invitation email
    DELETE /api/organizations/{id}/clients/{client_id}/portal-invite cancel the pending invitation
    DELETE /api/organizations/{id}/clients/{client_id}/portal-access the client's login stops seeing these projects

The link in the email (no login)
    GET    /api/auth/client-invitations/{token}                     who invited whom
    POST   /api/auth/client-invitations/accept                      { token, password, confirm_password }

The client (logged in as a client)
    GET    /api/client/overview                                     counts, ready for you, updates, projects
    GET    /api/client/projects                                     every project of the client
    GET    /api/client/projects/{id}                                one project: stories, approved work, comments
    GET    /api/client/projects/{id}/comments                       the conversation with the Team Leader
    POST   /api/client/projects/{id}/comments                       { body, story_id? }
    POST   /api/client/projects/{id}/stories/{story_id}/film        { decision: approve | changes, comment? }
    GET    /api/client/projects/{id}/work/<path>                    an approved image / sketch / film (read only)

The project's Team Leader
    GET    /api/employee/projects/{id}/client-comments              the client's comments and film decisions
    POST   /api/employee/projects/{id}/client-comments              { body, story_id? } a reply

Everyone (Settings)
    PATCH  /api/auth/me                                             { display_name }
    PATCH  /api/auth/me/password                                    { current_password, new_password, confirm_password }
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.api.routes.auth_routes import _set_refresh_cookie
from app.database.session import get_db
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.client_portal_service import ClientPortalError, ClientPortalService
from app.services.employee_work_proxy import forward_to_workspace

router = APIRouter(tags=["Client portal"])


class AcceptClientInvitationRequest(BaseModel):
    token: str = Field(min_length=1)
    password: str | None = None
    confirm_password: str | None = None


class CommentRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    story_id: int | None = None


class FilmDecisionRequest(BaseModel):
    decision: str
    comment: str | None = Field(default=None, max_length=4000)


class DisplayNameRequest(BaseModel):
    display_name: str = Field(max_length=120)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str
    confirm_password: str


def _fail(exc: ClientPortalError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _require_admin(db: Session, user, organization_id: int) -> None:
    membership = AuthService(db).get_user_membership(user_id=user.id, organization_id=organization_id)
    if membership.role.value != "organization_admin":
        raise HTTPException(status_code=403, detail="Only the organization's administrators can do this.")


# ------------------------------------------------------------------------------------------- organization admin
@router.get("/api/organizations/{organization_id}/client-portal")
def portal_statuses(organization_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    _require_admin(db, current_user, organization_id)
    return ClientPortalService(db).portal_statuses(organization_id)


@router.post("/api/organizations/{organization_id}/clients/{client_id}/portal-invite", status_code=201)
def invite_client(organization_id: int, client_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    _require_admin(db, current_user, organization_id)
    try:
        return ClientPortalService(db).invite(organization_id, client_id, current_user)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.delete("/api/organizations/{organization_id}/clients/{client_id}/portal-invite", status_code=204)
def cancel_client_invitation(organization_id: int, client_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    _require_admin(db, current_user, organization_id)
    try:
        ClientPortalService(db).cancel_invitation(organization_id, client_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.delete("/api/organizations/{organization_id}/clients/{client_id}/portal-access", status_code=204)
def remove_client_access(organization_id: int, client_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    _require_admin(db, current_user, organization_id)
    try:
        ClientPortalService(db).remove_access(organization_id, client_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


# ------------------------------------------------------------------------------------------ the link in the email
@router.get("/api/auth/client-invitations/{token}")
def client_invitation_info(token: str, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).invitation_info(token)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.post("/api/auth/client-invitations/accept", status_code=201)
def accept_client_invitation(request: AcceptClientInvitationRequest, response: Response, db: Session = Depends(get_db)):
    try:
        result = ClientPortalService(db).accept(request.token, request.password, request.confirm_password)
    except ClientPortalError as exc:
        raise _fail(exc) from exc
    refresh_token = result.pop("refresh_token", None)
    if refresh_token:
        _set_refresh_cookie(response, refresh_token)
    return result


# ------------------------------------------------------------------------------------------------------ the client
@router.get("/api/client/overview")
def client_overview(current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).overview(current_user)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.get("/api/client/projects")
def client_projects(current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).projects(current_user)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.get("/api/client/projects/{project_id}")
def client_project(project_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).project_detail(current_user, project_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.get("/api/client/projects/{project_id}/comments")
def client_comments(project_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).comments(current_user, project_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.post("/api/client/projects/{project_id}/comments", status_code=201)
def client_add_comment(project_id: int, request: CommentRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).add_comment(current_user, project_id, request.body, request.story_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.post("/api/client/projects/{project_id}/stories/{story_id}/film")
def client_film_decision(project_id: int, story_id: int, request: FilmDecisionRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).decide_film(current_user, project_id, story_id, request.decision, request.comment)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.get("/api/client/projects/{project_id}/work/{subpath:path}")
async def client_media(project_id: int, subpath: str, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)):
    """An approved image, sketch or film of the project (read only), from the project's workspace."""
    try:
        _, workspace = ClientPortalService(db).check_media(current_user, project_id, request.method, subpath)
    except ClientPortalError as exc:
        raise _fail(exc) from exc
    individual_project_id = workspace.individual_project_id
    owner_user_id = workspace.owner_user_id
    db.close()
    return await forward_to_workspace(request, individual_project_id=individual_project_id, owner_user_id=owner_user_id, subpath=subpath, project_id=project_id)


# --------------------------------------------------------------------------------------------- the Team Leader
@router.get("/api/employee/projects/{project_id}/client-comments")
def team_client_comments(project_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).team_comments(current_user, project_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


@router.post("/api/employee/projects/{project_id}/client-comments", status_code=201)
def team_client_reply(project_id: int, request: CommentRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return ClientPortalService(db).team_reply(current_user, project_id, request.body, request.story_id)
    except ClientPortalError as exc:
        raise _fail(exc) from exc


# ---------------------------------------------------------------------------------------- everyone: Settings
@router.patch("/api/auth/me")
def update_my_name(request: DisplayNameRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    """The name shown to others (empty: the email's first part is shown)."""
    name = " ".join(request.display_name.split())
    user = db.get(User, current_user.id)
    user.display_name = name or None
    db.commit()
    return {"id": user.id, "email": user.email, "display_name": user.display_name}


@router.patch("/api/auth/me/password")
def change_my_password(request: PasswordChangeRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    """Change the password (the current one is needed). Every session of the account is ended, this one too."""
    return AuthService(db).change_password(
        user_id=current_user.id,
        current_password=request.current_password,
        new_password=request.new_password,
        confirm_password=request.confirm_password,
    )

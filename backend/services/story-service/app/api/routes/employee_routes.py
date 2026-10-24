"""
Employee dashboard API (/api/employee/...).

    GET   /me                                         who I am in my organization (roles, tools of my roles)
    GET   /projects                                   my projects (as employee, reviewer or Team Leader)
    GET   /projects/{id}                              one project: stages, people per stage, submissions
    GET   /projects/{id}/stages/{stage}/reviewers     who I can send this stage to
    POST  /projects/{id}/stages/{stage}/submit        Submit for review { reviewer_user_id, note?, story_id? }
    POST  /projects/{id}/stages/{stage}/reopen        Team Leader: reopen an approved stage { reason? }
    GET   /reviews                                    reviews sent to me (and ones I may answer as Team Leader)
    GET   /submissions                                what I sent for review
    POST  /submissions/{id}/approve                   { comment? }
    POST  /submissions/{id}/request-changes           { comment }
    POST  /submissions/{id}/withdraw                  take my submission back from review
    GET   /notifications                              newest first, with the unread count
    POST  /notifications/read                         { ids: [] }  (empty = all)

    ANY   /projects/{id}/work/<path>                  the project's AI work: the same paths as
                                                      /api/individual/projects/{id}/<path>
                                                      (stories, storyboard, characters, locations,
                                                      scenes/sketches, video), checked against the
                                                      employee's role and the stage first.

Stage keys: story, storyboard, characters, locations, sketches, animation.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser
from app.database.session import get_db
from app.models.membership import OrganizationMembership
from app.models.employee import Employee
from app.models.organization import Organization
from app.models.organization_job_role_tool import OrganizationJobRoleTool
from app.models.organization_tool import OrganizationTool
from app.schemas.employee_workflow import (
    NotificationsReadRequest,
    ReviewAnswerRequest,
    StageReopenRequest,
    StageSubmitRequest,
)
from app.services.employee_work_proxy import forward_to_workspace
from app.services.employee_workflow_service import EmployeeWorkflowService, WorkflowError

router = APIRouter(prefix="/api/employee", tags=["Employee Dashboard"])


def _fail(exc: WorkflowError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/me")
def get_me(current_user: CurrentUser, db: Session = Depends(get_db)):
    membership = (
        db.query(OrganizationMembership)
        .filter(OrganizationMembership.user_id == current_user.id, OrganizationMembership.is_active.is_(True))
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="This account is not part of an organization.")
    organization = db.get(Organization, membership.organization_id)
    employee = (
        db.query(Employee)
        .filter(Employee.organization_id == membership.organization_id, Employee.user_id == current_user.id)
        .first()
    )
    role_ids = [r.job_role_id for r in (employee.job_roles if employee else [])]
    tools: dict[int, dict] = {}
    if role_ids:
        for link, tool in (
            db.query(OrganizationJobRoleTool, OrganizationTool)
            .join(OrganizationTool, OrganizationTool.id == OrganizationJobRoleTool.tool_id)
            .filter(OrganizationJobRoleTool.job_role_id.in_(role_ids), OrganizationTool.is_active.is_(True))
            .all()
        ):
            entry = tools.setdefault(tool.id, {
                "id": tool.id, "name": tool.name, "description": tool.description,
                "website_url": tool.website_url, "job_role_ids": [],
            })
            entry["job_role_ids"].append(link.job_role_id)
    return {
        "user_id": current_user.id,
        "email": current_user.email,
        "organization_id": membership.organization_id,
        "organization_name": organization.name if organization else "",
        "employee_id": employee.id if employee else None,
        "is_team_leader": bool(employee and employee.is_team_leader),
        "is_reviewer": bool(employee and employee.is_reviewer),
        "job_roles": [
            {"job_role_id": r.job_role_id, "name": r.job_role.name if r.job_role else ""}
            for r in (employee.job_roles if employee else [])
        ],
        "tools": sorted(tools.values(), key=lambda t: t["name"].lower()),
    }


@router.get("/projects")
def list_projects(current_user: CurrentUser, db: Session = Depends(get_db)):
    return EmployeeWorkflowService(db).list_projects(current_user)


@router.get("/projects/{project_id}")
def get_project(project_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return EmployeeWorkflowService(db).project_detail(project_id, current_user)
    except WorkflowError as exc:
        raise _fail(exc) from exc


@router.get("/projects/{project_id}/stages/{stage}/reviewers")
def list_stage_reviewers(project_id: int, stage: str, current_user: CurrentUser, db: Session = Depends(get_db)):
    service = EmployeeWorkflowService(db)
    try:
        service._check_stage(stage)
        service.require_view(project_id, current_user)
        return service.reviewers_for(project_id, stage, exclude_user_id=current_user.id)
    except WorkflowError as exc:
        raise _fail(exc) from exc

@router.get("/projects/{project_id}/stages/{stage}/submit-check")
def check_submit(project_id: int, stage: str, current_user: CurrentUser, story_id: int | None = None, db: Session = Depends(get_db)):
    """Can this stage of this story be sent for review now? {can_submit, reason} (empty work, nothing changed...)."""
    try:
        return EmployeeWorkflowService(db).submit_check(project_id, stage, current_user, story_id)
    except WorkflowError as exc:
        raise _fail(exc) from exc

@router.post("/projects/{project_id}/stages/{stage}/submit", status_code=201)
def submit_stage(project_id: int, stage: str, request: StageSubmitRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return EmployeeWorkflowService(db).submit(
            project_id, stage, current_user, request.reviewer_user_id, request.note, request.story_id
        )
    except WorkflowError as exc:
        raise _fail(exc) from exc


@router.post("/projects/{project_id}/stages/{stage}/reopen")
def reopen_stage(project_id: int, stage: str, request: StageReopenRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return EmployeeWorkflowService(db).reopen(project_id, stage, current_user, request.reason, request.story_id)
    except WorkflowError as exc:
        raise _fail(exc) from exc


@router.get("/reviews")
def list_reviews(current_user: CurrentUser, db: Session = Depends(get_db)):
    return EmployeeWorkflowService(db).reviews(current_user)


@router.get("/submissions")
def list_my_submissions(current_user: CurrentUser, db: Session = Depends(get_db)):
    return EmployeeWorkflowService(db).my_submissions(current_user)


@router.post("/submissions/{submission_id}/approve")
def approve_submission(submission_id: int, request: ReviewAnswerRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return EmployeeWorkflowService(db).approve(submission_id, current_user, request.comment)
    except WorkflowError as exc:
        raise _fail(exc) from exc


@router.post("/submissions/{submission_id}/request-changes")
def request_changes(submission_id: int, request: ReviewAnswerRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return EmployeeWorkflowService(db).request_changes(submission_id, current_user, request.comment or "")
    except WorkflowError as exc:
        raise _fail(exc) from exc


@router.post("/submissions/{submission_id}/withdraw")
def withdraw_submission(submission_id: int, current_user: CurrentUser, db: Session = Depends(get_db)):
    try:
        return EmployeeWorkflowService(db).withdraw(submission_id, current_user)
    except WorkflowError as exc:
        raise _fail(exc) from exc


@router.get("/notifications")
def list_notifications(current_user: CurrentUser, db: Session = Depends(get_db)):
    return EmployeeWorkflowService(db).notifications(current_user)


@router.post("/notifications/read", status_code=204)
def read_notifications(request: NotificationsReadRequest, current_user: CurrentUser, db: Session = Depends(get_db)):
    EmployeeWorkflowService(db).mark_read(current_user, request.ids)


_WORK_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"]


async def project_work(project_id: int, request: Request, current_user: CurrentUser, subpath: str = "", db: Session = Depends(get_db)):
    """The project's AI work (same paths as /api/individual/projects/{id}/...), after the role and stage checks."""
    service = EmployeeWorkflowService(db)
    try:
        project, access = service.require_view(project_id, current_user)
        service.check_work(project, current_user, access, request.method, subpath)
        workspace = service.ensure_workspace(project)
    except WorkflowError as exc:
        raise _fail(exc) from exc
    individual_project_id = workspace.individual_project_id
    owner_user_id = workspace.owner_user_id
    db.close()  # the inner request opens its own session
    return await forward_to_workspace(
        request,
        individual_project_id=individual_project_id,
        owner_user_id=owner_user_id,
        subpath=subpath,
        project_id=project_id,
    )


# one route per method (so each has its own operation id in /docs)
for _method in _WORK_METHODS:
    router.add_api_route(
        "/projects/{project_id}/work/{subpath:path}",
        project_work,
        methods=[_method],
        name=f"project_work_{_method.lower()}",
    )
    router.add_api_route(
        "/projects/{project_id}/work",
        project_work,
        methods=[_method],
        name=f"project_work_root_{_method.lower()}",
        include_in_schema=False,
    )

"""
Taking people out safely.

    check_responsibility_change()   before an admin removes someone's Team Leader or Reviewer post:
                                    refused while they still lead / review a project that is not
                                    finished (Not started or Ongoing)

    delete_employee()               an admin deletes an employee for good (their account and
                                    everything that belongs to it). Refused while they lead any
                                    project or are on a project that is not finished; the work
                                    they did on finished projects stays with those projects.
"""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_invitation import EmployeeInvitation
from app.models.employee_workflow import OrganizationProjectWorkspace
from app.models.individual_project import IndividualProject
from app.models.membership import OrganizationMembership, OrganizationRole
from app.models.organization_activity import OrganizationActivity
from app.models.organization_job_role import OrganizationJobRole
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember
from app.models.user import User

UNFINISHED = (ProjectStatus.PENDING, ProjectStatus.STARTED)
STATUS_WORDS = {
    "pending": "not started",
    "started": "ongoing",
    "completed": "completed",
    "aborted": "aborted",
}


def _names(titles: list[str]) -> str:
    quoted = [f"“{t}”" for t in titles]
    if len(quoted) <= 1:
        return "".join(quoted)
    return ", ".join(quoted[:-1]) + " and " + quoted[-1]


def _email(db: Session, user_id: int) -> str:
    user = db.get(User, user_id)
    return user.email if user is not None else "This employee"


# ====================================================================== demoting
def check_responsibility_change(
    db: Session,
    *,
    organization_id: int,
    employee: Employee,
    is_team_leader: bool | None,
    is_reviewer: bool | None,
    reviewer_job_role_ids: list[int] | None,
) -> None:
    """Raise ValueError when the change would take a post away from someone still using it."""

    who = _email(db, employee.user_id)

    # ---- Team Leader post
    if is_team_leader is False and employee.is_team_leader:
        led = db.scalars(
            select(Project.title)
            .where(
                Project.organization_id == organization_id,
                Project.team_leader_id == employee.user_id,
                Project.status.in_(UNFINISHED),
            )
            .order_by(Project.id)
        ).all()
        if led:
            it = "it" if len(led) == 1 else "them"
            raise ValueError(
                f"{who} is still the Team Leader of {_names(list(led))}, which "
                f"{'is' if len(led) == 1 else 'are'} not finished. Give {it} another "
                "Team Leader first (Projects → Edit), then remove the Team Leader post."
            )

    # ---- Reviewer post (or some of the job roles they review)
    if not employee.is_reviewer:
        return
    if is_reviewer is False:
        keep: set[int] | None = set()
    elif reviewer_job_role_ids is not None:
        keep = {int(i) for i in reviewer_job_role_ids}
    else:
        return  # nothing about reviewing changes

    rows = db.execute(
        select(Project.title, ProjectMember.job_role_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(
            Project.organization_id == organization_id,
            Project.status.in_(UNFINISHED),
            ProjectMember.user_id == employee.user_id,
            ProjectMember.is_reviewer.is_(True),
        )
        .order_by(Project.id)
    ).all()
    blocking = [(title, role_id) for title, role_id in rows if role_id is None or role_id not in keep]
    if not blocking:
        return

    role_names = {
        role.id: role.name
        for role in db.scalars(
            select(OrganizationJobRole).where(
                OrganizationJobRole.id.in_([r for _, r in blocking if r is not None])
            )
        )
    }
    parts = [
        f"{role_names.get(role_id, 'reviewer')} on “{title}”" if role_id else f"“{title}”"
        for title, role_id in blocking
    ]
    raise ValueError(
        f"{who} is still a reviewer ({', '.join(parts)}) on a project that is not finished. "
        "Ask the project's Team Leader to remove them as a reviewer first, "
        "then change their Reviewer post."
    )


# ====================================================================== deleting
def delete_employee(
    db: Session,
    *,
    organization_id: int,
    actor_user_id: int,
    target_user_id: int,
) -> dict:
    """Delete an employee of this organization for good."""

    actor = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == actor_user_id,
            OrganizationMembership.is_active.is_(True),
        )
    )
    if actor is None or getattr(actor.role, "value", actor.role) != OrganizationRole.ADMIN.value:
        raise PermissionError("Only organization administrators can delete employees.")

    if target_user_id == actor_user_id:
        raise ValueError("You cannot delete your own account.")

    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == target_user_id,
        )
    )
    if membership is None or getattr(membership.role, "value", membership.role) != OrganizationRole.EMPLOYEE.value:
        raise ValueError("Employee not found.")

    user = db.get(User, target_user_id)
    if user is None:
        raise ValueError("Employee not found.")
    who = user.email

    # 1. A project always needs its Team Leader (finished ones too: they keep their history).
    led = db.execute(
        select(Project.title, Project.status)
        .where(Project.team_leader_id == target_user_id)
        .order_by(Project.id)
    ).all()
    if led:
        listed = ", ".join(
            f"“{title}” ({STATUS_WORDS.get(getattr(st, 'value', st), st)})" for title, st in led
        )
        raise ValueError(
            f"{who} is the Team Leader of {listed}. Give "
            f"{'that project' if len(led) == 1 else 'each of these projects'} another Team Leader "
            "first (Projects → Edit), then delete the employee."
        )

    # 2. Not while they are on a project that is still going.
    busy = db.scalars(
        select(Project.title)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(
            ProjectMember.user_id == target_user_id,
            Project.status.in_(UNFINISHED),
        )
        .distinct()
    ).all()
    if busy:
        raise ValueError(
            f"{who} is still on {_names(sorted(busy))}, which "
            f"{'is' if len(busy) == 1 else 'are'} not finished. Ask the Team Leader to remove "
            "them from the team first (or finish the project), then delete the employee."
        )

    # 3. Project work kept in their name (they led a project earlier): hand it to today's Team Leader.
    for workspace in db.scalars(
        select(OrganizationProjectWorkspace).where(
            OrganizationProjectWorkspace.owner_user_id == target_user_id
        )
    ).all():
        project = db.get(Project, workspace.project_id)
        if project is None:
            continue
        backing = db.get(IndividualProject, workspace.individual_project_id)
        if backing is not None:
            backing.individual_user_id = project.team_leader_id
        workspace.owner_user_id = project.team_leader_id

    # 4. Their invitations to this organization (so the address can be invited again later).
    db.execute(
        delete(EmployeeInvitation).where(
            EmployeeInvitation.organization_id == organization_id,
            func.lower(EmployeeInvitation.email) == who.lower(),
        )
    )

    # 5. The feed: say who was deleted (the row outlives the account).
    admin = db.get(User, actor_user_id)
    db.add(
        OrganizationActivity(
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            actor_email=admin.email if admin else None,
            actor_role="Admin",
            kind="employee",
            action="deleted",
            message=f"deleted the employee {who}",
            entity_type="User",
            entity_id=target_user_id,
        )
    )
    db.flush()

    # 6. The account itself. The database removes everything that belongs to it
    #    (membership, employee record and job roles, places on finished projects,
    #    sign-in sessions, notifications). If they also belong to another
    #    organization, only this organization's part is removed.
    elsewhere = db.scalar(
        select(func.count(OrganizationMembership.id)).where(
            OrganizationMembership.user_id == target_user_id,
            OrganizationMembership.organization_id != organization_id,
        )
    )
    if elsewhere:
        db.execute(
            delete(ProjectMember).where(
                ProjectMember.user_id == target_user_id,
                ProjectMember.project_id.in_(
                    select(Project.id).where(Project.organization_id == organization_id)
                ),
            )
        )
        db.execute(
            delete(Employee).where(
                Employee.organization_id == organization_id,
                Employee.user_id == target_user_id,
            )
        )
        db.execute(
            delete(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.user_id == target_user_id,
            )
        )
    else:
        db.execute(delete(User).where(User.id == target_user_id))

    db.commit()
    db.expire_all()
    return {"message": f"{who} was deleted."}

"""
The organization's activity feed, written automatically.

    ActivityActorMiddleware   reads who is making the request (the access token)
    install_activity_log()    watches database saves; when organization data is created,
                              changed or deleted, readable rows are added to
                              organization_activities just before the transaction commits

So nothing in the routes or services has to remember to log: a change that is committed
is in the feed, and a change that is rolled back is not. One request gives one clean set
of rows (a project created and then given its dates is one "created the project" row).

Tracked: projects (created, deleted, started / completed / aborted, deadline and start
date, Team Leader, description), project teams, clients, job roles (and what they can
use), tools, invitations (sent, accepted, revoked), employees (Team Leader, Reviewer,
job roles, what they review, project limit, deactivated), approved workflow stages, and
the organization's details.
"""

from __future__ import annotations

from contextvars import ContextVar
from datetime import date

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.constants.workflow_stages import STAGES_BY_KEY, STATUS_APPROVED
from app.models.client import Client
from app.models.employee import Employee
from app.models.employee_invitation import EmployeeInvitation
from app.models.employee_job_role import EmployeeJobRole, EmployeeReviewerJobRole
from app.models.employee_workflow import ProjectWorkflowStage
from app.models.membership import OrganizationMembership, OrganizationRole
from app.models.organization import Organization
from app.models.organization_activity import OrganizationActivity
from app.models.organization_job_role import OrganizationJobRole
from app.models.organization_job_role_feature import OrganizationJobRoleFeature
from app.models.organization_job_role_tool import OrganizationJobRoleTool
from app.models.organization_tool import OrganizationTool
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.story import Story
from app.models.user import User

# the signed-in user of the current request (set by ActivityActorMiddleware)
_actor: ContextVar[int | None] = ContextVar("cinemor_activity_actor", default=None)

_KEY = "cinemor_activity"


# ====================================================================== who is acting
class ActivityActorMiddleware:
    """Remembers the signed-in user of each request, for the activity feed."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)
        token = _actor.set(_user_from_headers(scope.get("headers") or []))
        try:
            return await self.app(scope, receive, send)
        finally:
            _actor.reset(token)


def _user_from_headers(headers) -> int | None:
    for key, value in headers:
        if key.lower() == b"authorization":
            text = value.decode("latin-1")
            if text.lower().startswith("bearer "):
                try:
                    from app.core.security import decode_access_token

                    return int(decode_access_token(text[7:].strip()).get("sub"))
                except Exception:  # noqa: BLE001 - a bad token just means "unknown"
                    return None
    return None


# ====================================================================== helpers
def _q(text) -> str:
    return f"“{text}”"


def _day(value) -> str:
    if isinstance(value, date):
        return f"{value.day} {value.strftime('%b %Y')}"
    return str(value)


def _names(names) -> str:
    items = [_q(n) for n in sorted(names)]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _changed(obj, name):
    """(old, new) when the attribute changed in this save, else None."""
    try:
        history = inspect(obj).attrs[name].history
    except Exception:  # noqa: BLE001
        return None
    if not history.has_changes():
        return None
    old = history.deleted[0] if history.deleted else None
    new = history.added[0] if history.added else None
    old = getattr(old, "value", old)
    new = getattr(new, "value", new)
    if old == new:
        return None
    return old, new


class _Feed:
    """Everything one transaction did, turned into rows when it commits."""

    def __init__(self, session: Session):
        self.session = session
        self.actor_id = _actor.get()
        self.rows: list[dict] = []
        self.born: set[tuple] = set()          # (model, id) created in this transaction
        self.new_projects: list[Project] = []  # worded at commit, with their final dates
        self.role_changes: dict[tuple, dict] = {}  # (employee id, reviewer?) -> added / removed names
        self._users: dict[int, User | None] = {}
        self._roles: dict[int, str] = {}
        self._seen: set[tuple] = set()

    # ---- lookups
    def user(self, user_id):
        if not user_id:
            return None
        if user_id not in self._users:
            self._users[user_id] = self.session.get(User, user_id)
        return self._users[user_id]

    def email(self, user_id) -> str:
        user = self.user(user_id)
        return user.email if user else "someone"

    def get(self, model, key):
        return self.session.get(model, key) if key else None

    def is_born(self, model, key) -> bool:
        return (model.__name__, key) in self.born

    def actor_role(self, organization_id) -> str | None:
        if not self.actor_id:
            return None
        if organization_id not in self._roles:
            membership = (
                self.session.query(OrganizationMembership)
                .filter(
                    OrganizationMembership.organization_id == organization_id,
                    OrganizationMembership.user_id == self.actor_id,
                )
                .first()
            )
            role = "Employee"
            if membership is not None and getattr(membership.role, "value", membership.role) == OrganizationRole.ADMIN.value:
                role = "Admin"
            else:
                employee = (
                    self.session.query(Employee)
                    .filter(Employee.organization_id == organization_id, Employee.user_id == self.actor_id)
                    .first()
                )
                if employee is not None and employee.is_team_leader:
                    role = "Team Leader"
                elif employee is not None and employee.is_reviewer:
                    role = "Reviewer"
            self._roles[organization_id] = role
        return self._roles[organization_id]

    # ---- one row
    def add(self, organization_id, kind, action, message, entity=None, once=None, actor_email=None, actor_role=None):
        if not organization_id:
            return
        if once is not None:
            if once in self._seen:
                return
            self._seen.add(once)
        if actor_email is not None:  # someone not signed in (e.g. accepting an invitation)
            actor_id, role = None, actor_role
        else:
            actor = self.user(self.actor_id)
            actor_id, actor_email, role = self.actor_id, (actor.email if actor else None), self.actor_role(organization_id)
        self.rows.append(
            {
                "organization_id": organization_id,
                "actor_user_id": actor_id,
                "actor_email": actor_email,
                "actor_role": role,
                "kind": kind,
                "action": action,
                "message": message,
                "entity_type": type(entity).__name__ if entity is not None else None,
                "entity_id": getattr(entity, "id", None) if entity is not None else None,
            }
        )


# ====================================================================== what each change says
def _project(feed: _Feed, obj: Project, state: str):
    org, title = obj.organization_id, _q(obj.title)
    if state == "new":
        feed.new_projects.append(obj)
        return
    if state == "deleted":
        feed.add(org, "project", "deleted", f"deleted the project {title}", obj)
        return
    if feed.is_born(Project, obj.id):
        return  # still being created: the "created" row says it all
    change = _changed(obj, "status")
    if change:
        new = change[1]
        text = {
            "started": f"started the project {title}",
            "completed": f"marked the project {title} as completed",
            "aborted": f"aborted the project {title}",
            "pending": f"moved the project {title} back to Not started",
        }.get(new, f"changed the status of {title} to {new}")
        feed.add(org, "project", new or "status", text, obj)
    change = _changed(obj, "deadline")
    if change:
        old, new = change
        if new is None:
            text = f"removed the deadline of {title}"
        elif old is None:
            text = f"set the deadline of {title} to {_day(new)}"
        else:
            text = f"moved the deadline of {title} {'later' if new > old else 'earlier'}, to {_day(new)}"
        feed.add(org, "project", "deadline", text, obj)
    change = _changed(obj, "start_date")
    if change and change[1] is not None:
        feed.add(org, "project", "start_date", f"set the start date of {title} to {_day(change[1])}", obj)
    change = _changed(obj, "team_leader_id")
    if change:
        feed.add(org, "project", "team_leader", f"made {feed.email(change[1])} the Team Leader of {title}", obj)
    change = _changed(obj, "client_id")
    if change:
        client = feed.get(Client, change[1])
        feed.add(org, "project", "client", f"changed the client of {title} to {_q(client.name) if client else 'another client'}", obj)
    if _changed(obj, "description"):
        feed.add(org, "project", "updated", f"updated the description of {title}", obj)


def _project_created(feed: _Feed, obj: Project):
    text = f"created the project {_q(obj.title)}"
    client = feed.get(Client, obj.client_id)
    if client is not None:
        text += f" for {_q(client.name)}"
    if obj.deadline:
        text += f", due {_day(obj.deadline)}"
    feed.add(obj.organization_id, "project", "created", text, obj)


def _project_member(feed: _Feed, obj: ProjectMember, state: str):
    if state == "dirty":
        return
    project = feed.get(Project, obj.project_id)
    if project is None:
        return
    role = feed.get(OrganizationJobRole, obj.job_role_id)
    if role is not None:
        as_what = f"{role.name} reviewer" if obj.is_reviewer else role.name
    else:
        as_what = "a reviewer" if obj.is_reviewer else "a team member"
    who = feed.email(obj.user_id)
    if state == "new":
        feed.add(project.organization_id, "project", "member_added", f"added {who} to {_q(project.title)} as {as_what}", project)
    else:
        feed.add(project.organization_id, "project", "member_removed", f"removed {who} ({as_what}) from {_q(project.title)}", project)


def _client(feed: _Feed, obj: Client, state: str):
    name = _q(obj.name)
    if state == "new":
        feed.add(obj.organization_id, "client", "created", f"added the client {name}", obj)
    elif state == "deleted":
        feed.add(obj.organization_id, "client", "deleted", f"removed the client {name}", obj)
    elif not feed.is_born(Client, obj.id):
        change = _changed(obj, "name")
        if change:
            feed.add(obj.organization_id, "client", "updated", f"renamed the client {_q(change[0])} to {name}", obj)
        elif _changed(obj, "email") or _changed(obj, "phone"):
            feed.add(obj.organization_id, "client", "updated", f"updated the contact details of {name}", obj)


def _job_role(feed: _Feed, obj: OrganizationJobRole, state: str):
    name = _q(obj.name)
    if state == "new":
        feed.add(obj.organization_id, "role", "created", f"created the job role {name}", obj)
    elif state == "deleted":
        feed.add(obj.organization_id, "role", "deleted", f"deleted the job role {name}", obj)
    elif not feed.is_born(OrganizationJobRole, obj.id):
        change = _changed(obj, "name")
        if change:
            feed.add(obj.organization_id, "role", "updated", f"renamed the job role {_q(change[0])} to {name}", obj)
        elif _changed(obj, "description"):
            feed.add(obj.organization_id, "role", "updated", f"updated the description of the job role {name}", obj)


def _job_role_access(feed: _Feed, obj, state: str, deleted_roles: set):
    if state == "dirty" or obj.job_role_id in deleted_roles or feed.is_born(OrganizationJobRole, obj.job_role_id):
        return
    role = feed.get(OrganizationJobRole, obj.job_role_id)
    if role is None or inspect(role).pending:
        return
    feed.add(role.organization_id, "role", "permissions", f"changed what the job role {_q(role.name)} can use", role, once=("perm", role.id))


def _tool(feed: _Feed, obj: OrganizationTool, state: str):
    name = _q(obj.name)
    if state == "new":
        feed.add(obj.organization_id, "tool", "created", f"added the tool {name}", obj)
    elif state == "deleted":
        feed.add(obj.organization_id, "tool", "deleted", f"removed the tool {name}", obj)
    elif not feed.is_born(OrganizationTool, obj.id):
        change = _changed(obj, "is_active")
        if change:
            feed.add(obj.organization_id, "tool", "updated", f"{'turned on' if change[1] else 'turned off'} the tool {name}", obj)
        elif _changed(obj, "name") or _changed(obj, "description") or _changed(obj, "website_url"):
            feed.add(obj.organization_id, "tool", "updated", f"updated the tool {name}", obj)


def _invitation(feed: _Feed, obj: EmployeeInvitation, state: str):
    org = obj.organization_id
    if state == "new":
        role = feed.get(OrganizationJobRole, obj.job_role_id)
        feed.add(org, "invitation", "sent", f"invited {obj.email}" + (f" as {role.name}" if role else ""), obj)
    elif state == "deleted":
        if not obj.is_accepted:
            feed.add(org, "invitation", "revoked", f"cancelled the invitation to {obj.email}", obj)
    elif _changed(obj, "is_accepted") and obj.is_accepted:
        feed.add(org, "invitation", "accepted", "accepted the invitation and joined the organization", obj,
                 actor_email=obj.email, actor_role="Employee")
    elif _changed(obj, "revoked_at") and obj.revoked_at is not None:
        feed.add(org, "invitation", "revoked", f"cancelled the invitation to {obj.email}", obj)


def _employee(feed: _Feed, obj: Employee, state: str):
    if state != "dirty" or feed.is_born(Employee, obj.id):
        return
    who = feed.email(obj.user_id)
    org = obj.organization_id
    change = _changed(obj, "is_team_leader")
    if change:
        feed.add(org, "employee", "team_leader", f"made {who} a Team Leader" if change[1] else f"removed {who} as a Team Leader", obj)
    change = _changed(obj, "is_reviewer")
    if change:
        feed.add(org, "employee", "reviewer", f"made {who} a Reviewer" if change[1] else f"removed {who} as a Reviewer", obj)
    change = _changed(obj, "max_concurrent_projects")
    if change:
        feed.add(org, "employee", "capacity", f"set {who}'s project limit to {change[1]}" if change[1] else f"removed {who}'s project limit", obj)


def _employee_role(feed: _Feed, obj, state: str, reviewer: bool):
    if state == "dirty" or feed.is_born(Employee, obj.employee_id):
        return  # a new employee: "accepted the invitation" says enough
    role = feed.get(OrganizationJobRole, obj.job_role_id)
    if role is None:
        return
    group = feed.role_changes.setdefault((obj.employee_id, reviewer), {"added": set(), "removed": set()})
    group["added" if state == "new" else "removed"].add(role.name)


def _employee_role_rows(feed: _Feed):
    for (employee_id, reviewer), group in feed.role_changes.items():
        added, removed = group["added"] - group["removed"], group["removed"] - group["added"]
        if not added and not removed:
            continue  # the same roles were removed and given back
        employee = feed.get(Employee, employee_id)
        if employee is None:
            continue
        who = feed.email(employee.user_id)
        if reviewer:
            if added and removed:
                text = f"changed what {who} reviews: now {_names(added)}, no longer {_names(removed)}"
            elif added:
                text = f"made {who} a reviewer for {_names(added)}"
            else:
                text = f"stopped {who} reviewing {_names(removed)}"
        else:
            plural = "s" if len(added | removed) > 1 else ""
            if added and removed:
                text = f"changed {who}'s job roles: added {_names(added)}, removed {_names(removed)}"
            elif added:
                text = f"gave {who} the job role{plural} {_names(added)}"
            else:
                text = f"took the job role{plural} {_names(removed)} away from {who}"
        feed.add(employee.organization_id, "employee", "reviewer_roles" if reviewer else "roles", text, employee)


def _membership(feed: _Feed, obj: OrganizationMembership, state: str):
    if state != "dirty":
        return
    change = _changed(obj, "is_active")
    if change:
        who = feed.email(obj.user_id)
        feed.add(obj.organization_id, "employee", "active", f"reactivated {who}" if change[1] else f"deactivated {who}", obj)


def _stage(feed: _Feed, obj: ProjectWorkflowStage, state: str):
    if state == "deleted" or obj.status != STATUS_APPROVED:
        return
    if state == "dirty" and not _changed(obj, "status"):
        return
    project = feed.get(Project, obj.project_id)
    if project is None:
        return
    label = STAGES_BY_KEY.get(obj.stage, {}).get("label", obj.stage)
    story = feed.get(Story, getattr(obj, "story_id", None))
    where = f"{_q(story.title)} in {_q(project.title)}" if story is not None else _q(project.title)
    feed.add(project.organization_id, "stage", "approved", f"approved the {label} of {where}", project)


def _organization(feed: _Feed, obj: Organization, state: str):
    if state == "dirty" and any(_changed(obj, n) for n in ("name", "business_type", "official_address")):
        feed.add(obj.id, "organization", "updated", "updated the organization's details", obj, once=("org", obj.id))


_HANDLERS = (
    (Project, _project),
    (ProjectMember, _project_member),
    (Client, _client),
    (OrganizationJobRole, _job_role),
    (OrganizationTool, _tool),
    (EmployeeInvitation, _invitation),
    (Employee, _employee),
    (OrganizationMembership, _membership),
    (Organization, _organization),
    (ProjectWorkflowStage, _stage),
)

_TRACKED = (
    Project, ProjectMember, Client, OrganizationJobRole, OrganizationJobRoleFeature, OrganizationJobRoleTool,
    OrganizationTool, EmployeeInvitation, Employee, EmployeeJobRole, EmployeeReviewerJobRole,
    OrganizationMembership, Organization, ProjectWorkflowStage,
)


# ====================================================================== the listeners
def _feed(session: Session) -> _Feed:
    feed = session.info.get(_KEY)
    if feed is None:
        feed = session.info[_KEY] = _Feed(session)
    return feed


def _after_flush(session: Session, flush_context):
    batches = (("new", list(session.new)), ("dirty", list(session.dirty)), ("deleted", list(session.deleted)))
    if not any(isinstance(o, _TRACKED) for _, objects in batches for o in objects):
        return
    feed = _feed(session)
    deleted_roles = {o.id for o in session.deleted if isinstance(o, OrganizationJobRole)}
    with session.no_autoflush:
        for state, objects in batches:
            for obj in objects:
                if not isinstance(obj, _TRACKED):
                    continue
                if state == "dirty" and not session.is_modified(obj, include_collections=False):
                    continue
                try:
                    if isinstance(obj, (OrganizationJobRoleFeature, OrganizationJobRoleTool)):
                        _job_role_access(feed, obj, state, deleted_roles)
                    elif isinstance(obj, EmployeeJobRole):
                        _employee_role(feed, obj, state, reviewer=False)
                    elif isinstance(obj, EmployeeReviewerJobRole):
                        _employee_role(feed, obj, state, reviewer=True)
                    else:
                        for model, handler in _HANDLERS:
                            if isinstance(obj, model):
                                handler(feed, obj, state)
                                break
                except Exception:  # noqa: BLE001 - the feed must never break a save
                    continue
        # remember what this transaction created (its later edits are part of "created")
        for obj in batches[0][1]:
            if isinstance(obj, (Project, Client, OrganizationJobRole, OrganizationTool, Employee)) and obj.id is not None:
                feed.born.add((type(obj).__name__, obj.id))


def _before_commit(session: Session):
    session.flush()  # anything still pending goes through _after_flush first
    feed = session.info.pop(_KEY, None)
    if feed is None:
        return
    try:
        with session.no_autoflush:
            for project in feed.new_projects:
                _project_created(feed, project)
            _employee_role_rows(feed)
    except Exception:  # noqa: BLE001
        pass
    # the order things happened in: creations first, then the rest
    created = [r for r in feed.rows if r["action"] == "created" and r["kind"] == "project"]
    rest = [r for r in feed.rows if r not in created]
    for row in created + rest:
        session.add(OrganizationActivity(**row))
    # (commit flushes these rows right after this)


def _after_transaction_end(session: Session, transaction):
    if transaction.parent is None:
        session.info.pop(_KEY, None)


_installed = False


def install_activity_log() -> None:
    """Start watching database saves (once)."""
    global _installed
    if _installed:
        return
    event.listen(Session, "after_flush", _after_flush)
    event.listen(Session, "before_commit", _before_commit)
    event.listen(Session, "after_transaction_end", _after_transaction_end)
    _installed = True

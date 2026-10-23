"""
The employee workflow of organization projects: who may do what, stage by stage.

    Story ──approve──► Storyboard ──approve──► Characters ┐
                                                Locations  ┘
                      both approved ──► Sketches ──approve──► Animation

Rules
    - A stage opens when the stages it needs are approved (constants/workflow_stages.py).
    - An employee works on a stage when one of their roles on the project (project_members,
      is_reviewer = False) has a job role feature that belongs to that stage.
    - They send it to a reviewer of the same stage (project_members, is_reviewer = True,
      with a job role feature of that stage). Nobody reviews their own work.
    - The chosen reviewer approves or asks for changes. The project's Team Leader may also do
      it, but only when the Team Leader is a reviewer of that stage on the project.
    - An approved stage is locked. Only the project's Team Leader can reopen it; the stages
      after it are locked again until it is approved again.
    - Approving a stage tells the people who work on the stages it opens.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.constants.workflow_stages import (
    STAGE_KEYS,
    STAGES_BY_KEY,
    STATUS_APPROVED,
    STATUS_CHANGES_REQUESTED,
    STATUS_IN_REVIEW,
    STATUS_LOCKED,
    STATUS_OPEN,
    SUBMISSION_APPROVED,
    SUBMISSION_CANCELLED,
    SUBMISSION_CHANGES_REQUESTED,
    SUBMISSION_PENDING,
    SUBMISSION_WITHDRAWN,
    WORKFLOW_STAGES,
    downstream_of,
    stages_for_features,
)
from app.models.client import Client
from app.models.employee import Employee
from app.models.employee_workflow import (
    EmployeeNotification,
    OrganizationProjectWorkspace,
    ProjectStageSubmission,
    ProjectWorkflowStage,
)
from app.models.individual_project import IndividualProject
from app.models.membership import OrganizationMembership, OrganizationRole
from app.models.organization_job_role import OrganizationJobRole
from app.models.organization_job_role_feature import OrganizationJobRoleFeature
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.story import Story
from app.models.user import User


class WorkflowError(Exception):
    """A request the workflow refuses. `status_code` is the HTTP status to answer with."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _label(stage: str) -> str:
    return STAGES_BY_KEY[stage]["label"]


def _join(words: list[str]) -> str:
    if len(words) <= 1:
        return "".join(words)
    return f"{', '.join(words[:-1])} and {words[-1]}"


def _person(user: User | None) -> dict | None:
    if user is None:
        return None
    return {"user_id": user.id, "email": user.email, "name": user.email.split("@")[0]}


def _name(user: User | None) -> str:
    return user.email.split("@")[0] if user else "Someone"


class ProjectAccess:
    """What one user may do on one project."""

    def __init__(self) -> None:
        self.is_team_leader = False
        self.is_admin = False
        self.is_member = False
        self.work_roles: list[dict] = []  # [{job_role_id, name, stages}]
        self.review_roles: list[dict] = []
        self.work_stages: set[str] = set()
        self.review_stages: set[str] = set()

    @property
    def can_view(self) -> bool:
        return self.is_member or self.is_team_leader or self.is_admin


class EmployeeWorkflowService:
    def __init__(self, db: Session):
        self.db = db

    # ================================================================ loading
    def get_project(self, project_id: int) -> Project:
        project = self.db.get(Project, project_id)
        if project is None:
            raise WorkflowError("Project not found.", 404)
        return project

    def _members(self, project_id: int) -> list[ProjectMember]:
        return (
            self.db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id)
            .all()
        )

    def _role_info(self, role_ids: set[int]) -> dict[int, dict]:
        """{job_role_id: {name, stages}}"""
        if not role_ids:
            return {}
        names = {
            role.id: role.name
            for role in self.db.query(OrganizationJobRole)
            .filter(OrganizationJobRole.id.in_(role_ids))
            .all()
        }
        features: dict[int, set[str]] = {role_id: set() for role_id in role_ids}
        for role_id, key in (
            self.db.query(
                OrganizationJobRoleFeature.job_role_id,
                OrganizationJobRoleFeature.feature_key,
            )
            .filter(OrganizationJobRoleFeature.job_role_id.in_(role_ids))
            .all()
        ):
            features.setdefault(role_id, set()).add(key)
        return {
            role_id: {
                "name": names.get(role_id, "Role"),
                "stages": stages_for_features(features.get(role_id, set())),
            }
            for role_id in role_ids
        }

    def access(self, project: Project, user: User, members: list[ProjectMember] | None = None) -> ProjectAccess:
        access = ProjectAccess()
        access.is_team_leader = project.team_leader_id == user.id

        membership = (
            self.db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.organization_id == project.organization_id,
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            )
            .first()
        )
        role = getattr(membership, "role", None) if membership else None
        access.is_admin = role in (OrganizationRole.ADMIN, OrganizationRole.ADMIN.value)
        if membership is None and not access.is_team_leader:
            return access

        members = members if members is not None else self._members(project.id)
        mine = [m for m in members if m.user_id == user.id]
        access.is_member = bool(mine)
        info = self._role_info({m.job_role_id for m in mine if m.job_role_id})
        for m in mine:
            if not m.job_role_id or m.job_role_id not in info:
                continue
            role_info = {"job_role_id": m.job_role_id, **info[m.job_role_id]}
            if m.is_reviewer:
                access.review_roles.append(role_info)
                access.review_stages.update(role_info["stages"])
            else:
                access.work_roles.append(role_info)
                access.work_stages.update(role_info["stages"])

        # The Team Leader works on their project in the job roles the organization
        # gave them, and (if they are a Reviewer) reviews it in their reviewer roles,
        # without being added to the team.
        if access.is_team_leader:
            lead_work, lead_review = self._leader_role_ids(project)
            lead_work -= {r["job_role_id"] for r in access.work_roles}
            lead_review -= {r["job_role_id"] for r in access.review_roles}
            extra = self._role_info(lead_work | lead_review)
            for role_id in sorted(lead_work):
                role_info = {"job_role_id": role_id, **extra[role_id]}
                access.work_roles.append(role_info)
                access.work_stages.update(role_info["stages"])
            for role_id in sorted(lead_review):
                role_info = {"job_role_id": role_id, **extra[role_id]}
                access.review_roles.append(role_info)
                access.review_stages.update(role_info["stages"])
        return access

    def _leader_role_ids(self, project: Project) -> tuple[set[int], set[int]]:
        """(job roles, reviewer job roles) of the project's Team Leader in the organization."""
        employee = (
            self.db.query(Employee)
            .filter(
                Employee.organization_id == project.organization_id,
                Employee.user_id == project.team_leader_id,
            )
            .first()
        )
        if employee is None:
            return set(), set()
        work = {a.job_role_id for a in employee.job_roles if a.job_role_id}
        review = {a.job_role_id for a in employee.reviewer_job_roles if a.job_role_id} if employee.is_reviewer else set()
        return work, review

    def _leader_pairs(self, project_id: int, review: bool) -> list[tuple[int, int, User | None]]:
        """The Team Leader as a worker / reviewer of the project: [(user_id, job_role_id, user)]."""
        project = self.db.get(Project, project_id)
        if project is None:
            return []
        work, reviews = self._leader_role_ids(project)
        leader = self.db.get(User, project.team_leader_id)
        return [(project.team_leader_id, role_id, leader) for role_id in sorted(reviews if review else work)]

    @staticmethod
    def work_closed_reason(project: Project) -> str | None:
        """Why nobody can work on the project right now (None while it is Ongoing)."""
        status = getattr(project.status, "value", project.status)
        if status == "pending":
            return (
                "This project has not started yet. You can look around; "
                "the work opens when the Team Leader starts the project."
            )
        if status in ("completed", "aborted"):
            return f"This project is {status}, so its work can no longer change."
        return None

    def _require_work_open(self, project: Project) -> None:
        reason = self.work_closed_reason(project)
        if reason:
            raise WorkflowError(reason, 423)

    def require_view(self, project_id: int, user: User) -> tuple[Project, ProjectAccess]:
        project = self.get_project(project_id)
        access = self.access(project, user)
        if not access.can_view:
            raise WorkflowError("Project not found.", 404)
        return project, access

    # ================================================================ stages
    def _stage_rows(self, project_id: int) -> dict[str, ProjectWorkflowStage]:
        return {
            row.stage: row
            for row in self.db.query(ProjectWorkflowStage)
            .filter(ProjectWorkflowStage.project_id == project_id)
            .all()
        }

    def stage_states(self, project_id: int, rows: dict | None = None) -> dict[str, str]:
        rows = rows if rows is not None else self._stage_rows(project_id)
        states: dict[str, str] = {}
        for stage in WORKFLOW_STAGES:
            ready = all(states.get(req) == STATUS_APPROVED for req in stage["requires"])
            row = rows.get(stage["key"])
            if not ready:
                states[stage["key"]] = STATUS_LOCKED
            elif row is None:
                states[stage["key"]] = STATUS_OPEN
            else:
                states[stage["key"]] = row.status
        return states

    def _set_stage(self, project_id: int, stage: str, status: str, user: User | None = None) -> None:
        row = (
            self.db.query(ProjectWorkflowStage)
            .filter(ProjectWorkflowStage.project_id == project_id, ProjectWorkflowStage.stage == stage)
            .first()
        )
        if row is None:
            row = ProjectWorkflowStage(project_id=project_id, stage=stage, status=status)
            self.db.add(row)
        row.status = status
        if status == STATUS_APPROVED:
            row.approved_by_user_id = user.id if user else None
            row.approved_at = _now()
        else:
            row.approved_by_user_id = None
            row.approved_at = None

    def _clear_stage(self, project_id: int, stage: str) -> None:
        self.db.query(ProjectWorkflowStage).filter(
            ProjectWorkflowStage.project_id == project_id,
            ProjectWorkflowStage.stage == stage,
        ).delete(synchronize_session=False)

    def _locked_message(self, stage: str, states: dict[str, str]) -> str:
        waiting = [_label(req) for req in STAGES_BY_KEY[stage]["requires"] if states.get(req) != STATUS_APPROVED]
        verb = "is" if len(waiting) == 1 else "are"
        return f"The {_label(stage)} stage opens after the {_join(waiting)} {verb} approved."

    # ================================================================ workspace
    def get_workspace(self, project_id: int) -> OrganizationProjectWorkspace | None:
        return (
            self.db.query(OrganizationProjectWorkspace)
            .filter(OrganizationProjectWorkspace.project_id == project_id)
            .first()
        )

    def ensure_workspace(self, project: Project) -> OrganizationProjectWorkspace:
        """The hidden individual project that holds this project's AI work (made on first use)."""
        workspace = self.get_workspace(project.id)
        if workspace is None:
            backing = IndividualProject(
                individual_user_id=project.team_leader_id,
                title=project.title[:255],
                description=f"Workspace of organization project #{project.id}. Managed by Cinemor; do not edit.",
                project_type="self",
                status="started",
            )
            try:
                self.db.add(backing)
                self.db.flush()
                workspace = OrganizationProjectWorkspace(
                    project_id=project.id,
                    individual_project_id=backing.id,
                    owner_user_id=project.team_leader_id,
                )
                self.db.add(workspace)
                self.db.commit()
            except IntegrityError:
                # another request made it at the same moment: use that one
                self.db.rollback()
                workspace = self.get_workspace(project.id)
                if workspace is None:
                    raise
                return workspace
            self.db.refresh(workspace)
            return workspace

        # the owner must be an active user: hand the workspace to the current Team Leader if not
        owner = self.db.get(User, workspace.owner_user_id)
        if (owner is None or not owner.is_active) and workspace.owner_user_id != project.team_leader_id:
            backing = self.db.get(IndividualProject, workspace.individual_project_id)
            if backing is not None:
                backing.individual_user_id = project.team_leader_id
            workspace.owner_user_id = project.team_leader_id
            self.db.commit()
            self.db.refresh(workspace)
        return workspace

    # ================================================================ people
    def reviewers_for(self, project_id: int, stage: str, exclude_user_id: int | None = None) -> list[dict]:
        """Reviewers of this stage on the project: reviewers whose job role belongs to the stage."""
        pairs = [(m.user_id, m.job_role_id, m.user) for m in self._members(project_id) if m.is_reviewer and m.job_role_id]
        pairs += self._leader_pairs(project_id, review=True)  # a Team Leader who is a Reviewer reviews their project
        info = self._role_info({role_id for _, role_id, _ in pairs})
        found: dict[int, dict] = {}
        for user_id, role_id, person in pairs:
            if stage not in info.get(role_id, {}).get("stages", []):
                continue
            if exclude_user_id is not None and user_id == exclude_user_id:
                continue
            entry = found.setdefault(user_id, {**(_person(person) or {"user_id": user_id}), "roles": []})
            if info[role_id]["name"] not in entry["roles"]:
                entry["roles"].append(info[role_id]["name"])
        return sorted(found.values(), key=lambda r: r.get("email", ""))

    def workers_for(self, project_id: int, stage: str) -> list[dict]:
        pairs = [(m.user_id, m.job_role_id, m.user) for m in self._members(project_id) if not m.is_reviewer and m.job_role_id]
        pairs += self._leader_pairs(project_id, review=False)  # the Team Leader works in their own job roles
        info = self._role_info({role_id for _, role_id, _ in pairs})
        found: dict[int, dict] = {}
        for user_id, role_id, person in pairs:
            if stage not in info.get(role_id, {}).get("stages", []):
                continue
            entry = found.setdefault(user_id, {**(_person(person) or {"user_id": user_id}), "roles": []})
            if info[role_id]["name"] not in entry["roles"]:
                entry["roles"].append(info[role_id]["name"])
        return sorted(found.values(), key=lambda r: r.get("email", ""))

    def _notify(self, user_ids, project: Project, stage: str | None, kind: str, message: str, skip: int | None = None) -> None:
        for user_id in sorted(set(user_ids)):
            if skip is not None and user_id == skip:
                continue
            self.db.add(
                EmployeeNotification(user_id=user_id, project_id=project.id, stage=stage, kind=kind, message=message)
            )

    # ================================================================ serialising
    def _submission_dict(self, sub: ProjectStageSubmission, user: User, project: Project | None = None, access: ProjectAccess | None = None) -> dict:
        project = project or self.db.get(Project, sub.project_id)
        can_act = False
        if sub.status == SUBMISSION_PENDING and project is not None:
            if sub.reviewer_user_id == user.id and sub.submitted_by_user_id != user.id:
                can_act = True
            elif project.team_leader_id == user.id and sub.submitted_by_user_id != user.id:
                access = access or self.access(project, user)
                can_act = sub.stage in access.review_stages
        return {
            "id": sub.id,
            "project_id": sub.project_id,
            "project_title": project.title if project else "",
            "stage": sub.stage,
            "stage_label": _label(sub.stage),
            "story_id": sub.story_id,
            "status": sub.status,
            "note": sub.note,
            "review_comment": sub.review_comment,
            "submitted_by": _person(sub.submitted_by),
            "reviewer": _person(sub.reviewer),
            "reviewed_by": _person(sub.reviewed_by),
            "created_at": sub.created_at,
            "reviewed_at": sub.reviewed_at,
            "can_act": can_act,
            "can_withdraw": sub.status == SUBMISSION_PENDING and sub.submitted_by_user_id == user.id,
        }

    def project_summary(self, project: Project, user: User, access: ProjectAccess | None = None, detail: bool = False) -> dict:
        members = self._members(project.id)
        access = access or self.access(project, user, members)
        rows = self._stage_rows(project.id)
        states = self.stage_states(project.id, rows)
        workspace = self.get_workspace(project.id)
        client = self.db.get(Client, project.client_id) if project.client_id else None
        leader = self.db.get(User, project.team_leader_id)
        approvers = {
            u.id: u
            for u in self.db.query(User)
            .filter(User.id.in_([r.approved_by_user_id for r in rows.values() if r.approved_by_user_id]))
            .all()
        } if rows else {}

        closed = self.work_closed_reason(project)
        stages = []
        for stage in WORKFLOW_STAGES:
            key = stage["key"]
            row = rows.get(key)
            state = states[key]
            entry = {
                "key": key,
                "label": stage["label"],
                "requires": stage["requires"],
                "status": state,
                "can_work": key in access.work_stages and closed is None,
                "role_allows": key in access.work_stages,
                "can_review": key in access.review_stages,
                "approved_at": row.approved_at if row and state == STATUS_APPROVED else None,
                "approved_by": _person(approvers.get(row.approved_by_user_id)) if row and state == STATUS_APPROVED else None,
                "locked_reason": self._locked_message(key, states) if state == STATUS_LOCKED else None,
            }
            if detail:
                entry["workers"] = self.workers_for(project.id, key)
                entry["reviewers"] = self.reviewers_for(project.id, key)
            stages.append(entry)

        summary = {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "status": getattr(project.status, "value", project.status),
            "client_name": client.name if client else None,
            "team_leader": _person(leader),
            "is_team_leader": access.is_team_leader,
            "my_work_roles": access.work_roles,
            "my_review_roles": access.review_roles,
            "stages": stages,
            "approved_count": sum(1 for s in stages if s["status"] == STATUS_APPROVED),
            "work_open": closed is None,
            "work_closed_reason": closed,
            "total_stages": len(stages),
            "story_id": workspace.story_id if workspace else None,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
        if detail:
            subs = (
                self.db.query(ProjectStageSubmission)
                .filter(ProjectStageSubmission.project_id == project.id)
                .order_by(ProjectStageSubmission.created_at.desc(), ProjectStageSubmission.id.desc())
                .limit(100)
                .all()
            )
            summary["submissions"] = [self._submission_dict(s, user, project, access) for s in subs]
        return summary

    # ================================================================ reading
    def list_projects(self, user: User) -> list[dict]:
        ids = {
            pid
            for (pid,) in self.db.query(ProjectMember.project_id).filter(ProjectMember.user_id == user.id).all()
        }
        ids.update(pid for (pid,) in self.db.query(Project.id).filter(Project.team_leader_id == user.id).all())
        if not ids:
            return []
        projects = (
            self.db.query(Project).filter(Project.id.in_(ids)).order_by(Project.updated_at.desc()).all()
        )
        out = []
        for project in projects:
            access = self.access(project, user)
            if access.can_view:
                out.append(self.project_summary(project, user, access))
        return out

    def project_detail(self, project_id: int, user: User) -> dict:
        project, access = self.require_view(project_id, user)
        self.ensure_workspace(project)
        return self.project_summary(project, user, access, detail=True)

    def reviews(self, user: User) -> list[dict]:
        """Submissions this user may answer (pending) and the ones they answered or were sent."""
        led = [pid for (pid,) in self.db.query(Project.id).filter(Project.team_leader_id == user.id).all()]
        query = self.db.query(ProjectStageSubmission)
        if led:
            query = query.filter(
                (ProjectStageSubmission.reviewer_user_id == user.id)
                | (
                    ProjectStageSubmission.project_id.in_(led)
                    & (ProjectStageSubmission.status == SUBMISSION_PENDING)
                )
            )
        else:
            query = query.filter(ProjectStageSubmission.reviewer_user_id == user.id)
        subs = query.order_by(ProjectStageSubmission.created_at.desc()).limit(200).all()
        cache: dict[int, tuple[Project, ProjectAccess]] = {}
        out = []
        for sub in subs:
            if sub.project_id not in cache:
                project = self.db.get(Project, sub.project_id)
                cache[sub.project_id] = (project, self.access(project, user))
            project, access = cache[sub.project_id]
            item = self._submission_dict(sub, user, project, access)
            # a Team Leader sees others' pending submissions only when they may answer them
            if sub.reviewer_user_id != user.id and not item["can_act"]:
                continue
            out.append(item)
        return out

    def my_submissions(self, user: User) -> list[dict]:
        subs = (
            self.db.query(ProjectStageSubmission)
            .filter(ProjectStageSubmission.submitted_by_user_id == user.id)
            .order_by(ProjectStageSubmission.created_at.desc())
            .limit(200)
            .all()
        )
        return [self._submission_dict(s, user) for s in subs]

    def notifications(self, user: User, limit: int = 50) -> dict:
        items = (
            self.db.query(EmployeeNotification)
            .filter(EmployeeNotification.user_id == user.id)
            .order_by(EmployeeNotification.created_at.desc(), EmployeeNotification.id.desc())
            .limit(limit)
            .all()
        )
        unread = (
            self.db.query(EmployeeNotification)
            .filter(EmployeeNotification.user_id == user.id, EmployeeNotification.read_at.is_(None))
            .count()
        )
        titles = {}
        for n in items:
            if n.project_id and n.project_id not in titles:
                p = self.db.get(Project, n.project_id)
                titles[n.project_id] = p.title if p else ""
        return {
            "unread": unread,
            "items": [
                {
                    "id": n.id,
                    "project_id": n.project_id,
                    "project_title": titles.get(n.project_id, ""),
                    "stage": n.stage,
                    "kind": n.kind,
                    "message": n.message,
                    "read": n.read_at is not None,
                    "created_at": n.created_at,
                }
                for n in items
            ],
        }

    def mark_read(self, user: User, ids: list[int] | None) -> None:
        query = self.db.query(EmployeeNotification).filter(
            EmployeeNotification.user_id == user.id, EmployeeNotification.read_at.is_(None)
        )
        if ids:
            query = query.filter(EmployeeNotification.id.in_(ids))
        query.update({EmployeeNotification.read_at: _now()}, synchronize_session=False)
        self.db.commit()

    # ================================================================ actions
    def _check_stage(self, stage: str) -> None:
        if stage not in STAGES_BY_KEY:
            raise WorkflowError(f"Unknown stage. Use one of: {', '.join(STAGE_KEYS)}.", 404)

    def submit(self, project_id: int, stage: str, user: User, reviewer_user_id: int, note: str | None, story_id: int | None) -> dict:
        self._check_stage(stage)
        project, access = self.require_view(project_id, user)
        label = _label(stage)
        if stage not in access.work_stages:
            raise WorkflowError(f"Your role on this project does not include the {label}.", 403)
        self._require_work_open(project)
        states = self.stage_states(project.id)
        state = states[stage]
        if state == STATUS_LOCKED:
            raise WorkflowError(self._locked_message(stage, states), 409)
        if state == STATUS_IN_REVIEW:
            raise WorkflowError(f"The {label} is already waiting for review.", 409)
        if state == STATUS_APPROVED:
            raise WorkflowError(f"The {label} is already approved.", 409)

        if reviewer_user_id == user.id:
            raise WorkflowError("Choose another reviewer: nobody reviews their own work.", 422)
        reviewers = {r["user_id"] for r in self.reviewers_for(project.id, stage, exclude_user_id=user.id)}
        if not reviewers:
            raise WorkflowError(f"This project has no reviewer for the {label} yet. Ask your Team Leader to add one.", 409)
        if reviewer_user_id not in reviewers:
            raise WorkflowError(f"Choose a reviewer of the {label} on this project.", 422)

        workspace = self.ensure_workspace(project)
        if stage == "story":
            stories = (
                self.db.query(Story)
                .filter(Story.individual_project_id == workspace.individual_project_id)
                .order_by(Story.id.desc())
                .all()
            )
            if not stories:
                raise WorkflowError("Write or import the story first.", 409)
            if story_id is None:
                story_id = stories[0].id
            elif story_id not in {s.id for s in stories}:
                raise WorkflowError("That story is not part of this project.", 422)
        else:
            story_id = workspace.story_id

        # (no other pending submission can exist for an open stage; cancel any, to be safe)
        self.db.query(ProjectStageSubmission).filter(
            ProjectStageSubmission.project_id == project.id,
            ProjectStageSubmission.stage == stage,
            ProjectStageSubmission.status == SUBMISSION_PENDING,
        ).update({ProjectStageSubmission.status: SUBMISSION_CANCELLED}, synchronize_session=False)

        sub = ProjectStageSubmission(
            project_id=project.id,
            stage=stage,
            story_id=story_id,
            submitted_by_user_id=user.id,
            reviewer_user_id=reviewer_user_id,
            note=(note or "").strip()[:2000] or None,
            status=SUBMISSION_PENDING,
        )
        self.db.add(sub)
        self._set_stage(project.id, stage, STATUS_IN_REVIEW)
        self._notify(
            [reviewer_user_id], project, stage, "submitted",
            f"{_name(user)} sent the {label} of “{project.title}” for your review.",
        )
        self.db.commit()
        self.db.refresh(sub)
        return self._submission_dict(sub, user, project, access)

    def _pending_for_reviewer(self, submission_id: int, user: User) -> tuple[ProjectStageSubmission, Project, ProjectAccess]:
        sub = self.db.get(ProjectStageSubmission, submission_id)
        if sub is None:
            raise WorkflowError("Review not found.", 404)
        project = self.get_project(sub.project_id)
        access = self.access(project, user)
        if not access.can_view:
            raise WorkflowError("Review not found.", 404)
        if sub.status != SUBMISSION_PENDING:
            raise WorkflowError("This review has already been answered.", 409)
        item = self._submission_dict(sub, user, project, access)
        if not item["can_act"]:
            if sub.submitted_by_user_id == user.id:
                raise WorkflowError("You cannot review your own work.", 403)
            raise WorkflowError(f"Only the chosen reviewer, or a Team Leader who reviews the {_label(sub.stage)}, can answer this.", 403)
        return sub, project, access

    def approve(self, submission_id: int, user: User, comment: str | None) -> dict:
        sub, project, access = self._pending_for_reviewer(submission_id, user)
        before = self.stage_states(project.id)
        sub.status = SUBMISSION_APPROVED
        sub.review_comment = (comment or "").strip()[:4000] or None
        sub.reviewed_by_user_id = user.id
        sub.reviewed_at = _now()
        self._set_stage(project.id, sub.stage, STATUS_APPROVED, user)
        if sub.stage == "story" and sub.story_id:
            workspace = self.ensure_workspace(project)
            workspace.story_id = sub.story_id
        self.db.flush()

        label = _label(sub.stage)
        self._notify(
            [sub.submitted_by_user_id], project, sub.stage, "approved",
            f"{_name(user)} approved your {label} for “{project.title}”."
            + (f" “{sub.review_comment}”" if sub.review_comment else ""),
        )
        after = self.stage_states(project.id)
        for key in STAGE_KEYS:
            if before.get(key) == STATUS_LOCKED and after.get(key) == STATUS_OPEN:
                self._notify(
                    [w["user_id"] for w in self.workers_for(project.id, key)], project, key, "stage_opened",
                    f"The {label} of “{project.title}” is approved. You can now work on the {_label(key)}.",
                )
        if all(after.get(k) == STATUS_APPROVED for k in STAGE_KEYS):
            self._notify(
                [project.team_leader_id], project, None, "completed",
                f"Every stage of “{project.title}” is approved.",
            )
        self.db.commit()
        self.db.refresh(sub)
        return self._submission_dict(sub, user, project, access)

    def request_changes(self, submission_id: int, user: User, comment: str) -> dict:
        comment = (comment or "").strip()
        if not comment:
            raise WorkflowError("Say what should change.", 422)
        sub, project, access = self._pending_for_reviewer(submission_id, user)
        sub.status = SUBMISSION_CHANGES_REQUESTED
        sub.review_comment = comment[:4000]
        sub.reviewed_by_user_id = user.id
        sub.reviewed_at = _now()
        self._set_stage(project.id, sub.stage, STATUS_CHANGES_REQUESTED)
        self._notify(
            [sub.submitted_by_user_id], project, sub.stage, "changes_requested",
            f"{_name(user)} asked for changes to the {_label(sub.stage)} of “{project.title}”: “{sub.review_comment}”",
        )
        self.db.commit()
        self.db.refresh(sub)
        return self._submission_dict(sub, user, project, access)

    def withdraw(self, submission_id: int, user: User) -> dict:
        sub = self.db.get(ProjectStageSubmission, submission_id)
        if sub is None or sub.submitted_by_user_id != user.id:
            raise WorkflowError("Submission not found.", 404)
        if sub.status != SUBMISSION_PENDING:
            raise WorkflowError("This submission has already been answered.", 409)
        project = self.get_project(sub.project_id)
        sub.status = SUBMISSION_WITHDRAWN
        sub.reviewed_at = _now()
        self._clear_stage(project.id, sub.stage)
        self._notify(
            [sub.reviewer_user_id], project, sub.stage, "withdrawn",
            f"{_name(user)} took back the {_label(sub.stage)} of “{project.title}” to change it.",
        )
        self.db.commit()
        self.db.refresh(sub)
        return self._submission_dict(sub, user, project)

    def reopen(self, project_id: int, stage: str, user: User, reason: str | None) -> dict:
        self._check_stage(stage)
        project, access = self.require_view(project_id, user)
        if not access.is_team_leader:
            raise WorkflowError("Only the project's Team Leader can reopen a stage.", 403)
        states = self.stage_states(project.id)
        if states[stage] in (STATUS_LOCKED, STATUS_OPEN):
            raise WorkflowError(f"The {_label(stage)} is already open for work.", 409)

        affected = [stage] + downstream_of(stage)
        self.db.query(ProjectStageSubmission).filter(
            ProjectStageSubmission.project_id == project.id,
            ProjectStageSubmission.stage.in_(affected),
            ProjectStageSubmission.status == SUBMISSION_PENDING,
        ).update(
            {ProjectStageSubmission.status: SUBMISSION_CANCELLED, ProjectStageSubmission.reviewed_at: _now()},
            synchronize_session=False,
        )
        for key in affected:
            self._clear_stage(project.id, key)

        why = (reason or "").strip()[:1000]
        label = _label(stage)
        self._notify(
            [w["user_id"] for w in self.workers_for(project.id, stage)], project, stage, "reopened",
            f"{_name(user)} reopened the {label} of “{project.title}”"
            + (f": “{why}”" if why else ".")
            + " You can work on it again.",
            skip=user.id,
        )
        later = [k for k in affected[1:] if states.get(k) != STATUS_LOCKED]
        if later:
            people = set()
            for key in later:
                people.update(w["user_id"] for w in self.workers_for(project.id, key))
            self._notify(
                people, project, stage, "reopened",
                f"The {label} of “{project.title}” was reopened, so the {_join([_label(k) for k in later])} "
                f"{'is' if len(later) == 1 else 'are'} on hold until it is approved again.",
                skip=user.id,
            )
        self.db.commit()
        return self.project_summary(project, user, access, detail=True)

    # ================================================================ AI work (the proxy)
    _STORY_ID = re.compile(r"^stories/(\d+)(?:/(.*))?$")

    @classmethod
    def stage_of_path(cls, subpath: str) -> tuple[str | None, int | None]:
        """
        Which stage a path under /api/individual/projects/{id}/ belongs to, and the story it names.
        ("stories/12/characters/3/profile" -> ("characters", 12))
        """
        path = subpath.strip("/")
        if path in ("stories/generate", "stories/upload") or path.startswith("stories/previews/"):
            return "story", None
        match = cls._STORY_ID.match(path)
        if not match:
            return None, None
        story_id = int(match.group(1))
        rest = match.group(2) or ""
        head = rest.split("/", 1)[0]
        if head in ("", "versions", "edit-history", "ai-edit"):
            return "story", story_id
        if head == "storyboard":
            return "storyboard", story_id
        if head == "characters":
            return "characters", story_id
        if head == "locations":
            return "locations", story_id
        if head == "scenes":
            return "sketches", story_id
        if head.startswith("video-"):
            return "animation", story_id
        return None, story_id

    def check_work(self, project: Project, user: User, access: ProjectAccess, method: str, subpath: str) -> None:
        """Raise WorkflowError when this user may not make this request to the project's AI work."""
        if not access.can_view:
            raise WorkflowError("Project not found.", 404)
        if method in ("GET", "HEAD", "OPTIONS"):
            return
        stage, story_id = self.stage_of_path(subpath)
        if not subpath.strip("/"):
            raise WorkflowError("The project's details are managed by the organization.", 403)
        if stage is None:
            raise WorkflowError("This action is not available on organization projects.", 403)
        label = _label(stage)
        if stage not in access.work_stages:
            raise WorkflowError(f"Your role on this project does not include the {label}. You can look at it, but not change it.", 403)
        self._require_work_open(project)
        states = self.stage_states(project.id)
        state = states[stage]
        if state == STATUS_LOCKED:
            raise WorkflowError(self._locked_message(stage, states), 423)
        if state == STATUS_IN_REVIEW:
            raise WorkflowError(f"The {label} is waiting for review. You can change it again if the reviewer asks for changes, or take it back from review.", 423)
        if state == STATUS_APPROVED:
            raise WorkflowError(f"The {label} is approved and locked. Ask your Team Leader to reopen it if it needs changes.", 423)
        if stage != "story":
            workspace = self.get_workspace(project.id)
            if workspace and workspace.story_id and story_id is not None and story_id != workspace.story_id:
                raise WorkflowError("Work on the project's approved story.", 409)

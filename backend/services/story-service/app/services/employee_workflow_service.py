"""
The employee workflow of organization projects: who may do what, stage by stage.

A project can have several stories (written by the same or different people). Every story
goes through the stages on its own:

    Story ──approve──► Storyboard ──approve──► Characters ┐
                                                Locations  ┘
                      both approved ──► Sketches ──approve──► Animation

Rules
    - A story's stage opens when the stages it needs are approved for THAT story
      (constants/workflow_stages.py). A new story can be written at any time.
    - An employee works on a stage when one of their roles on the project (project_members,
      is_reviewer = False) has a job role feature that belongs to that stage. The Team
      Leader works in their own job roles, and reviews in their reviewer roles.
    - They send it to a reviewer of the same stage (project_members, is_reviewer = True,
      with a job role feature of that stage). Nobody reviews their own work.
    - The chosen reviewer approves or asks for changes. The project's Team Leader may also do
      it, but only when the Team Leader is a reviewer of that stage on the project.
    - An approved stage is locked. Only the project's Team Leader can reopen it; the stages
      after it (of the same story) are locked again until it is approved again.
    - Approving a stage tells the people who work on the stages it opens.
    - Nobody works on a project before its Team Leader starts it.
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
from app.services.stage_content import EMPTY_MESSAGES, stage_content


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
    return {"user_id": user.id, "email": user.email, "name": _name(user)}


def _name(user: User | None) -> str:
    """
    How a person is shown to the people they work with (reviews, messages, the team): the first part of their
    email, "aarush4520" for aarush4520@gmail.com. The name chosen in Settings is shown only on their own dashboard.
    """
    if user is None:
        return "Someone"
    return user.email.split("@")[0]


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

    # ================================================================ stages (per story)
    def _stage_rows(self, project_id: int) -> dict[tuple[int | None, str], ProjectWorkflowStage]:
        """{(story_id, stage): row} of the whole project."""
        return {
            (row.story_id, row.stage): row
            for row in self.db.query(ProjectWorkflowStage)
            .filter(ProjectWorkflowStage.project_id == project_id)
            .all()
        }

    @staticmethod
    def story_states(story_id: int | None, rows: dict) -> dict[str, str]:
        """Where each stage of one story stands: locked | open | in_review | changes_requested | approved."""
        states: dict[str, str] = {}
        for stage in WORKFLOW_STAGES:
            ready = all(states.get(req) == STATUS_APPROVED for req in stage["requires"])
            row = rows.get((story_id, stage["key"])) if story_id is not None else None
            if not ready:
                states[stage["key"]] = STATUS_LOCKED
            elif row is None:
                states[stage["key"]] = STATUS_OPEN
            else:
                states[stage["key"]] = row.status
        return states

    def states_of(self, project_id: int, story_id: int | None) -> dict[str, str]:
        return self.story_states(story_id, self._stage_rows(project_id))

    def _stories(self, project: Project) -> list[Story]:
        """The project's stories, oldest first."""
        workspace = self.get_workspace(project.id)
        if workspace is None:
            return []
        return (
            self.db.query(Story)
            .filter(Story.individual_project_id == workspace.individual_project_id)
            .order_by(Story.id.asc())
            .all()
        )

    def _story_of(self, project: Project, story_id: int | None) -> Story:
        """One of the project's stories (WorkflowError when it is not one)."""
        if story_id is None:
            raise WorkflowError("Choose which story this is for.", 422)
        workspace = self.get_workspace(project.id)
        story = self.db.get(Story, story_id)
        if story is None or workspace is None or story.individual_project_id != workspace.individual_project_id:
            raise WorkflowError("That story is not part of this project.", 404)
        return story

    def _set_stage(self, project_id: int, story_id: int, stage: str, status: str, user: User | None = None) -> None:
        row = (
            self.db.query(ProjectWorkflowStage)
            .filter(
                ProjectWorkflowStage.project_id == project_id,
                ProjectWorkflowStage.story_id == story_id,
                ProjectWorkflowStage.stage == stage,
            )
            .first()
        )
        if row is None:
            row = ProjectWorkflowStage(project_id=project_id, story_id=story_id, stage=stage, status=status)
            self.db.add(row)
        row.status = status
        if status == STATUS_APPROVED:
            row.approved_by_user_id = user.id if user else None
            row.approved_at = _now()
        else:
            row.approved_by_user_id = None
            row.approved_at = None

    def _clear_stage(self, project_id: int, story_id: int, stage: str) -> None:
        self.db.query(ProjectWorkflowStage).filter(
            ProjectWorkflowStage.project_id == project_id,
            ProjectWorkflowStage.story_id == story_id,
            ProjectWorkflowStage.stage == stage,
        ).delete(synchronize_session=False)

    def _locked_message(self, stage: str, states: dict[str, str]) -> str:
        waiting = [_label(req) for req in STAGES_BY_KEY[stage]["requires"] if states.get(req) != STATUS_APPROVED]
        verb = "is" if len(waiting) == 1 else "are"
        if waiting == ["Story"]:
            return "Opens once the story is approved."
        return f"Opens once its {_join(waiting)} {verb} approved."

    @staticmethod
    def _project_status(per_story: list[dict[str, str]]) -> dict[str, str]:
        """One status per stage for the whole project (the strip on project cards)."""
        out: dict[str, str] = {}
        for stage in STAGE_KEYS:
            seen = [states[stage] for states in per_story]
            if not seen:
                out[stage] = STATUS_OPEN if stage == "story" else STATUS_LOCKED
            elif STATUS_IN_REVIEW in seen:
                out[stage] = STATUS_IN_REVIEW
            elif STATUS_CHANGES_REQUESTED in seen:
                out[stage] = STATUS_CHANGES_REQUESTED
            elif STATUS_OPEN in seen:
                out[stage] = STATUS_OPEN
            elif all(x == STATUS_APPROVED for x in seen):
                out[stage] = STATUS_APPROVED
            else:
                out[stage] = STATUS_LOCKED
        return out

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
            "story_title": (sub.story.title if getattr(sub, "story", None) is not None else None),
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
        client = self.db.get(Client, project.client_id) if project.client_id else None
        leader = self.db.get(User, project.team_leader_id)
        approvers = {
            u.id: u
            for u in self.db.query(User)
            .filter(User.id.in_([r.approved_by_user_id for r in rows.values() if r.approved_by_user_id]))
            .all()
        } if rows else {}
        closed = self.work_closed_reason(project)

        # every story, with its own six stages
        story_list = self._stories(project)
        writers: dict[int, User] = {}
        if story_list:
            for sub in (
                self.db.query(ProjectStageSubmission)
                .filter(
                    ProjectStageSubmission.project_id == project.id,
                    ProjectStageSubmission.stage == "story",
                    ProjectStageSubmission.story_id.in_([st.id for st in story_list]),
                )
                .order_by(ProjectStageSubmission.id.asc())
                .all()
            ):
                writers[sub.story_id] = sub.submitted_by
        per_story = []
        stories = []
        for story in story_list:
            states = self.story_states(story.id, rows)
            per_story.append(states)
            story_stages = []
            for stage in WORKFLOW_STAGES:
                key = stage["key"]
                row = rows.get((story.id, key))
                state = states[key]
                story_stages.append(
                    {
                        "key": key,
                        "label": stage["label"],
                        "status": state,
                        "can_work": key in access.work_stages and closed is None and state in (STATUS_OPEN, STATUS_CHANGES_REQUESTED),
                        "approved_at": row.approved_at if row and state == STATUS_APPROVED else None,
                        "approved_by": _person(approvers.get(row.approved_by_user_id)) if row and state == STATUS_APPROVED else None,
                        "locked_reason": self._locked_message(key, states) if state == STATUS_LOCKED else None,
                    }
                )
            stories.append(
                {
                    "id": story.id,
                    "title": story.title,
                    "created_at": story.created_at,
                    "sent_by": _person(writers.get(story.id)),
                    "approved_count": sum(1 for x in story_stages if x["status"] == STATUS_APPROVED),
                    "stages": story_stages,
                }
            )

        # the project as a whole: what this person does on each stage, and a summary status
        overall = self._project_status(per_story)
        stages = []
        for stage in WORKFLOW_STAGES:
            key = stage["key"]
            entry = {
                "key": key,
                "label": stage["label"],
                "requires": stage["requires"],
                "status": overall[key],
                "can_work": key in access.work_stages and closed is None,
                "role_allows": key in access.work_stages,
                "can_review": key in access.review_stages,
                "approved_at": None,
                "approved_by": None,
                "locked_reason": (
                    (
                        "Opens for each story once the story is approved."
                        if stage["requires"] == ["story"]
                        else f"Opens for each story once its {_join([_label(r) for r in stage['requires']])} "
                        f"{'is' if len(stage['requires']) == 1 else 'are'} approved."
                    )
                    if overall[key] == STATUS_LOCKED and stage["requires"] else None
                ),
                "counts": {
                    status: sum(1 for st in per_story if st[key] == status)
                    for status in (STATUS_OPEN, STATUS_IN_REVIEW, STATUS_CHANGES_REQUESTED, STATUS_APPROVED, STATUS_LOCKED)
                },
            }
            if detail:
                entry["workers"] = self.workers_for(project.id, key)
                entry["reviewers"] = self.reviewers_for(project.id, key)
            stages.append(entry)

        done = sum(1 for st in per_story if all(st[k] == STATUS_APPROVED for k in STAGE_KEYS))
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
            "stories": stories,
            "story_count": len(stories),
            "finished_story_count": done,
            "approved_count": sum(1 for s in stages if s["status"] == STATUS_APPROVED),
            "work_open": closed is None,
            "work_closed_reason": closed,
            "total_stages": len(stages),
            "story_id": stories[0]["id"] if stories else None,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
        if detail:
            subs = (
                self.db.query(ProjectStageSubmission)
                .filter(ProjectStageSubmission.project_id == project.id)
                .order_by(ProjectStageSubmission.created_at.desc(), ProjectStageSubmission.id.desc())
                .limit(200)
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
        # only the newest submission of each story's stage: an older one was replaced by a newer version
        newest = self._newest_submission_ids({sub.project_id for sub in subs})
        subs = [sub for sub in subs if sub.id in newest]
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

    def _newest_submission_ids(self, project_ids: set[int]) -> set[int]:
        """The newest submission of every (project, story, stage)."""
        if not project_ids:
            return set()
        from sqlalchemy import func

        return {
            sid
            for (sid,) in self.db.query(func.max(ProjectStageSubmission.id))
            .filter(ProjectStageSubmission.project_id.in_(project_ids))
            .group_by(
                ProjectStageSubmission.project_id,
                ProjectStageSubmission.story_id,
                ProjectStageSubmission.stage,
            )
            .all()
        }

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

    def _content_problem(self, project_id: int, story: Story, stage: str) -> tuple[str | None, str]:
        """
        Why this stage of this story cannot be sent for review because of its work (None when it can), and the
        fingerprint of that work: it must have some work in it, and after a reviewer asked for changes it must
        have changed since.
        """
        has_content, fingerprint = stage_content(self.db, story, stage)
        if not has_content:
            return EMPTY_MESSAGES.get(stage, "There is nothing to send yet."), fingerprint
        last = (
            self.db.query(ProjectStageSubmission)
            .filter(
                ProjectStageSubmission.project_id == project_id,
                ProjectStageSubmission.story_id == story.id,
                ProjectStageSubmission.stage == stage,
                ProjectStageSubmission.status.notin_([SUBMISSION_WITHDRAWN, SUBMISSION_CANCELLED]),
            )
            .order_by(ProjectStageSubmission.id.desc())
            .first()
        )
        if (
            last is not None
            and last.status == SUBMISSION_CHANGES_REQUESTED
            and last.content_fingerprint
            and last.content_fingerprint == fingerprint
        ):
            who = _name(last.reviewed_by) if last.reviewed_by is not None else "the reviewer"
            return f"Nothing has changed since {who} asked for changes. Make the changes first, then send it again.", fingerprint
        return None, fingerprint

    def _submittable(self, project: Project, access: ProjectAccess, stage: str, user: User, story_id: int | None) -> tuple[Story, str]:
        """The story whose stage this person can send for review now, and its work's fingerprint (or WorkflowError)."""
        label = _label(stage)
        if stage not in access.work_stages:
            raise WorkflowError(f"Your role on this project does not include the {label}.", 403)
        self._require_work_open(project)
        self.ensure_workspace(project)
        if story_id is None:
            stories = self._stories(project)
            if not stories:
                raise WorkflowError("Write or import the story first.", 409)
            if len(stories) > 1:
                raise WorkflowError("Choose which story this is for.", 422)
            story_id = stories[0].id
        story = self._story_of(project, story_id)
        states = self.states_of(project.id, story.id)
        state = states[stage]
        if state == STATUS_LOCKED:
            raise WorkflowError(self._locked_message(stage, states), 409)
        if state == STATUS_IN_REVIEW:
            raise WorkflowError(f"The {label} of “{story.title}” is already waiting for review.", 409)
        if state == STATUS_APPROVED:
            raise WorkflowError(f"The {label} of “{story.title}” is already approved.", 409)
        problem, fingerprint = self._content_problem(project.id, story, stage)
        if problem:
            raise WorkflowError(problem, 409)
        return story, fingerprint

    def submit_check(self, project_id: int, stage: str, user: User, story_id: int | None) -> dict:
        """Can this person send this stage of this story for review now? (The Submit window asks before it opens.)"""
        self._check_stage(stage)
        project, access = self.require_view(project_id, user)
        try:
            self._submittable(project, access, stage, user, story_id)
        except WorkflowError as exc:
            return {"can_submit": False, "reason": exc.message}
        return {"can_submit": True, "reason": None}

    def submit(self, project_id: int, stage: str, user: User, reviewer_user_id: int, note: str | None, story_id: int | None) -> dict:
        self._check_stage(stage)
        project, access = self.require_view(project_id, user)
        label = _label(stage)
        story, fingerprint = self._submittable(project, access, stage, user, story_id)

        if reviewer_user_id == user.id:
            raise WorkflowError("Choose another reviewer: nobody reviews their own work.", 422)
        reviewers = {r["user_id"] for r in self.reviewers_for(project.id, stage, exclude_user_id=user.id)}
        if not reviewers:
            raise WorkflowError(f"This project has no reviewer for the {label} yet. Ask your Team Leader to add one.", 409)
        if reviewer_user_id not in reviewers:
            raise WorkflowError(f"Choose a reviewer of the {label} on this project.", 422)

        # (no other pending submission can exist for an open stage of this story; cancel any, to be safe)
        self.db.query(ProjectStageSubmission).filter(
            ProjectStageSubmission.project_id == project.id,
            ProjectStageSubmission.story_id == story.id,
            ProjectStageSubmission.stage == stage,
            ProjectStageSubmission.status == SUBMISSION_PENDING,
        ).update({ProjectStageSubmission.status: SUBMISSION_CANCELLED}, synchronize_session=False)

        sub = ProjectStageSubmission(
            project_id=project.id,
            stage=stage,
            story_id=story.id,
            submitted_by_user_id=user.id,
            reviewer_user_id=reviewer_user_id,
            note=(note or "").strip()[:2000] or None,
            content_fingerprint=fingerprint,
            status=SUBMISSION_PENDING,
        )
        self.db.add(sub)
        self._set_stage(project.id, story.id, stage, STATUS_IN_REVIEW)
        self._notify(
            [reviewer_user_id], project, stage, "submitted",
            f"{_name(user)} sent the {label} of “{story.title}” ({project.title}) for your review.",
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
        story = self.db.get(Story, sub.story_id) if sub.story_id else None
        if story is None:
            raise WorkflowError("The story of this review no longer exists.", 409)
        before = self.states_of(project.id, story.id)
        sub.status = SUBMISSION_APPROVED
        sub.review_comment = (comment or "").strip()[:4000] or None
        sub.reviewed_by_user_id = user.id
        sub.reviewed_at = _now()
        self._set_stage(project.id, story.id, sub.stage, STATUS_APPROVED, user)
        if sub.stage == "story":
            workspace = self.ensure_workspace(project)
            if workspace.story_id is None:
                workspace.story_id = story.id  # (the first approved story; kept for older screens)
        self.db.flush()

        label = _label(sub.stage)
        self._notify(
            [sub.submitted_by_user_id], project, sub.stage, "approved",
            f"{_name(user)} approved your {label} of “{story.title}” ({project.title})."
            + (f" “{sub.review_comment}”" if sub.review_comment else ""),
        )
        after = self.states_of(project.id, story.id)
        for key in STAGE_KEYS:
            if before.get(key) == STATUS_LOCKED and after.get(key) == STATUS_OPEN:
                self._notify(
                    [w["user_id"] for w in self.workers_for(project.id, key)], project, key, "stage_opened",
                    f"The {label} of “{story.title}” ({project.title}) is approved. You can now work on its {_label(key)}.",
                )
        if all(after.get(k) == STATUS_APPROVED for k in STAGE_KEYS):
            self._notify(
                [project.team_leader_id], project, None, "completed",
                f"Every stage of “{story.title}” ({project.title}) is approved.",
            )
        self.db.commit()
        self.db.refresh(sub)
        return self._submission_dict(sub, user, project, access)

    def request_changes(self, submission_id: int, user: User, comment: str) -> dict:
        comment = (comment or "").strip()
        if not comment:
            raise WorkflowError("Say what should change.", 422)
        sub, project, access = self._pending_for_reviewer(submission_id, user)
        if sub.story_id is None:
            raise WorkflowError("The story of this review no longer exists.", 409)
        sub.status = SUBMISSION_CHANGES_REQUESTED
        sub.review_comment = comment[:4000]
        sub.reviewed_by_user_id = user.id
        sub.reviewed_at = _now()
        self._set_stage(project.id, sub.story_id, sub.stage, STATUS_CHANGES_REQUESTED)
        title = sub.story.title if sub.story else "the story"
        self._notify(
            [sub.submitted_by_user_id], project, sub.stage, "changes_requested",
            f"{_name(user)} asked for changes to the {_label(sub.stage)} of “{title}” ({project.title}): “{sub.review_comment}”",
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
        if sub.story_id is not None:
            self._clear_stage(project.id, sub.story_id, sub.stage)
        title = sub.story.title if sub.story else "the story"
        self._notify(
            [sub.reviewer_user_id], project, sub.stage, "withdrawn",
            f"{_name(user)} took back the {_label(sub.stage)} of “{title}” ({project.title}) to change it.",
        )
        self.db.commit()
        self.db.refresh(sub)
        return self._submission_dict(sub, user, project)

    def reopen(self, project_id: int, stage: str, user: User, reason: str | None, story_id: int | None = None) -> dict:
        self._check_stage(stage)
        project, access = self.require_view(project_id, user)
        if not access.is_team_leader:
            raise WorkflowError("Only the project's Team Leader can reopen a stage.", 403)
        if story_id is None:
            stories = self._stories(project)
            if len(stories) != 1:
                raise WorkflowError("Choose which story to reopen.", 422)
            story_id = stories[0].id
        story = self._story_of(project, story_id)
        states = self.states_of(project.id, story.id)
        if states[stage] in (STATUS_LOCKED, STATUS_OPEN):
            raise WorkflowError(f"The {_label(stage)} of “{story.title}” is already open for work.", 409)

        affected = [stage] + downstream_of(stage)
        self.db.query(ProjectStageSubmission).filter(
            ProjectStageSubmission.project_id == project.id,
            ProjectStageSubmission.story_id == story.id,
            ProjectStageSubmission.stage.in_(affected),
            ProjectStageSubmission.status == SUBMISSION_PENDING,
        ).update(
            {ProjectStageSubmission.status: SUBMISSION_CANCELLED, ProjectStageSubmission.reviewed_at: _now()},
            synchronize_session=False,
        )
        for key in affected:
            self._clear_stage(project.id, story.id, key)

        why = (reason or "").strip()[:1000]
        label = _label(stage)
        self._notify(
            [w["user_id"] for w in self.workers_for(project.id, stage)], project, stage, "reopened",
            f"{_name(user)} reopened the {label} of “{story.title}” ({project.title})"
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
                f"The {label} of “{story.title}” ({project.title}) was reopened, so its {_join([_label(k) for k in later])} "
                f"{'is' if len(later) == 1 else 'are'} on hold until it is approved again.",
                skip=user.id,
            )
        self.db.commit()
        return self.project_summary(project, user, access, detail=True)

    # ================================================================ deleting a story
    def delete_story(self, project_id: int, user: User, story_id: int) -> None:
        """
        The project's Team Leader deletes one of its stories, with everything made from it (its storyboard,
        characters, locations, sketches, clips and film) and its reviews. Nobody else can.
        """
        project, access = self.require_view(project_id, user)
        if not access.is_team_leader:
            raise WorkflowError("Only the project's Team Leader can delete a story.", 403)
        story = self._story_of(project, story_id)
        from app.models.video_generation_job import VideoGenerationJob

        running = (
            self.db.query(VideoGenerationJob)
            .filter(VideoGenerationJob.story_id == story.id, VideoGenerationJob.status.in_(["queued", "planning", "generating"]))
            .first()
        )
        if running is not None:
            raise WorkflowError(f"Clips are being made for “{story.title}”. Wait until they are ready, then delete the story.", 409)
        title = story.title
        subs = self.db.query(ProjectStageSubmission).filter(
            ProjectStageSubmission.project_id == project.id, ProjectStageSubmission.story_id == story.id
        )
        involved = {x.submitted_by_user_id for x in subs} | {x.reviewer_user_id for x in subs}
        subs.delete(synchronize_session=False)
        self.db.query(ProjectWorkflowStage).filter(
            ProjectWorkflowStage.project_id == project.id, ProjectWorkflowStage.story_id == story.id
        ).delete(synchronize_session=False)
        self.db.query(Story).filter(Story.id == story.id).delete(synchronize_session=False)
        self._notify(
            involved | {m.user_id for m in self._members(project.id)}, project, "story", "story_deleted",
            f"{_name(user)} deleted the story “{title}” ({project.title}) and everything made from it.",
            skip=user.id,
        )
        self.db.commit()

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
        if method == "DELETE" and re.fullmatch(r"stories/\d+", subpath.strip("/")):
            raise WorkflowError("Only the project's Team Leader can delete a story.", 403)
        label = _label(stage)
        if stage not in access.work_stages:
            raise WorkflowError(f"Your role on this project does not include the {label}. You can look at it, but not change it.", 403)
        self._require_work_open(project)
        if story_id is None and subpath.strip("/").startswith("stories/previews/"):
            story_id = self._preview_story_id(subpath)
        if story_id is None:
            return  # a new story: anyone whose role includes the Story may write one
        story = self._story_of(project, story_id)
        states = self.states_of(project.id, story.id)
        state = states[stage]
        if state == STATUS_LOCKED:
            raise WorkflowError(self._locked_message(stage, states), 423)
        if state == STATUS_IN_REVIEW:
            raise WorkflowError(f"The {label} of “{story.title}” is waiting for review. You can change it again if the reviewer asks for changes, or take it back from review.", 423)
        if state == STATUS_APPROVED:
            raise WorkflowError(f"The {label} of “{story.title}” is approved and locked. Ask your Team Leader to reopen it if it needs changes.", 423)

    def _preview_story_id(self, subpath: str) -> int | None:
        """The story an AI-edit preview belongs to (stories/previews/{id}/...)."""
        match = re.match(r"^stories/previews/(\d+)", subpath.strip("/"))
        if not match:
            return None
        from app.models.story_edit_preview import StoryEditPreview

        preview = self.db.get(StoryEditPreview, int(match.group(1)))
        return preview.story_id if preview else None

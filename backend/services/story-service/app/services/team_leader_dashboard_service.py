from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.employee_workflow import OrganizationProjectWorkspace
from app.models.membership import OrganizationRole
from app.models.project import ProjectStatus
from app.models.scene_sketch import SceneSketch
from app.models.scenes import Scene
from app.models.story import Story
from app.models.story_board import StoryBoard

from app.repositories.auth_repository import AuthRepository
from app.repositories.team_leader_dashboard_repository import (
    TeamLeaderDashboardRepository,
)


class TeamLeaderDashboardService:
    """
    Business logic for Team Leader Dashboard.

    Team Leader APIs use team_leader_id only.

    organization_id is resolved internally from the Team Leader's
    Employee record.

    Authorization and business rules belong here.
    Database queries belong in the repository.
    """

    def __init__(self, db: Session):
        self.db = db

        self.auth_repository = AuthRepository(db)
        self.repository = TeamLeaderDashboardRepository(db)

    # ========================================================
    # Authorization
    # ========================================================

    def _require_team_leader(
        self,
        *,
        team_leader_id: int,
    ):
        """
        Validate that the supplied user is an active Team Leader.
        """

        employee = self.repository.get_team_leader(
            team_leader_id=team_leader_id,
        )

        if employee is None:
            raise PermissionError(
                "You are not assigned as a team leader."
            )

        membership = (
            self.auth_repository.get_active_membership(
                user_id=team_leader_id,
                organization_id=employee.organization_id,
            )
        )

        if membership is None:
            raise PermissionError(
                "You are not an active member of this organization."
            )

        if membership.role != OrganizationRole.EMPLOYEE:
            raise PermissionError(
                "Team leader privileges required."
            )

        return employee

    # ========================================================
    # Project Authorization
    # ========================================================

    def _get_owned_project(
        self,
        *,
        team_leader_id: int,
        project_id: int,
    ):
        """
        Return a project owned by the Team Leader.
        """

        self._require_team_leader(
            team_leader_id=team_leader_id,
        )

        project = self.repository.get_project(
            project_id=project_id,
            team_leader_id=team_leader_id,
        )

        if project is None:
            raise ValueError(
                "Project not found or it is not assigned to you."
            )

        return project

    # ========================================================
    # Member Response
    # ========================================================

    def _build_member_response(
        self,
        *,
        member,
        team_leader_id: int,
    ):
        """
        Convert ProjectMember ORM object into the response
        expected by the Team Leader API.

        Reviewer status is determined by the project-level
        ProjectMember.is_reviewer flag.
        """

        employee = self.repository.get_employee(
            team_leader_id=team_leader_id,
            user_id=member.user_id,
        )

        email = ""

        if member.user is not None:
            email = member.user.email or ""

        # Reviewer status belongs to this specific project assignment.
        #
        # Normal employee:
        #   is_reviewer = False
        #
        # Reviewer:
        #   is_reviewer = True
        is_reviewer = bool(member.is_reviewer)

        is_team_leader = False

        if employee is not None:
            is_team_leader = bool(
                employee.is_team_leader
            )
        employee_job_roles = []

        if employee is not None:
            employee_job_roles = [
                assignment.job_role
                for assignment in employee.job_roles
                if assignment.job_role is not None
            ]
        return {
            "id": member.id,
            "user_id": member.user_id,
            "email": email,
            "job_role": member.job_role,
            "assigned_at": member.assigned_at,
            "is_reviewer": is_reviewer,
            "is_team_leader": is_team_leader,
            "employee_job_roles": employee_job_roles,
        }

    # ========================================================
    # Project Response
    # ========================================================

    def _cover_sketches(self, projects) -> dict:
        """
        One sketch per project, to show on its card instead of the drawn
        cover: the newest scene sketch made in the project's AI work.
        Projects without a sketch are left out.
        """

        ids = [project.id for project in projects]
        if not ids:
            return {}
        rows = (
            self.db.query(
                OrganizationProjectWorkspace.project_id,
                Story.id,
                Scene.id,
                SceneSketch.id,
            )
            .join(Story, Story.individual_project_id == OrganizationProjectWorkspace.individual_project_id)
            .join(StoryBoard, StoryBoard.story_id == Story.id)
            .join(Scene, Scene.story_board_id == StoryBoard.id)
            .join(SceneSketch, SceneSketch.scene_id == Scene.id)
            .filter(
                OrganizationProjectWorkspace.project_id.in_(ids),
                SceneSketch.status == "generated",
                SceneSketch.storage_key.isnot(None),
            )
            .order_by(SceneSketch.id.desc())
            .all()
        )
        covers: dict = {}
        for project_id, story_id, scene_id, sketch_id in rows:
            covers.setdefault(
                project_id,
                {"story_id": story_id, "scene_id": scene_id, "sketch_id": sketch_id},
            )
        return covers

    def _build_project_response(
        self,
        *,
        project,
        cover_sketch=None,
    ):
        """
        Convert Project ORM object into the response shape
        expected by Team Leader project APIs.
        """

        team_leader_id = project.team_leader_id

        return {
            "cover_sketch": cover_sketch,
            "id": project.id,
            "organization_id": project.organization_id,
            "client_id": project.client_id,
            "client_name": project.client.name if project.client else None,
            "title": project.title,
            "description": project.description,
            "status": project.status,
            "team_leader_id": project.team_leader_id,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
            "completed_at": project.completed_at,
            "start_date": project.start_date,
            "deadline": project.deadline,
            "members": [
                self._build_member_response(
                    member=member,
                    team_leader_id=team_leader_id,
                )
                for member in project.members
            ],
        }

    # ========================================================
    # Dashboard
    # ========================================================

    def get_dashboard(
        self,
        *,
        team_leader_id: int,
    ):
        """
        Get the Team Leader dashboard.
        """

        self._require_team_leader(
            team_leader_id=team_leader_id,
        )

        projects = self.repository.get_projects(
            team_leader_id=team_leader_id,
        )

        total_members = sum(
            len(project.members)
            for project in projects
        )

        covers = self._cover_sketches(projects)

        return {
            "statistics": {
                "total_projects": len(projects),

                "pending_projects": sum(
                    project.status == ProjectStatus.PENDING
                    for project in projects
                ),

                "ongoing_projects": sum(
                    project.status == ProjectStatus.STARTED
                    for project in projects
                ),

                "completed_projects": sum(
                    project.status == ProjectStatus.COMPLETED
                    for project in projects
                ),

                "aborted_projects": sum(
                    project.status == ProjectStatus.ABORTED
                    for project in projects
                ),

                "total_members": total_members,
            },

            "projects": [
                self._build_project_response(
                    project=project,
                    cover_sketch=covers.get(project.id),
                )
                for project in projects
            ],
        }

    # ========================================================
    # Projects
    # ========================================================

    def get_projects(
        self,
        *,
        team_leader_id: int,
        search: str | None = None,
        status: ProjectStatus | None = None,
    ):
        """
        Get projects assigned to the Team Leader.
        """

        self._require_team_leader(
            team_leader_id=team_leader_id,
        )

        projects = self.repository.get_projects(
            team_leader_id=team_leader_id,
            search=search,
            status=status,
        )

        return [
            self._build_project_response(
                project=project,
            )
            for project in projects
        ]

    # ========================================================
    # Project Details
    # ========================================================

    def get_project(
        self,
        *,
        team_leader_id: int,
        project_id: int,
    ):
        """
        Get one project owned by the Team Leader.
        """

        project = self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        return self._build_project_response(
            project=project,
        )

    # ========================================================
    # Project Members
    # ========================================================

    def get_project_members(
        self,
        *,
        team_leader_id: int,
        project_id: int,
    ):
        """
        Get all members assigned to a Team Leader's project.
        """

        self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        members = self.repository.get_project_members(
            project_id=project_id,
        )

        return [
            self._build_member_response(
                member=member,
                team_leader_id=team_leader_id,
            )
            for member in members
        ]

    # ========================================================
    # Available Employee Response
    # ========================================================

    def _build_available_employee_response(
        self,
        *,
        employee,
        team_leader_id: int,
        on_project_user_ids: set[int] | None = None,
    ):
        """
        Convert an Employee ORM object into the response shape
        expected by TeamLeaderEmployeeResponse.
        """
        is_on_project = employee.user_id in (on_project_user_ids or set())
        current_project_count = (
            self.repository.count_active_projects(
                team_leader_id=team_leader_id,
                user_id=employee.user_id,
            )
        )

        if employee.max_concurrent_projects is None:
            available_project_capacity = None
            is_available = True

        else:
            available_project_capacity = max(
                employee.max_concurrent_projects
                - current_project_count,
                0,
            )

            is_available = (
                available_project_capacity > 0
            )

        return {
            "user_id": employee.user_id,

            "email": (
                employee.user.email
                if employee.user is not None
                else ""
            ),

            "job_roles": [
                assignment.job_role
                for assignment in employee.job_roles
                if assignment.job_role is not None
            ],

            "reviewer_job_roles": [
                assignment.job_role
                for assignment in employee.reviewer_job_roles
                if assignment.job_role is not None
            ],

            "max_concurrent_projects": (
                employee.max_concurrent_projects
            ),

            "current_project_count": (
                current_project_count
            ),

            "available_project_capacity": (
                available_project_capacity
            ),

            "is_reviewer": bool(
                employee.is_reviewer
            ),

            "is_team_leader": bool(
                employee.is_team_leader
            ),

            "is_available": is_available,
            "is_on_project": is_on_project,
        }

    # ========================================================
    # Available Employees
    # ========================================================

    def get_available_employees(
        self,
        *,
        team_leader_id: int,
        search: str | None = None,
        job_role_id: int | None = None,
        project_id: int | None = None,
        
    ):
        """
        Get available employees in the Team Leader's
        organization.
        """

        self._require_team_leader(
            team_leader_id=team_leader_id,
        )
        
        on_project = self._on_project_user_ids(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        employees = (
            self.repository.get_available_people(
                team_leader_id=team_leader_id,
                exclude_user_id=team_leader_id,
                search=search,
                job_role_id=job_role_id,
                reviewer_only=False,
                project_id=project_id,
            )
        )

        return [
            self._build_available_employee_response(
                employee=employee,
                team_leader_id=team_leader_id,
                on_project_user_ids=on_project,
            )
            for employee in employees
        ]
    
    def _on_project_user_ids(
        self,
        *,
        team_leader_id: int,
        project_id: int | None,
    ) -> set[int]:
        """Everyone on one of the Team Leader's projects (any role)."""

        if project_id is None:
            return set()

        project = self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        return {member.user_id for member in project.members}
    
    # ========================================================
    # Available Reviewers
    # ========================================================

    def get_available_reviewers(
        self,
        *,
        team_leader_id: int,
        search: str | None = None,
        project_id: int | None = None,
    ):
        """
        Get available reviewers in the Team Leader's
        organization.
        """

        self._require_team_leader(
            team_leader_id=team_leader_id,
        )
        
        on_project = self._on_project_user_ids(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )
        
        reviewers = (
            self.repository.get_available_people(
                team_leader_id=team_leader_id,
                exclude_user_id=team_leader_id,
                search=search,
                job_role_id=None,
                reviewer_only=True,
                project_id=project_id,
            )
        )

        return [
            self._build_available_employee_response(
                employee=reviewer,
                team_leader_id=team_leader_id,
                on_project_user_ids=on_project,
            )
            for reviewer in reviewers
        ]

    # ========================================================
    # Assign Employee
    # ========================================================

    def assign_employee(
        self,
        *,
        team_leader_id: int,
        project_id: int,
        employee_user_id: int,
        job_role_id: int,
    ):
        """
        Assign an employee to a Team Leader's project.
        """

        project = self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        if project.status in {
            ProjectStatus.COMPLETED,
            ProjectStatus.ABORTED,
        }:
            raise ValueError(
                "Members cannot be assigned to a completed "
                "or aborted project."
            )

        employee = self.repository.get_employee(
            team_leader_id=team_leader_id,
            user_id=employee_user_id,
        )

        if employee is None:
            raise ValueError(
                "Employee not found."
            )

        job_role = self.repository.get_job_role(
            team_leader_id=team_leader_id,
            job_role_id=job_role_id,
        )

        if job_role is None:
            raise ValueError(
                "Job role not found in this organization."
            )

        if not self.repository.employee_has_job_role(
            employee_id=employee.id,
            job_role_id=job_role_id,
        ):
            raise ValueError(
                "This job role is not assigned to the employee."
            )

        existing_member = (
            self.repository.get_project_member_by_role(
                project_id=project_id,
                user_id=employee_user_id,
                job_role_id=job_role_id,
            )
        )

        if existing_member is not None:
            raise ValueError(
                "Employee is already assigned to this project."
            )

        active_count = (
            self.repository.count_active_projects(
                team_leader_id=team_leader_id,
                user_id=employee_user_id,
            )
        )

        # If the employee already has another assignment on THIS
        # project (for example Reviewer), this project must not consume
        # an additional project-capacity slot.
        existing_any_assignment = (
            self.repository.get_project_member(
                project_id=project_id,
                user_id=employee_user_id,
            )
        )

        effective_active_count = active_count

        if (
            existing_any_assignment is not None
        ):
            effective_active_count = max(
                active_count - 1,
                0,
            )

        if (
            employee.max_concurrent_projects is not None
            and effective_active_count
            >= employee.max_concurrent_projects
        ):
            raise ValueError(
                "Employee has reached the maximum number "
                "of concurrent projects."
            )

        try:

            member = self.repository.add_project_member(
                project_id=project_id,
                user_id=employee_user_id,
                job_role_id=job_role_id,
                is_reviewer=False,
            )

            self.repository.commit()

            member = self.repository.get_project_member_by_role(
                project_id=project_id,
                user_id=employee_user_id,
                job_role_id=job_role_id,
            )

            if member is None:
                raise ValueError(
                    "Employee was assigned but could not be loaded."
                )

            return self._build_member_response(
                member=member,
                team_leader_id=team_leader_id,
            )

        except IntegrityError as exc:

            self.db.rollback()

            raise ValueError(
                "Employee could not be assigned to the project."
            ) from exc

    def set_employee_job_roles(
        self,
        *,
        team_leader_id: int,
        project_id: int,
        employee_user_id: int,
        job_role_ids: list[int],
    ):
        project = self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        if project.status in {ProjectStatus.COMPLETED, ProjectStatus.ABORTED}:
            raise ValueError(
                "Members cannot be assigned to a completed or aborted project."
            )

        employee = self.repository.get_employee(
            team_leader_id=team_leader_id,
            user_id=employee_user_id,
        )

        if employee is None:
            raise ValueError("Employee not found.")

        wanted = list(dict.fromkeys(int(i) for i in job_role_ids))

        if not wanted:
            raise ValueError("Choose at least one job role.")

        for job_role_id in wanted:
            job_role = self.repository.get_job_role(
                team_leader_id=team_leader_id,
                job_role_id=job_role_id,
            )

            if job_role is None:
                raise ValueError("Job role not found in this organization.")

            if not self.repository.employee_has_job_role(
                employee_id=employee.id,
                job_role_id=job_role_id,
            ):
                raise ValueError(
                    f"“{job_role.name}” is not one of this employee's job roles."
                )

        current = [
            m for m in project.members
            if m.user_id == employee_user_id and not m.is_reviewer
        ]

        # already on this project (any role) = no new project slot needed
        already_on_project = (
            self.repository.get_project_member(
                project_id=project_id,
                user_id=employee_user_id,
            )
            is not None
        )

        if (
            not already_on_project
            and employee.max_concurrent_projects is not None
            and self.repository.count_active_projects(
                team_leader_id=team_leader_id,
                user_id=employee_user_id,
            )
            >= employee.max_concurrent_projects
        ):
            raise ValueError(
                "Employee has reached the maximum number of concurrent projects."
            )

        try:
            for member in current:
                if member.job_role_id not in wanted:
                    self.repository.delete_project_member(member=member)

            have = {m.job_role_id for m in current}

            for job_role_id in wanted:
                if job_role_id not in have:
                    self.repository.add_project_member(
                        project_id=project_id,
                        user_id=employee_user_id,
                        job_role_id=job_role_id,
                        is_reviewer=False,
                    )

            self.repository.commit()

        except IntegrityError as exc:
            self.db.rollback()
            raise ValueError("The job roles could not be saved.") from exc

        self.db.expire_all()

        return self.get_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )
    
    # ========================================================
    # Assign Reviewer
    # ========================================================

    def assign_reviewer(
        self,
        *,
        team_leader_id: int,
        project_id: int,
        reviewer_user_id: int,
        job_role_id: int,
    ):
        """
        Assign a reviewer to a project for a specific reviewer job role.

        A reviewer can be assigned to multiple reviewer job roles
        on the same project.

        Example:

            Reviewer A
                Reviewer For:
                    - Director
                    - Writer

            Project assignment:

                Reviewer A + Director
                Reviewer A + Writer

        Each assignment is stored as:

            job_role_id = selected reviewer role
            is_reviewer = True
        """

        # ----------------------------------------------------
        # Project
        # ----------------------------------------------------

        project = self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        if project.status in {
            ProjectStatus.COMPLETED,
            ProjectStatus.ABORTED,
        }:
            raise ValueError(
                "Members cannot be assigned to a completed "
                "or aborted project."
            )

        # ----------------------------------------------------
        # Reviewer
        # ----------------------------------------------------

        reviewer = self.repository.get_employee(
            team_leader_id=team_leader_id,
            user_id=reviewer_user_id,
        )

        if reviewer is None:
            raise ValueError(
                "Reviewer not found."
            )

        if not reviewer.is_reviewer:
            raise ValueError(
                "This employee is not a reviewer."
            )

        # ----------------------------------------------------
        # Validate reviewer job role
        # ----------------------------------------------------

        job_role = self.repository.get_job_role(
            team_leader_id=team_leader_id,
            job_role_id=job_role_id,
        )

        if job_role is None:
            raise ValueError(
                "Job role not found in this organization."
            )

        if not self.repository.employee_has_reviewer_job_role(
            employee_id=reviewer.id,
            job_role_id=job_role_id,
        ):
            raise ValueError(
                "This job role is not configured for this "
                "employee as a reviewer."
            )

        # ----------------------------------------------------
        # Check exact reviewer assignment
        # ----------------------------------------------------
        #
        # Same reviewer can have multiple reviewer roles.
        #
        # Therefore:
        #
        # Reviewer A + Director
        # Reviewer A + Writer
        #
        # are two different assignments.
        #

        existing_member = (
            self.repository.get_project_member_by_role(
                project_id=project_id,
                user_id=reviewer_user_id,
                job_role_id=job_role_id,
                is_reviewer=True,
            )
        )

        if existing_member is not None:
            raise ValueError(
                "Reviewer is already assigned to this project "
                "for this job role."
            )

        # ----------------------------------------------------
        # Project Capacity
        # ----------------------------------------------------

        active_count = (
            self.repository.count_active_projects(
                team_leader_id=team_leader_id,
                user_id=reviewer_user_id,
            )
        )

        # If reviewer already has another assignment on
        # this same project, this project must not consume
        # another project-capacity slot.
        existing_any_assignment = (
            self.repository.get_project_member(
                project_id=project_id,
                user_id=reviewer_user_id,
            )
        )

        effective_active_count = active_count

        if (
            existing_any_assignment is not None
        ):
            effective_active_count = max(
                active_count - 1,
                0,
            )

        if (
            reviewer.max_concurrent_projects is not None
            and effective_active_count
            >= reviewer.max_concurrent_projects
        ):
            raise ValueError(
                "Reviewer has reached the maximum number "
                "of concurrent projects."
            )

        # ----------------------------------------------------
        # Create reviewer assignment
        # ----------------------------------------------------

        try:
            member = self.repository.add_project_member(
                project_id=project_id,
                user_id=reviewer_user_id,
                job_role_id=job_role_id,
                is_reviewer=True,
            )

            self.repository.commit()

            # ------------------------------------------------
            # Reload exact assignment
            # ------------------------------------------------

            member = (
                self.repository.get_project_member_by_role(
                    project_id=project_id,
                    user_id=reviewer_user_id,
                    job_role_id=job_role_id,
                    is_reviewer=True,
                )
            )

            if member is None:
                raise ValueError(
                    "Reviewer was assigned but could not "
                    "be loaded."
                )

            return self._build_member_response(
                member=member,
                team_leader_id=team_leader_id,
            )

        except IntegrityError as exc:
            self.db.rollback()

            raise ValueError(
                "Reviewer could not be assigned to the project."
            ) from exc

    # ========================================================
    # Remove Member
    # ========================================================

    def remove_member(
        self,
        *,
        team_leader_id: int,
        project_id: int,
        member_id: int,
    ):
        """
        Remove one exact project-role assignment.
        """

        self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        member = (
            self.repository.get_project_member_by_id(
                project_id=project_id,
                member_id=member_id,
            )
        )

        if member is None:
            raise ValueError(
                "Project member assignment not found."
            )

        self.repository.delete_project_member(
            member=member,
        )

        self.repository.commit()

        return {
            "message": "Project member assignment removed successfully."
        }

    # ========================================================
    # Project Status
    # ========================================================

    def update_project_status(
        self,
        *,
        team_leader_id: int,
        project_id: int,
        new_status: ProjectStatus,
    ):
        """
        Update project status for a project owned by the
        authenticated Team Leader.

        Project lifecycle:

            PENDING
            ├──> STARTED
            │      ├──> COMPLETED
            │      └──> ABORTED
            │
            └──> ABORTED

        Terminal states:

            COMPLETED -> no transitions
            ABORTED   -> no transitions
        """

        # ----------------------------------------------------
        # Get project
        # ----------------------------------------------------

        project = self._get_owned_project(
            team_leader_id=team_leader_id,
            project_id=project_id,
        )

        current_status = project.status

        # ----------------------------------------------------
        # Normalize enum
        # ----------------------------------------------------

        if isinstance(new_status, str):

            try:

                new_status = ProjectStatus(
                    new_status.strip().lower()
                )

            except ValueError as exc:

                raise ValueError(
                    "Invalid project status. "
                    "Allowed values are: "
                    "pending, started, completed, aborted."
                ) from exc

        # ----------------------------------------------------
        # Same status
        # ----------------------------------------------------

        if current_status == new_status:
            raise ValueError(
                "Project is already in this status."
            )

        # ----------------------------------------------------
        # Allowed transitions
        # ----------------------------------------------------

        allowed_transitions = {
            ProjectStatus.PENDING: {
                ProjectStatus.STARTED,
                ProjectStatus.ABORTED,
            },

            ProjectStatus.STARTED: {
                ProjectStatus.COMPLETED,
                ProjectStatus.ABORTED,
            },

            ProjectStatus.COMPLETED: set(),

            ProjectStatus.ABORTED: set(),
        }

        allowed_statuses = allowed_transitions.get(
            current_status,
            set(),
        )

        if new_status not in allowed_statuses:

            raise ValueError(
                f"Invalid project status transition: "
                f"{current_status.value} -> "
                f"{new_status.value}."
            )

        # ----------------------------------------------------
        # Update status
        # ----------------------------------------------------

        project.status = new_status

        # ----------------------------------------------------
        # Completion timestamp
        # ----------------------------------------------------

        if new_status == ProjectStatus.COMPLETED:

            project.completed_at = (
                datetime.now(timezone.utc)
            )

        elif new_status == ProjectStatus.ABORTED:

            project.completed_at = None

        else:

            project.completed_at = None

        # ----------------------------------------------------
        # Persist
        # ----------------------------------------------------

        self.db.commit()
        self.db.refresh(project)

        # ----------------------------------------------------
        # Return complete project response
        # ----------------------------------------------------

        return self._build_project_response(
            project=project,
        )
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.membership import OrganizationRole
from app.models.project import Project, ProjectStatus
from app.repositories.project_repository import ProjectRepository


class ProjectService:
    """
    Business logic for organization projects.

    Organization Admin:
        - creates projects
        - updates project information
        - deletes projects
        - can change assigned team leader
        - can view/search projects

    Team Leader:
        - starts projects
        - completes projects
        - aborts projects
        - assigns employees
        - assigns reviewers
        - removes employees/reviewers

    Project creation always starts with PENDING status.
    """

    def __init__(self, db: Session):
        self.repository = ProjectRepository(db)

    # ========================================================
    # Authorization
    # ========================================================

    def _require_admin(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
    ):
        membership = self.repository.get_organization_membership(
            organization_id=organization_id,
            user_id=actor_user_id,
        )

        if membership is None:
            raise PermissionError(
                "You are not an active member of this organization."
            )

        if membership.role != OrganizationRole.ADMIN:
            raise PermissionError(
                "Only organization administrators can manage projects."
            )

        return membership

    # ========================================================
    # Team Leader Authorization
    # ========================================================

    def _require_project_team_leader(
        self,
        *,
        actor_user_id: int,
        project: Project,
    ):
        if project.team_leader_id != actor_user_id:
            raise PermissionError(
                "Only the assigned team leader can manage this project."
            )

        employee = self.repository.get_team_leader_employee(
            organization_id=project.organization_id,
            user_id=actor_user_id,
        )

        if employee is None:
            raise PermissionError(
                "You are not an active team leader of this organization."
            )

        return employee

    # ========================================================
    # Validate Team Leader
    # ========================================================

    def _validate_team_leader(
        self,
        *,
        organization_id: int,
        team_leader_id: int,
        current_project=None,
    ):
        employee = self.repository.get_team_leader_employee(
            organization_id=organization_id,
            user_id=team_leader_id,
        )

        if employee is None:
            raise ValueError(
                "Selected user is not an active team leader."
            )
        
        # A Team Leader at their project limit cannot take another project
        if (
            employee.max_concurrent_projects is not None
            and not (
                current_project is not None
                and current_project.team_leader_id == team_leader_id
            )
            and self.repository.count_current_projects_for_user(
                organization_id=organization_id,
                user_id=team_leader_id,
            )
            >= employee.max_concurrent_projects
        ):
            raise ValueError(
                "This Team Leader is already on "
                f"{employee.max_concurrent_projects} "
                f"project{'s' if employee.max_concurrent_projects != 1 else ''}, "
                "their limit."
            )
        
        return employee

    # ========================================================
    # Validate Employee
    # ========================================================

    def _validate_employee(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee:

        employee = self.repository.get_active_employee(
            organization_id=organization_id,
            user_id=user_id,
        )

        if employee is None:
            raise ValueError(
                "Employee not found or is not an active employee "
                "of this organization."
            )

        return employee

    # ========================================================
    # Validate Employee Capacity
    # ========================================================

    def _validate_employee_capacity(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee:

        employee = self._validate_employee(
            organization_id=organization_id,
            user_id=user_id,
        )

        max_projects = employee.max_concurrent_projects

        if max_projects is None:
            raise ValueError(
                f"Employee {user_id} does not have a project "
                "capacity configured."
            )

        current_projects = (
            self.repository.count_current_projects_for_user(
                organization_id=organization_id,
                user_id=user_id,
            )
        )

        if current_projects >= max_projects:
            raise ValueError(
                f"Employee {user_id} has reached the maximum "
                f"concurrent project limit of {max_projects}."
            )

        return employee

    # ========================================================
    # Validate Job Role
    # ========================================================

    def _validate_job_role(
        self,
        *,
        organization_id: int,
        job_role_id: int | None,
    ):

        if job_role_id is None:
            return None

        job_role = self.repository.get_job_role(
            organization_id=organization_id,
            job_role_id=job_role_id,
        )

        if job_role is None:
            raise ValueError(
                "Job role not found."
            )

        return job_role

    # ========================================================
    # Create Project
    # ========================================================

    def create_project(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        title: str,
        description: str | None,
        client_id: int,
        team_leader_id: int,
        start_date=None,
        deadline=None,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
        if start_date and deadline and deadline < start_date:
            raise ValueError(
                "The deadline cannot be before the start date."
            )

        # ----------------------------------------------------
        # Validate Client
        # ----------------------------------------------------

        client = self.repository.get_client(
            organization_id=organization_id,
            client_id=client_id,
        )

        if client is None:
            raise ValueError(
                "Client not found."
            )

        # ----------------------------------------------------
        # Validate Team Leader
        # ----------------------------------------------------

        self._validate_team_leader(
            organization_id=organization_id,
            team_leader_id=team_leader_id,
        )

        # ----------------------------------------------------
        # Create Project
        # ----------------------------------------------------
        #
        # Repository/model defaults status to PENDING.
        # Client cannot choose the initial status.
        #

        project = self.repository.create_project(
            organization_id=organization_id,
            client_id=client_id,
            title=title,
            description=description,
            team_leader_id=team_leader_id,
        )
        project.start_date = start_date
        project.deadline = deadline
        self.repository.commit()

        return self.repository.get_project(
            organization_id=organization_id,
            project_id=project.id,
        )

    # ========================================================
    # Get / Search Projects
    # ========================================================

    def get_projects(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        search: str | None = None,
    ):
        """
        Return organization projects.

        Only organization administrators can access the
        organization dashboard project list.

        Optional search:
            Searches project title and description.
        """

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        if search is not None:
            search = search.strip()

            if not search:
                search = None

        return self.repository.get_projects(
            organization_id=organization_id,
            search=search,
        )

    # ========================================================
    # Get Project
    # ========================================================

    def get_project(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        project_id: int,
    ):

        membership = self.repository.get_organization_membership(
            organization_id=organization_id,
            user_id=actor_user_id,
        )

        if membership is None:
            raise PermissionError(
                "You are not an active member of this organization."
            )

        project = self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )

        return project

    # ========================================================
    # Update Project
    # ========================================================

    def update_project(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        project_id: int,
        title: str | None,
        description: str | None,
        client_id: int | None,
        team_leader_id: int | None,
        start_date=None,
        deadline=None,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        project = self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )
        # ----------------------------------------------------
        # The title is fixed once the project is created.
        # ----------------------------------------------------

        if title is not None and title.strip() != project.title:
            raise ValueError(
                "The project title cannot be changed."
            )

        title = None
        
        # ----------------------------------------------------
        # The client is fixed once the project is created.
        # ----------------------------------------------------

        if client_id is not None and client_id != project.client_id:
            raise ValueError(
                "The client cannot be changed."
            )

        client_id = None

        # ----------------------------------------------------
        # Dates: the start date is fixed once the project has
        # started; the deadline can always be moved.
        # ----------------------------------------------------

        status_value = getattr(project.status, "value", project.status)

        if (
            start_date is not None
            and start_date != project.start_date
            and status_value != "pending"
        ):
            raise ValueError(
                "The start date cannot be changed after the project has started."
            )

        new_start = start_date if start_date is not None else project.start_date
        new_deadline = deadline if deadline is not None else project.deadline

        if new_start and new_deadline and new_deadline < new_start:
            raise ValueError(
                "The deadline cannot be before the start date."
            )

        if start_date is not None:
            project.start_date = start_date

        if deadline is not None:
            project.deadline = deadline
        # ----------------------------------------------------
        # Client validation
        # ----------------------------------------------------

        if client_id is not None:

            client = self.repository.get_client(
                organization_id=organization_id,
                client_id=client_id,
            )

            if client is None:
                raise ValueError(
                    "Client not found."
                )

        # ----------------------------------------------------
        # Team Leader validation
        # ----------------------------------------------------

        if team_leader_id is not None:

            self._validate_team_leader(
                organization_id=organization_id,
                team_leader_id=team_leader_id,
                current_project=project,
            )

        updated_project = self.repository.update_project(
            project=project,
            title=title,
            description=description,
            client_id=client_id,
            team_leader_id=team_leader_id,
        )

        self.repository.commit()

        return self.repository.get_project(
            organization_id=organization_id,
            project_id=updated_project.id,
        )

    # ========================================================
    # Delete Project
    # ========================================================

    def delete_project(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        project_id: int,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        project = self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )

        self.repository.delete_project(
            project=project,
        )

        self.repository.commit()

    # ========================================================
    # Update Project Status
    # ========================================================

    def update_project_status(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        project_id: int,
        status: ProjectStatus,
    ):

        project = self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )

        # ----------------------------------------------------
        # Team Leader authorization
        # ----------------------------------------------------

        self._require_project_team_leader(
            actor_user_id=actor_user_id,
            project=project,
        )

        # ----------------------------------------------------
        # Validate status transition
        # ----------------------------------------------------

        current_status = project.status

        if current_status == ProjectStatus.PENDING:

            if status != ProjectStatus.STARTED:
                raise ValueError(
                    "A pending project can only be started."
                )

        elif current_status == ProjectStatus.STARTED:

            if status not in {
                ProjectStatus.COMPLETED,
                ProjectStatus.ABORTED,
            }:
                raise ValueError(
                    "A started project can only be completed "
                    "or aborted."
                )

        elif current_status in {
            ProjectStatus.COMPLETED,
            ProjectStatus.ABORTED,
        }:

            raise ValueError(
                "Completed or aborted projects cannot change status."
            )

        # ----------------------------------------------------
        # Update
        # ----------------------------------------------------

        project = self.repository.update_project_status(
            project=project,
            project_status=status,
        )

        self.repository.commit()

        return self.repository.get_project(
            organization_id=organization_id,
            project_id=project.id,
        )

    # ========================================================
    # Add Project Member
    # ========================================================

    def add_project_member(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        project_id: int,
        user_id: int,
        job_role_id: int | None,
    ):

        project = self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )

        self._require_project_team_leader(
            actor_user_id=actor_user_id,
            project=project,
        )

        if project.status not in {
            ProjectStatus.PENDING,
            ProjectStatus.STARTED,
        }:
            raise ValueError(
                "Employees and reviewers cannot be assigned "
                "to completed or aborted projects."
            )

        existing_member = self.repository.get_project_member(
            project_id=project_id,
            user_id=user_id,
        )

        if existing_member is not None:
            raise ValueError(
                "Employee is already assigned to this project."
            )

        self._validate_employee_capacity(
            organization_id=organization_id,
            user_id=user_id,
        )

        self._validate_job_role(
            organization_id=organization_id,
            job_role_id=job_role_id,
        )

        self.repository.add_project_member(
            project_id=project_id,
            user_id=user_id,
            job_role_id=job_role_id,
        )

        self.repository.commit()

        return self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

    # ========================================================
    # Remove Project Member
    # ========================================================

    def remove_project_member(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        project_id: int,
        user_id: int,
    ):

        project = self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )

        self._require_project_team_leader(
            actor_user_id=actor_user_id,
            project=project,
        )

        member = self.repository.get_project_member(
            project_id=project_id,
            user_id=user_id,
        )

        if member is None:
            raise ValueError(
                "Project member not found."
            )

        self.repository.delete_project_member(
            member=member,
        )

        self.repository.commit()

        return self.repository.get_project(
            organization_id=organization_id,
            project_id=project_id,
        )
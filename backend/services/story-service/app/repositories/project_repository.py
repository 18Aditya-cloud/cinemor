from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client
from app.models.employee import Employee
from app.models.membership import (
    OrganizationMembership,
    OrganizationRole,
)
from app.models.organization_job_role import OrganizationJobRole
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember
from app.models.user import User


class ProjectRepository:
    """
    Database operations for projects and project members.

    Authorization and business rules remain in the service layer.
    """

    def __init__(self, db: Session):
        self.db = db

    # ========================================================
    # Organization Membership
    # ========================================================

    def get_organization_membership(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> OrganizationMembership | None:

        statement = select(
            OrganizationMembership
        ).where(
            OrganizationMembership.organization_id
            == organization_id,
            OrganizationMembership.user_id
            == user_id,
            OrganizationMembership.is_active.is_(True),
        )

        return self.db.scalar(statement)

    # ========================================================
    # Client
    # ========================================================

    def get_client(
        self,
        *,
        organization_id: int,
        client_id: int,
    ) -> Client | None:

        statement = select(Client).where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )

        return self.db.scalar(statement)

    # ========================================================
    # User
    # ========================================================

    def get_user(
        self,
        *,
        user_id: int,
    ) -> User | None:

        return self.db.scalar(
            select(User).where(
                User.id == user_id,
                User.is_active.is_(True),
            )
        )

    # ========================================================
    # Employee
    # ========================================================

    def get_employee(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee | None:

        statement = (
            select(Employee)
            .where(
                Employee.organization_id == organization_id,
                Employee.user_id == user_id,
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Active Employee
    # ========================================================

    def get_active_employee(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee | None:

        statement = (
            select(Employee)
            .join(
                OrganizationMembership,
                OrganizationMembership.user_id
                == Employee.user_id,
            )
            .where(
                Employee.organization_id == organization_id,
                Employee.user_id == user_id,
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,
                OrganizationMembership.is_active.is_(True),
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Team Leader Employee
    # ========================================================

    def get_team_leader_employee(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee | None:

        statement = (
            select(Employee)
            .join(
                OrganizationMembership,
                OrganizationMembership.user_id
                == Employee.user_id,
            )
            .where(
                Employee.organization_id == organization_id,
                Employee.user_id == user_id,
                Employee.is_team_leader.is_(True),
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,
                OrganizationMembership.is_active.is_(True),
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Job Role
    # ========================================================

    def get_job_role(
        self,
        *,
        organization_id: int,
        job_role_id: int,
    ) -> OrganizationJobRole | None:

        statement = select(
            OrganizationJobRole
        ).where(
            OrganizationJobRole.id == job_role_id,
            OrganizationJobRole.organization_id
            == organization_id,
        )

        return self.db.scalar(statement)

    # ========================================================
    # Project
    # ========================================================

    def get_project(
        self,
        *,
        organization_id: int,
        project_id: int,
    ) -> Project | None:

        statement = (
            select(Project)
            .options(
                selectinload(Project.members),
            )
            .where(
                Project.id == project_id,
                Project.organization_id
                == organization_id,
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Project List
    # ========================================================

    # ========================================================
# Project List / Search
# ========================================================

    def get_projects(
        self,
        *,
        organization_id: int,
        search: str | None = None,
    ) -> list[Project]:

        statement = (
            select(Project)
            .options(
                selectinload(Project.members),
            )
            .where(
                Project.organization_id == organization_id,
            )
        )

        # ----------------------------------------------------
        # Search
        # ----------------------------------------------------
        #
        # Search project title and description.
        #

        if search:
            term = f"%{search.strip()}%"

            statement = statement.where(
                or_(
                    Project.title.ilike(term),
                    Project.description.ilike(term),
                )
            )

        statement = statement.order_by(
            Project.created_at.desc(),
            Project.id.desc(),
        )

        return list(
            self.db.scalars(statement)
            .unique()
            .all()
        )

    # ========================================================
    # Create Project
    # ========================================================

    def create_project(
        self,
        *,
        organization_id: int,
        client_id: int,
        title: str,
        description: str | None,
        team_leader_id: int,
    ) -> Project:

        project = Project(
            organization_id=organization_id,
            client_id=client_id,
            title=title,
            description=description,
            team_leader_id=team_leader_id,
            status=ProjectStatus.PENDING,
        )

        self.db.add(project)
        self.db.flush()

        return project

    # ========================================================
    # Update Project
    # ========================================================

    def update_project(
        self,
        *,
        project: Project,
        title: str | None,
        description: str | None,
        client_id: int | None,
        team_leader_id: int | None,
    ) -> Project:

        if title is not None:
            project.title = title

        if description is not None:
            project.description = description

        if client_id is not None:
            project.client_id = client_id

        if team_leader_id is not None:
            project.team_leader_id = team_leader_id

        self.db.flush()

        return project

    # ========================================================
    # Delete Project
    # ========================================================

    def delete_project(
        self,
        *,
        project: Project,
    ) -> None:

        self.db.delete(project)
        self.db.flush()

    # ========================================================
    # Project Status
    # ========================================================

    def update_project_status(
        self,
        *,
        project: Project,
        project_status: ProjectStatus,
    ) -> Project:

        project.status = project_status

        if project_status == ProjectStatus.COMPLETED:
            project.completed_at = datetime.now(
                timezone.utc
            )
        else:
            project.completed_at = None

        self.db.flush()

        return project

    # ========================================================
    # Project Member
    # ========================================================

    def get_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
    ) -> ProjectMember | None:

        statement = select(
            ProjectMember
        ).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )

        return self.db.scalar(statement)

    # ========================================================
    # Project Members
    # ========================================================

    def get_project_members(
        self,
        *,
        project_id: int,
    ) -> list[ProjectMember]:

        statement = (
            select(ProjectMember)
            .where(
                ProjectMember.project_id == project_id,
            )
            .order_by(
                ProjectMember.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
    # Add Project Member
    # ========================================================

    def add_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
        job_role_id: int | None,
    ) -> ProjectMember:

        member = ProjectMember(
            project_id=project_id,
            user_id=user_id,
            job_role_id=job_role_id,
        )

        self.db.add(member)
        self.db.flush()

        return member

    # ========================================================
    # Remove Project Member
    # ========================================================

    def delete_project_member(
        self,
        *,
        member: ProjectMember,
    ) -> None:

        self.db.delete(member)
        self.db.flush()

    # ========================================================
    # Employee Active Project Count
    # ========================================================

    # ========================================================
# Current Project Count
# ========================================================

    def count_current_projects_for_user(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> int:
        """
        Count the projects a person is on right now.

        A project counts while it is Not started (PENDING) or Ongoing (STARTED),
        whether the person leads it (Team Leader) or works / reviews on it.
        A project is never counted twice (Team Leader and member, or several
        job roles on the same project).
        """

        on_project = (
            select(ProjectMember.project_id)
            .where(ProjectMember.user_id == user_id)
        )

        statement = (
            select(func.count(Project.id))
            .where(
                Project.organization_id == organization_id,
                Project.status.in_(
                    (ProjectStatus.PENDING, ProjectStatus.STARTED)
                ),
                or_(
                    Project.team_leader_id == user_id,
                    Project.id.in_(on_project),
                ),
            )
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Commit
    # ========================================================

    def commit(self) -> None:
        self.db.commit()

    # ========================================================
    # Refresh
    # ========================================================

    def refresh(
        self,
        project: Project,
    ) -> Project:

        self.db.refresh(project)

        return project
from __future__ import annotations

from sqlalchemy import func, select, or_
from sqlalchemy.orm import Session, selectinload

from app.models.employee import Employee
from app.models.employee_job_role import (
    EmployeeJobRole,
    EmployeeReviewerJobRole,
)
from app.models.membership import (
    OrganizationMembership,
    OrganizationRole,
)
from app.models.organization_job_role import OrganizationJobRole
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember
from app.models.user import User


class TeamLeaderDashboardRepository:
    """
    Database queries for Team Leader Dashboard.

    Public methods use team_leader_id.

    organization_id is resolved internally from Employee.
    """

    def __init__(self, db: Session):
        self.db = db

    # ========================================================
    # Internal Organization Resolver
    # ========================================================

    def _get_team_leader_organization_id(
        self,
        *,
        team_leader_id: int,
    ) -> int | None:
        """
        Resolve organization_id from the Team Leader.

        organization_id is never supplied by the Team Leader API.
        """

        statement = (
            select(Employee.organization_id)
            .where(
                Employee.user_id == team_leader_id,
                Employee.is_team_leader.is_(True),
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Team Leader
    # ========================================================

    def get_team_leader(
        self,
        *,
        team_leader_id: int,
    ) -> Employee | None:
        """
        Resolve the Team Leader directly from their user ID.
        """

        statement = (
            select(Employee)
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles)
                .selectinload(EmployeeJobRole.job_role),
            )
            .join(
                OrganizationMembership,
                OrganizationMembership.user_id
                == Employee.user_id,
            )
            .where(
                Employee.user_id == team_leader_id,

                Employee.is_team_leader.is_(True),

                OrganizationMembership.organization_id
                == Employee.organization_id,

                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,

                OrganizationMembership.is_active.is_(True),

                User.is_active.is_(True),
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Project
    # ========================================================

    def get_project(
        self,
        *,
        team_leader_id: int,
        project_id: int,
    ) -> Project | None:
        """
        Get a project owned by the Team Leader.

        Both Team Leader and organization are checked internally.
        """

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return None

        statement = (
            select(Project)
            .options(
                selectinload(Project.members)
                .selectinload(ProjectMember.user),

                selectinload(Project.members)
                .selectinload(ProjectMember.job_role),
            )
            .where(
                Project.id == project_id,

                Project.organization_id
                == organization_id,

                Project.team_leader_id
                == team_leader_id,
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Team Leader Projects
    # ========================================================

    def get_projects(
        self,
        *,
        team_leader_id: int,
        search: str | None = None,
        status: ProjectStatus | None = None,
    ) -> list[Project]:
        """
        Get all projects belonging to the Team Leader.
        """

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return []

        statement = (
            select(Project)
            .options(
                selectinload(Project.members)
                .selectinload(ProjectMember.user),

                selectinload(Project.members)
                .selectinload(ProjectMember.job_role),
            )
            .where(
                Project.organization_id
                == organization_id,

                Project.team_leader_id
                == team_leader_id,
            )
        )

        if search:
            term = f"%{search.strip()}%"

            statement = statement.where(
                or_(
                    Project.title.ilike(term),
                    Project.description.ilike(term),
                )
            )

        if status is not None:
            statement = statement.where(
                Project.status == status,
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
    # Project Members
    # ========================================================

    def get_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
    ) -> ProjectMember | None:
        """
        Return the first project membership for a user.

        Kept for backwards compatibility with code that only needs
        to know whether the user has any membership.
        """

        statement = (
            select(ProjectMember)
            .options(
                selectinload(ProjectMember.user),
                selectinload(ProjectMember.job_role),
            )
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
            .order_by(
                ProjectMember.id.asc(),
            )
        )

        return self.db.scalars(statement).first()

    def get_project_member_by_role(
        self,
        *,
        project_id: int,
        user_id: int,
        job_role_id: int | None,
        is_reviewer: bool = False,
    ) -> ProjectMember | None:
        """
        Return the exact project assignment.

        Employee assignment:
            project_id + user_id + job_role_id + is_reviewer=False

        Reviewer assignment:
            project_id + user_id + job_role_id + is_reviewer=True
        """

        statement = (
            select(ProjectMember)
            .options(
                selectinload(ProjectMember.user),
                selectinload(ProjectMember.job_role),
            )
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.job_role_id == job_role_id,
                ProjectMember.is_reviewer.is_(is_reviewer),
            )
        )

        return self.db.scalar(statement)

    def get_project_member_by_id(
        self,
        *,
        project_id: int,
        member_id: int,
    ) -> ProjectMember | None:
        """
        Return one exact project membership row.
        """

        statement = (
            select(ProjectMember)
            .options(
                selectinload(ProjectMember.user),
                selectinload(ProjectMember.job_role),
            )
            .where(
                ProjectMember.id == member_id,
                ProjectMember.project_id == project_id,
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Existing Project Member
    # ========================================================

    def get_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
    ) -> ProjectMember | None:
        statement = (
            select(ProjectMember)
            .options(
                selectinload(ProjectMember.user),
                selectinload(ProjectMember.job_role),
            )
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )
        return self.db.scalar(statement)

    # ========================================================
    # Add Project Member
    # ========================================================

    def add_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
        job_role_id: int | None,
        is_reviewer: bool = False,
    ) -> ProjectMember:
        """
        Create a project member assignment.

        is_reviewer=True is used for reviewer assignments.
        """

        member = ProjectMember(
            project_id=project_id,
            user_id=user_id,
            job_role_id=job_role_id,
            is_reviewer=is_reviewer,
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
    # Employee
    # ========================================================

    def get_employee(
        self,
        *,
        team_leader_id: int,
        user_id: int,
    ) -> Employee | None:
        """
        Get an employee belonging to the Team Leader's
        organization.
        """

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return None

        statement = (
            select(Employee)
            .options(
                selectinload(Employee.job_roles)
                .selectinload(EmployeeJobRole.job_role),

                selectinload(Employee.reviewer_job_roles)
                    .selectinload(EmployeeReviewerJobRole.job_role),

                selectinload(Employee.user),
            )
            .join(
                OrganizationMembership,
                OrganizationMembership.user_id
                == Employee.user_id,
            )
            .where(
                Employee.organization_id
                == organization_id,

                Employee.user_id
                == user_id,

                OrganizationMembership.organization_id
                == organization_id,

                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,

                OrganizationMembership.is_active.is_(True),

                User.is_active.is_(True),
            )
        )

        return self.db.scalar(statement)

    # ========================================================
    # Available Employees / Reviewers
    # ========================================================

    def get_available_people(
        self,
        *,
        team_leader_id: int,
        exclude_user_id: int,
        search: str | None = None,
        job_role_id: int | None = None,
        reviewer_only: bool = False,
    ) -> list[Employee]:
        """
        Get available employees/reviewers from the Team
        Leader's organization.

        This is organization-wide and NOT project-specific.
        """

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return []

        # ----------------------------------------------------
        # Count active projects for each employee.
        #
        # PENDING and STARTED count against capacity.
        # ----------------------------------------------------

        active_project_count = (
            select(func.count(Project.id))
            .where(
                Project.organization_id == organization_id,
                Project.status.in_(
                    (ProjectStatus.PENDING, ProjectStatus.STARTED)
                ),
                or_(
                    Project.team_leader_id == Employee.user_id,
                    Project.id.in_(
                        select(ProjectMember.project_id)
                        .where(ProjectMember.user_id == Employee.user_id)
                        .correlate(Employee)
                    ),
                ),
            )
            .correlate(Employee)
            .scalar_subquery()
        )

        statement = (
            select(Employee)
            .join(
                OrganizationMembership,
                OrganizationMembership.user_id
                == Employee.user_id,
            )
            .join(
                User,
                User.id == Employee.user_id,
            )
            .options(
                selectinload(Employee.job_roles)
                .selectinload(EmployeeJobRole.job_role),

                selectinload(Employee.user),
            )
            .where(
                Employee.organization_id
                == organization_id,

                Employee.user_id
                != exclude_user_id,

                User.is_active.is_(True),

                OrganizationMembership.organization_id
                == organization_id,

                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,

                OrganizationMembership.is_active.is_(True),
            )
        )

        # ----------------------------------------------------
        # Reviewer filter
        # ----------------------------------------------------

        if reviewer_only:
            statement = statement.where(
                Employee.is_reviewer.is_(True),
            )

        # ----------------------------------------------------
        # Job role filter
        #
        # Only applies to employee search.
        # Reviewer API does not pass job_role_id.
        # ----------------------------------------------------

        if job_role_id is not None:
            statement = statement.where(
                Employee.job_roles.any(
                    EmployeeJobRole.job_role_id
                    == job_role_id
                )
            )

        # ----------------------------------------------------
        # Search
        # ----------------------------------------------------
        #
        # The current runtime User model does not expose
        # email/username/full_name as SQLAlchemy attributes.
        # Keep the available-people query independent of
        # those User fields for now.
        #
        # The frontend can request the complete available
        # employee/reviewer list and perform filtering locally.
        #
        # ----------------------------------------------------

        # ----------------------------------------------------
        # Capacity
        # ----------------------------------------------------

        statement = statement.where(
            (
                Employee.max_concurrent_projects.is_(None)
            )
            |
            (
                active_project_count
                < Employee.max_concurrent_projects
            )
        )

        statement = statement.order_by(
            Employee.user_id.asc(),
        )

        return list(
            self.db.scalars(statement)
            .unique()
            .all()
        )

    # ========================================================
    # Employee Active Project Count
    # ========================================================

    def count_active_projects(
        self,
        *,
        team_leader_id: int,
        user_id: int,
    ) -> int:
        """
        Count unique STARTED projects for an employee/reviewer.

        Multiple job roles on the same project count as one project.
        Only STARTED projects consume concurrent-project capacity.
        """

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return 0

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

        return int(self.db.scalar(statement) or 0)

    # ========================================================
    # Job Role
    # ========================================================

    def get_job_role(
        self,
        *,
        team_leader_id: int,
        job_role_id: int,
    ) -> OrganizationJobRole | None:
        """
        Get a job role belonging to the Team Leader's
        organization.
        """

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return None

        return self.db.scalar(
            select(OrganizationJobRole).where(
                OrganizationJobRole.id == job_role_id,

                OrganizationJobRole.organization_id
                == organization_id,
            )
        )

    # ========================================================
    # Employee Job Role Assignment
    # ========================================================

    def employee_has_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> bool:

        statement = select(
            EmployeeJobRole.id
        ).where(
            EmployeeJobRole.employee_id == employee_id,
            EmployeeJobRole.job_role_id == job_role_id,
        )

        return self.db.scalar(statement) is not None

    def employee_has_reviewer_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> bool:
        """
        Check whether the employee is configured as a reviewer
        for the supplied job role.

        The employee must have:
        1. The job role assigned normally.
        2. The same job role configured in
        EmployeeReviewerJobRole.
        """

        from app.models.employee_job_role import (
            EmployeeReviewerJobRole,
        )

        statement = (
            select(EmployeeReviewerJobRole.id)
            .join(
                EmployeeJobRole,
                EmployeeJobRole.employee_id
                == EmployeeReviewerJobRole.employee_id,
            )
            .where(
                EmployeeReviewerJobRole.employee_id
                == employee_id,

                EmployeeReviewerJobRole.job_role_id
                == job_role_id,

                EmployeeJobRole.job_role_id
                == job_role_id,
            )
        )

        return self.db.scalar(statement) is not None

    # ========================================================
    # Dashboard Counts
    # ========================================================

    def count_projects(
        self,
        *,
        team_leader_id: int,
    ) -> int:

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return 0

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
            Project.team_leader_id == team_leader_id,
        )

        return int(
            self.db.scalar(statement) or 0
        )

    def count_projects_by_status(
        self,
        *,
        team_leader_id: int,
        project_status: ProjectStatus,
    ) -> int:

        organization_id = (
            self._get_team_leader_organization_id(
                team_leader_id=team_leader_id,
            )
        )

        if organization_id is None:
            return 0

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
            Project.team_leader_id == team_leader_id,
            Project.status == project_status,
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
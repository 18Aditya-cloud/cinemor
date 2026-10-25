from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.employee_invitation import EmployeeInvitation
from app.models.employee import Employee
from app.models.employee_job_role import EmployeeJobRole
from app.models.membership import (
    OrganizationMembership,
    OrganizationRole,
)
from app.models.organization import Organization
from app.models.organization_job_role import OrganizationJobRole
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember


class OrganizationDashboardRepository:
    """
    Read-only database queries used by the organization dashboard.

    Business rules and authorization remain in the service layer.

    Repository methods do not commit transactions.
    """

    def __init__(self, db: Session):
        self.db = db

    # ========================================================
    # Organization
    # ========================================================

    def get_organization(
        self,
        *,
        organization_id: int,
    ) -> Organization | None:

        return self.db.scalar(
            select(Organization).where(
                Organization.id == organization_id,
            )
        )

    # ========================================================
    # Clients
    # ========================================================

    def get_clients(
        self,
        *,
        organization_id: int,
        search: str | None = None,
    ) -> list[Client]:
        """
        Return clients belonging to an organization.

        Optional search:
            Searches by client name, email, or phone.
        """

        statement = select(Client).where(
            Client.organization_id == organization_id,
        )

        if search:
            search_pattern = f"%{search.strip()}%"

            statement = statement.where(
                or_(
                    Client.name.ilike(search_pattern),
                    Client.email.ilike(search_pattern),
                    Client.phone.ilike(search_pattern),
                )
            )

        statement = statement.order_by(
            Client.name.asc(),
            Client.id.asc(),
        )

        return list(
            self.db.scalars(statement).all()
        )

    def get_client(
        self,
        *,
        organization_id: int,
        client_id: int,
    ) -> Client | None:

        return self.db.scalar(
            select(Client).where(
                Client.id == client_id,
                Client.organization_id == organization_id,
            )
        )

    # ========================================================
    # Memberships
    # ========================================================

    def get_memberships(
        self,
        *,
        organization_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
            )
            .order_by(
                OrganizationMembership.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
    # Employees
    # ========================================================

    def get_employee_by_user(
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

    def get_employee_memberships(
        self,
        *,
        organization_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,
                OrganizationMembership.is_active.is_(True),
            )
            .order_by(
                OrganizationMembership.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
# Employee Job Roles
# ========================================================

    def get_employee_job_roles(
        self,
        *,
        employee_id: int,
    ) -> list[EmployeeJobRole]:

        statement = (
            select(EmployeeJobRole)
            .where(
                EmployeeJobRole.employee_id == employee_id,
            )
            .order_by(
                EmployeeJobRole.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    def count_employee_active_projects(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> int:
        """
        Count unique active projects for an employee.

        Rules:
        - One project counts only once.
        - Multiple job-role assignments on the same project
        count as one project.
        - A project where the employee is Team Leader counts.
        - If the employee is both Team Leader and ProjectMember
        on the same project, it still counts only once.
        - Only STARTED projects consume capacity.
        """

        statement = (
            select(
                func.count(
                    func.distinct(Project.id)
                )
            )
            .outerjoin(
                ProjectMember,
                ProjectMember.project_id
                == Project.id,
            )
            .where(
                Project.organization_id
                == organization_id,

                Project.status.in_(
                    (ProjectStatus.PENDING, ProjectStatus.STARTED)
                ),

                or_(
                    Project.team_leader_id
                    == user_id,

                    ProjectMember.user_id
                    == user_id,
                ),
            )
        )

        return int(
            self.db.scalar(statement) or 0
        )


    def count_team_leader_current_projects(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> int:
        """
        Count projects currently assigned to a Team Leader.

        Business rule:
        - Team Leader gets +1 as soon as Admin assigns the project.
        - Therefore PENDING and STARTED both count.
        - COMPLETED and ABORTED do not count.

        The Team Leader is stored directly on Project.team_leader_id,
        not as a ProjectMember.
        """

        statement = (
            select(
                func.count(Project.id)
            )
            .where(
                Project.team_leader_id == user_id,
                Project.organization_id == organization_id,
                Project.status.in_(
                    [
                        ProjectStatus.PENDING,
                        ProjectStatus.STARTED,
                    ]
                ),
            )
        )

        return int(
            self.db.scalar(statement) or 0
        )
    # ========================================================
    # Job Roles
    # ========================================================

    def get_job_roles(
        self,
        *,
        organization_id: int,
    ) -> list[OrganizationJobRole]:

        statement = (
            select(OrganizationJobRole)
            .where(
                OrganizationJobRole.organization_id
                == organization_id,         )
            .order_by(
                OrganizationJobRole.name.asc(),
                OrganizationJobRole.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
    # Count Memberships by Role
    # ========================================================

    def count_memberships_by_role(
        self,
        *,
        organization_id: int,
        role: OrganizationRole,
    ) -> int:

        statement = select(
            func.count(OrganizationMembership.id)
        ).where(
            OrganizationMembership.organization_id
            == organization_id,
            OrganizationMembership.role == role,
            OrganizationMembership.is_active.is_(True),
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Total Clients
    # ========================================================

    def count_clients(
        self,
        *,
        organization_id: int,
    ) -> int:

        statement = select(
            func.count(Client.id)
        ).where(
            Client.organization_id == organization_id,
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Projects
    # ========================================================

    def get_projects(
        self,
        *,
        organization_id: int,
        search: str | None = None,
        status: ProjectStatus | None = None,
    ) -> list[Project]:
        """
        Return projects belonging to the organization.

        Optional filters:

            search:
                Searches project title and description.

            status:
                Filters by project lifecycle status.
        """

        statement = select(Project).where(
            Project.organization_id == organization_id,
        )

        if search:
            search_pattern = f"%{search.strip()}%"

            statement = statement.where(
                or_(
                    Project.title.ilike(search_pattern),
                    Project.description.ilike(search_pattern),
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
            self.db.scalars(statement).all()
        )

    def get_project(
        self,
        *,
        organization_id: int,
        project_id: int,
    ) -> Project | None:

        return self.db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )

    # ========================================================
    # Project Counts
    # ========================================================

    def count_projects(
        self,
        *,
        organization_id: int,
    ) -> int:

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Ongoing Projects
    # ========================================================

    def count_ongoing_projects(
        self,
        *,
        organization_id: int,
    ) -> int:
        """
        Ongoing projects are projects that have started
        but are not completed or aborted.

        Current lifecycle:

            PENDING
            STARTED
            COMPLETED
            ABORTED

        Only STARTED projects are considered ongoing.
        """

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
            Project.status == ProjectStatus.STARTED,
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Completed Projects
    # ========================================================

    def count_completed_projects(
        self,
        *,
        organization_id: int,
    ) -> int:

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
            Project.status == ProjectStatus.COMPLETED,
        )

        return int(
            self.db.scalar(statement) or 0
        )

    def count_aborted_projects(
        self,
        *,
        organization_id: int,
    ) -> int:
        """
        Count projects that have been aborted
        in the organization.
        """

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
            Project.status == ProjectStatus.ABORTED,
        )

        return int(
            self.db.scalar(statement) or 0
        )



    # ========================================================
    # Pending Projects
    # ========================================================

    def count_pending_projects(
        self,
        *,
        organization_id: int,
    ) -> int:

        statement = select(
            func.count(Project.id)
        ).where(
            Project.organization_id == organization_id,
            Project.status == ProjectStatus.PENDING,
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Accepted Employees
    # ========================================================

    def get_accepted_employees(
        self,
        *,
        organization_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.role
                == OrganizationRole.EMPLOYEE,
                OrganizationMembership.is_active.is_(True),
            )
            .order_by(
                OrganizationMembership.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
    # Pending Employee Invitations
    # ========================================================

    def get_pending_employee_invitations(
        self,
        *,
        organization_id: int,
    ) -> list[EmployeeInvitation]:

        statement = (
            select(EmployeeInvitation)
            .where(
                EmployeeInvitation.organization_id
                == organization_id,
                EmployeeInvitation.is_accepted.is_(False),
                EmployeeInvitation.revoked_at.is_(None),
            )
            .order_by(
                EmployeeInvitation.created_at.desc(),
                EmployeeInvitation.id.desc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )
    
    def count_client_ongoing_projects(
        self,
        *,
        organization_id: int,
        client_id: int,
    ) -> int:
        statement = select(func.count(Project.id)).where(
            Project.organization_id == organization_id,
            Project.client_id == client_id,
            Project.status == ProjectStatus.STARTED,
        )
        return int(self.db.scalar(statement) or 0)


    def count_client_completed_projects(
        self,
        *,
        organization_id: int,
        client_id: int,
    ) -> int:
        statement = select(func.count(Project.id)).where(
            Project.organization_id == organization_id,
            Project.client_id == client_id,
            Project.status == ProjectStatus.COMPLETED,
        )
        return int(self.db.scalar(statement) or 0)
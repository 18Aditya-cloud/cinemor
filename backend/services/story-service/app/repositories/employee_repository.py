from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.employee import Employee
from app.models.employee_job_role import (
    EmployeeJobRole,
    EmployeeReviewerJobRole,
)
from app.models.membership import OrganizationMembership
from app.models.organization_job_role import OrganizationJobRole
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember
from app.models.user import User


class EmployeeRepository:
    """
    Database operations for employee management.

    Transaction ownership remains with the service layer.
    Repository methods do not commit.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ========================================================
    # Employee
    # ========================================================

    def get_employee_by_id(
        self,
        *,
        employee_id: int,
    ) -> Employee | None:

        return self.db.scalar(
            select(Employee).where(
                Employee.id == employee_id,
            )
        )

    def get_employee_by_user(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee | None:

        return self.db.scalar(
            select(Employee).where(
                Employee.organization_id == organization_id,
                Employee.user_id == user_id,
            )
        )

    def get_employee_by_user_for_update(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee | None:

        return self.db.scalar(
            select(Employee)
            .where(
                Employee.organization_id == organization_id,
                Employee.user_id == user_id,
            )
            .with_for_update()
        )

    def get_employee_by_id_for_update(
        self,
        *,
        organization_id: int,
        employee_id: int,
    ) -> Employee | None:

        return self.db.scalar(
            select(Employee)
            .where(
                Employee.id == employee_id,
                Employee.organization_id == organization_id,
            )
            .with_for_update()
        )

    def get_organization_employees(
        self,
        *,
        organization_id: int,
    ) -> list[Employee]:

        statement = (
            select(Employee)
            .where(
                Employee.organization_id == organization_id,
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                Employee.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    def get_active_organization_employees(
        self,
        *,
        organization_id: int,
    ) -> list[Employee]:

        statement = (
            select(Employee)
            .join(
                OrganizationMembership,
                OrganizationMembership.user_id
                == Employee.user_id,
            )
            .where(
                Employee.organization_id == organization_id,
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                Employee.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
    # Search Employees
    # ========================================================

    def search_employees(
        self,
        *,
        organization_id: int,
        search: str | None = None,
        role: str | None = None,
        job_role_id: int | None = None,
    ) -> list[Employee]:
        """
        Search active employees.

        search:
            Searches employee email.

        role:
            Supported values:
                - employee
                - team_leader
                - team-leader
                - team leader
                - reviewer

        job_role_id:
            Filters employees by organization job role.
        """

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
            .where(
                Employee.organization_id == organization_id,
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
                User.is_active.is_(True),
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
        )

        # --------------------------------------------------------
        # Email search
        # --------------------------------------------------------

        if search:
            search_pattern = (
                f"%{search.strip()}%"
            )

            statement = statement.where(
                or_(
                    User.email.ilike(search_pattern),
                )
            )

        # --------------------------------------------------------
        # Responsibility role
        # --------------------------------------------------------

        if role:
            normalized_role = (
                role.strip().lower()
            )

            if normalized_role in {
                "team_leader",
                "team-leader",
                "team leader",
            }:
                statement = statement.where(
                    Employee.is_team_leader.is_(True)
                )

            elif normalized_role == "reviewer":
                statement = statement.where(
                    Employee.is_reviewer.is_(True)
                )

            elif normalized_role == "employee":
                statement = statement.where(
                    Employee.is_team_leader.is_(False),
                    Employee.is_reviewer.is_(False),
                )

            else:
                raise ValueError(
                    "Invalid employee role. "
                    "Use employee, team_leader, or reviewer."
                )

        # --------------------------------------------------------
        # Job role
        # --------------------------------------------------------

        if job_role_id is not None:
            statement = (
                statement
                .join(
                    EmployeeJobRole,
                    EmployeeJobRole.employee_id
                    == Employee.id,
                )
                .where(
                    EmployeeJobRole.job_role_id
                    == job_role_id,
                )
            )

        statement = statement.order_by(
            User.email.asc(),
            Employee.id.asc(),
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
    # Create Employee
    # ========================================================

    def create_employee(
        self,
        *,
        organization_id: int,
        user_id: int,
        max_concurrent_projects: int | None = None,
    ) -> Employee:

        employee = Employee(
            organization_id=organization_id,
            user_id=user_id,
            max_concurrent_projects=(
                max_concurrent_projects
            ),
        )

        self.db.add(employee)
        self.db.flush()

        return employee

    # ========================================================
    # Project Capacity
    # ========================================================

    def update_max_concurrent_projects(
        self,
        *,
        employee: Employee,
        max_concurrent_projects: int | None,
    ) -> Employee:

        employee.max_concurrent_projects = (
            max_concurrent_projects
        )

        self.db.flush()

        return employee

    # ========================================================
    # Team Leader / Reviewer Responsibility
    # ========================================================

    def update_responsibilities(
        self,
        *,
        employee: Employee,
        is_team_leader: bool | None = None,
        is_reviewer: bool | None = None,
    ) -> Employee:

        if is_team_leader is not None:
            employee.is_team_leader = (
                is_team_leader
            )

        if is_reviewer is not None:
            employee.is_reviewer = (
                is_reviewer
            )

        self.db.flush()

        return employee

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
                EmployeeJobRole.employee_id
                == employee_id,
            )
            .options(
                selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                EmployeeJobRole.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    def get_employee_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> EmployeeJobRole | None:

        return self.db.scalar(
            select(EmployeeJobRole).where(
                EmployeeJobRole.employee_id
                == employee_id,
                EmployeeJobRole.job_role_id
                == job_role_id,
            )
        )

    def assign_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> EmployeeJobRole:

        employee_job_role = EmployeeJobRole(
            employee_id=employee_id,
            job_role_id=job_role_id,
        )

        self.db.add(employee_job_role)
        self.db.flush()

        return employee_job_role

    def remove_job_role(
        self,
        *,
        employee_job_role: EmployeeJobRole,
    ) -> None:
        reviewer_assignment = self.db.scalar(
            select(EmployeeReviewerJobRole).where(
                EmployeeReviewerJobRole.employee_id
                == employee_job_role.employee_id,
                EmployeeReviewerJobRole.job_role_id
                == employee_job_role.job_role_id,
            )
        )

        if reviewer_assignment is not None:
            self.db.delete(reviewer_assignment)

        self.db.delete(employee_job_role)
        self.db.flush()

    # ========================================================
    # Employee Reviewer Job Roles
    # ========================================================

    def get_employee_reviewer_job_roles(
        self,
        *,
        employee_id: int,
    ) -> list[EmployeeReviewerJobRole]:
        statement = (
            select(EmployeeReviewerJobRole)
            .where(
                EmployeeReviewerJobRole.employee_id
                == employee_id,
            )
            .options(
                selectinload(
                    EmployeeReviewerJobRole.job_role
                ),
            )
            .order_by(
                EmployeeReviewerJobRole.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
# Employee Project Capacity
# ========================================================

    def count_employee_active_projects(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> int:
        """
        Count unique active projects for an employee.

        Rules:
        - One project counts only once per employee.
        - Multiple ProjectMember/job-role rows for the same
        employee and project count as one project.
        - A project assigned to the employee as Team Leader
        also counts as one project.
        - If the employee is both Team Leader and ProjectMember
        on the same project, it still counts as one project.
        - Only STARTED projects consume project capacity.
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

                Project.status
                == ProjectStatus.STARTED,

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

    def get_employee_reviewer_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> EmployeeReviewerJobRole | None:
        return self.db.scalar(
            select(EmployeeReviewerJobRole).where(
                EmployeeReviewerJobRole.employee_id
                == employee_id,
                EmployeeReviewerJobRole.job_role_id
                == job_role_id,
            )
        )

    def assign_reviewer_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> EmployeeReviewerJobRole:
        reviewer_job_role = EmployeeReviewerJobRole(
            employee_id=employee_id,
            job_role_id=job_role_id,
        )

        self.db.add(reviewer_job_role)
        self.db.flush()

        return reviewer_job_role

    def remove_reviewer_job_role(
        self,
        *,
        reviewer_job_role: EmployeeReviewerJobRole,
    ) -> None:
        self.db.delete(reviewer_job_role)
        self.db.flush()

    def delete_employee_reviewer_job_roles(
        self,
        *,
        employee_id: int,
    ) -> None:
        assignments = self.db.scalars(
            select(EmployeeReviewerJobRole).where(
                EmployeeReviewerJobRole.employee_id
                == employee_id,
            )
        ).all()

        for assignment in assignments:
            self.db.delete(assignment)

        self.db.flush()

    def replace_employee_reviewer_job_roles(
        self,
        *,
        employee_id: int,
        job_role_ids: list[int],
    ) -> list[EmployeeReviewerJobRole]:
        self.delete_employee_reviewer_job_roles(
            employee_id=employee_id,
        )

        assignments: list[EmployeeReviewerJobRole] = []

        for job_role_id in dict.fromkeys(job_role_ids):
            assignment = EmployeeReviewerJobRole(
                employee_id=employee_id,
                job_role_id=job_role_id,
            )

            self.db.add(assignment)
            assignments.append(assignment)

        self.db.flush()

        return assignments

    # ========================================================
    # Job Role Validation / Lookup
    # ========================================================

    def get_job_role(
        self,
        *,
        organization_id: int,
        job_role_id: int,
    ) -> OrganizationJobRole | None:

        return self.db.scalar(
            select(OrganizationJobRole).where(
                OrganizationJobRole.id == job_role_id,
                OrganizationJobRole.organization_id
                == organization_id,
            )
        )

    # ========================================================
    # Team Leader Candidates
    # ========================================================

    def get_team_leader_candidates(
        self,
        *,
        organization_id: int,
    ) -> list[Employee]:

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
            .where(
                Employee.organization_id
                == organization_id,
                Employee.is_team_leader.is_(True),
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
                User.is_active.is_(True),
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                User.email.asc(),
                Employee.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
    # Reviewer Candidates
    # ========================================================

    def get_reviewer_candidates(
        self,
        *,
        organization_id: int,
    ) -> list[Employee]:

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
            .where(
                Employee.organization_id
                == organization_id,
                Employee.is_reviewer.is_(True),
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
                User.is_active.is_(True),
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                User.email.asc(),
                Employee.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
    # User
    # ========================================================

    def get_user_by_id(
        self,
        *,
        user_id: int,
    ) -> User | None:

        return self.db.scalar(
            select(User).where(
                User.id == user_id,
            )
        )

    # ========================================================
    # Membership
    # ========================================================

    def get_membership(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> OrganizationMembership | None:

        return self.db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.user_id
                == user_id,
            )
        )

    def update_team_leader(
        self,
        *,
        membership: OrganizationMembership,
        team_leader_id: int | None,
    ) -> OrganizationMembership:

        membership.team_leader_id = (
            team_leader_id
        )

        self.db.flush()

        return membership

    # ========================================================
    # Team Leaders
    # ========================================================

    def get_team_leaders(
        self,
        *,
        organization_id: int,
    ) -> list[Employee]:

        statement = (
            select(Employee)
            .join(
                User,
                User.id == Employee.user_id,
            )
            .where(
                Employee.organization_id
                == organization_id,
                Employee.is_team_leader.is_(True),
                User.is_active.is_(True),
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                User.email.asc(),
                Employee.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
    # Reviewers
    # ========================================================

    def get_reviewers(
        self,
        *,
        organization_id: int,
    ) -> list[Employee]:

        statement = (
            select(Employee)
            .join(
                User,
                User.id == Employee.user_id,
            )
            .where(
                Employee.organization_id
                == organization_id,
                Employee.is_reviewer.is_(True),
                User.is_active.is_(True),
            )
            .options(
                selectinload(Employee.user),
                selectinload(Employee.job_roles).selectinload(
                    EmployeeJobRole.job_role
                ),
            )
            .order_by(
                User.email.asc(),
                Employee.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    def get_memberships_with_team_leader(
        self,
        *,
        organization_id: int,
        team_leader_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.team_leader_id == team_leader_id,
                OrganizationMembership.is_active.is_(True),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )
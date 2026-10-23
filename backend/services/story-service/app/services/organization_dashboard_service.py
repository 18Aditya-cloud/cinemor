from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.membership import OrganizationRole
from app.repositories.auth_repository import AuthRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.organization_dashboard_repository import (
    OrganizationDashboardRepository,
)
from app.core.security import (
    hash_password,
    verify_password_with_dummy_hash,
)

from app.services.auth_service import AuthService
from app.services.employee_removal_service import check_responsibility_change

class OrganizationDashboardService:
    """
    Business logic for the organization administrator dashboard.

    OrganizationMembership stores:
        - organization membership
        - system role
        - active status
        - assigned team leader

    Employee stores:
        - maximum concurrent projects
        - Team Leader responsibility
        - Reviewer responsibility

    EmployeeJobRole stores:
        - organization-specific production/job roles

    Transaction ownership remains in this service layer.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

        self.repository = OrganizationDashboardRepository(
            db
        )

        self.auth_repository = AuthRepository(db)

        self.employee_repository = EmployeeRepository(
            db
        )

    # ============================================================
    # Authorization
    # ============================================================

    def _require_admin(
        self,
        *,
        user_id: int,
        organization_id: int,
    ):
        """
        Require the actor to be an active organization
        administrator.
        """

        membership = (
            self.auth_repository.get_active_membership(
                user_id=user_id,
                organization_id=organization_id,
            )
        )

        if membership is None:
            raise PermissionError(
                "You are not an active member of this organization."
            )

        if membership.role != OrganizationRole.ADMIN:
            raise PermissionError(
                "Only organization administrators can perform "
                "this action."
            )

        return membership

    # ============================================================
    # Dashboard
    # ============================================================

    def get_dashboard(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> dict:
        """
        Return the complete organization administrator
        dashboard.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        organization = (
            self.repository.get_organization(
                organization_id=organization_id,
            )
        )

        if organization is None:
            raise ValueError(
                "Organization not found."
            )

        clients = self.repository.get_clients(
            organization_id=organization_id,
        )

        employees = (
            self.repository.get_employee_memberships(
                organization_id=organization_id,
            )
        )

        job_roles = self.repository.get_job_roles(
            organization_id=organization_id,
        )

        employee_data = []

        for membership in employees:

            employee = (
                self.repository.get_employee_by_user(
                    organization_id=organization_id,
                    user_id=membership.user_id,
                )
            )

            if employee is None:
                continue

            employee_job_roles = (
                self.repository.get_employee_job_roles(
                    employee_id=employee.id,
                )
            )

            reviewer_job_roles = (
                self.employee_repository
                .get_employee_reviewer_job_roles(
                    employee_id=employee.id,
                )
            )

            reviewer_job_role_ids = [
                assignment.job_role_id
                for assignment in reviewer_job_roles
            ]

            job_role_names = [
                assignment.job_role.name
                for assignment in employee_job_roles
                if assignment.job_role is not None
            ]

            current_project_count = (
                self.repository.count_employee_active_projects(
                    user_id=membership.user_id,
                    organization_id=organization_id,
                )
            )

            max_projects = (
                employee.max_concurrent_projects
            )

            available_capacity = None

            if max_projects is not None:
                available_capacity = max(
                    max_projects - current_project_count,
                    0,
                )

            employee_data.append(
                {
                    "user_id": membership.user_id,
                    "email": membership.user.email,
                    "system_role": membership.role.value,
                    "job_roles": job_role_names,
                    "max_concurrent_projects": max_projects,
                    "current_project_count": (
                        current_project_count
                    ),
                    "available_project_capacity": (
                        available_capacity
                    ),
                    "is_team_leader": (
                        employee.is_team_leader
                    ),
                    "is_reviewer": (
                        employee.is_reviewer
                    ),
                    "reviewer_job_role_ids": reviewer_job_role_ids,
                    "team_leader_id": (
                        membership.team_leader_id
                    ),
                    "is_active": (
                        membership.is_active
                    ),
                }
            )

        total_projects = self.repository.count_projects(
            organization_id=organization_id,
        )

        ongoing_projects = (
            self.repository.count_ongoing_projects(
                organization_id=organization_id,
            )
        )

        completed_projects = (
            self.repository.count_completed_projects(
                organization_id=organization_id,
            )
        )

        aborted_projects = (
            self.repository.count_aborted_projects(
                organization_id=organization_id,
            )
        )

        return {
            "organization": organization,
            "statistics": {
                "total_clients": len(clients),
                "total_employees": len(employees),
                "total_projects": total_projects,
                "ongoing_projects": ongoing_projects,
                "completed_projects": completed_projects,
                "aborted_projects": aborted_projects,
            },
            "clients": clients,
            "employees": employee_data,
            "job_roles": job_roles,
        }

    def update_organization_profile(
        self,
        *,
        user_id: int,
        organization_id: int,
        name: str,
        business_type: str,
        official_address: str,
    ):
        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        organization = (
            self.auth_repository.get_organization_by_id(
                organization_id,
            )
        )

        if organization is None:
            raise ValueError(
                "Organization not found."
            )

        organization = (
            self.auth_repository.update_organization_profile(
                organization=organization,
                name=name.strip(),
                business_type=business_type.strip(),
                official_address=official_address.strip(),
            )
        )

        self.db.commit()
        self.db.refresh(organization)

        return organization

    def change_organization_admin_password(
        self,
        *,
        user_id: int,
        organization_id: int,
        new_password: str,
        confirm_password: str,
    ):
        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        if new_password != confirm_password:
            raise ValueError(
                "Passwords do not match."
            )

        if len(new_password) < 12:
            raise ValueError(
                "Password must be at least 12 characters long."
            )

        if len(new_password) > 128:
            raise ValueError(
                "Password must not exceed 128 characters."
            )

        if not any(
            character.islower()
            for character in new_password
        ):
            raise ValueError(
                "Password must contain at least one lowercase letter."
            )

        if not any(
            character.isupper()
            for character in new_password
        ):
            raise ValueError(
                "Password must contain at least one uppercase letter."
            )

        if not any(
            character.isdigit()
            for character in new_password
        ):
            raise ValueError(
                "Password must contain at least one number."
            )

        if not any(
            not character.isalnum()
            for character in new_password
        ):
            raise ValueError(
                "Password must contain at least one special character."
            )

        user = self.auth_repository.get_user_by_id(
            user_id,
        )

        if user is None:
            raise ValueError(
                "User not found."
            )

        user.password_hash = hash_password(
            new_password,
        )

        self.auth_repository.revoke_all_user_refresh_sessions(
            user_id=user.id,
        )

        self.db.commit()

        return {
            "message": "Password updated successfully.",
        }

    # ============================================================
    # Employees
    # ============================================================

    def get_employees(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> dict:
        """
        Return accepted employees and pending invitations.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        accepted_memberships = (
            self.repository.get_accepted_employees(
                organization_id=organization_id,
            )
        )

        pending_invitations = (
            self.repository.get_pending_employee_invitations(
                organization_id=organization_id,
            )
        )

        employees = []

        # --------------------------------------------------------
        # Accepted employees
        # --------------------------------------------------------

        for membership in accepted_memberships:

            employee = (
                self.repository.get_employee_by_user(
                    organization_id=organization_id,
                    user_id=membership.user_id,
                )
            )

            if employee is None:
                continue

            employee_job_roles = (
                self.repository.get_employee_job_roles(
                    employee_id=employee.id,
                )
            )

            reviewer_job_roles = (
                self.employee_repository
                .get_employee_reviewer_job_roles(
                    employee_id=employee.id,
                )
            )

            reviewer_job_role_ids = [
                assignment.job_role_id
                for assignment in reviewer_job_roles
            ]

            job_role_names = [
                assignment.job_role.name
                for assignment in employee_job_roles
                if assignment.job_role is not None
            ]

            current_project_count = (
                self.repository.count_employee_active_projects(
                    user_id=membership.user_id,
                    organization_id=organization_id,
                )
            )

            max_projects = (
                employee.max_concurrent_projects
            )

            available_capacity = None

            if max_projects is not None:
                available_capacity = max(
                    max_projects - current_project_count,
                    0,
                )

            employees.append(
                {
                    "status": "accepted",
                    "user_id": membership.user_id,
                    "invitation_id": None,
                    "email": membership.user.email,
                    "system_role": membership.role.value,
                    "job_roles": job_role_names,
                    "max_concurrent_projects": max_projects,
                    "current_project_count": (
                        current_project_count
                    ),
                    "available_project_capacity": (
                        available_capacity
                    ),
                    "is_team_leader": (
                        employee.is_team_leader
                    ),
                    "is_reviewer": (
                        employee.is_reviewer
                    ),
                    "reviewer_job_role_ids": reviewer_job_role_ids,
                    "team_leader_id": (
                        membership.team_leader_id
                    ),
                    "joined_at": membership.joined_at,
                    "created_at": None,
                    "expires_at": None,
                }
            )

        # --------------------------------------------------------
        # Pending invitations
        # --------------------------------------------------------

        for invitation in pending_invitations:

            job_role_name = None

            if invitation.job_role is not None:
                job_role_name = invitation.job_role.name

            employees.append(
                {
                    "status": "pending",
                    "user_id": None,
                    "invitation_id": invitation.id,
                    "email": invitation.email,
                    "system_role": invitation.system_role,
                    "job_roles": (
                        [job_role_name]
                        if job_role_name
                        else []
                    ),
                    "max_concurrent_projects": (
                        invitation.max_concurrent_projects
                    ),
                    "current_project_count": None,
                    "available_project_capacity": None,
                    "is_team_leader": False,
                    "is_reviewer": False,
                    "reviewer_job_role_ids": [],
                    "team_leader_id": None,
                    "joined_at": None,
                    "created_at": invitation.created_at,
                    "expires_at": invitation.expires_at,
                }
            )

        accepted_count = len(
            accepted_memberships
        )

        pending_count = len(
            pending_invitations
        )

        return {
            "employees": employees,
            "total": (
                accepted_count
                + pending_count
            ),
            "accepted": accepted_count,
            "pending": pending_count,
        }

    # ============================================================
    # Search Employees
    # ============================================================

    def search_employees(
        self,
        *,
        user_id: int,
        organization_id: int,
        search: str | None = None,
        job_role_id: int | None = None,
        role: str | None = None,
    ):
        """
        Search active employees.

        Search:
            Matches employee email.

        job_role_id:
            Filters by organization job role.

        role:
            Supported values:
                employee
                team_leader
                reviewer
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        search = (
            search.strip().lower()
            if search
            else None
        )

        normalized_role = (
            role.strip().lower()
            if role
            else None
        )

        valid_roles = {
            "employee",
            "team_leader",
            "reviewer",
        }

        if (
            normalized_role is not None
            and normalized_role not in valid_roles
        ):
            raise ValueError(
                "Invalid employee role. "
                "Use employee, team_leader, or reviewer."
            )

        employees = (
            self.employee_repository
            .get_active_organization_employees(
                organization_id=organization_id,
            )
        )

        results = []

        for employee in employees:

            # ----------------------------------------------------
            # Email search
            # ----------------------------------------------------

            if search:
                email = (
                    employee.user.email
                    if employee.user is not None
                    else ""
                ).lower()

                if search not in email:
                    continue

            # ----------------------------------------------------
            # Responsibility filter
            # ----------------------------------------------------

            if normalized_role == "team_leader":
                if not employee.is_team_leader:
                    continue

            elif normalized_role == "reviewer":
                if not employee.is_reviewer:
                    continue

            elif normalized_role == "employee":
                if (
                    employee.is_team_leader
                    or employee.is_reviewer
                ):
                    continue

            # ----------------------------------------------------
            # Job role filter
            # ----------------------------------------------------

            if job_role_id is not None:

                assignment = (
                    self.employee_repository
                    .get_employee_job_role(
                        employee_id=employee.id,
                        job_role_id=job_role_id,
                    )
                )

                if assignment is None:
                    continue

            results.append(employee)

        return results

    # ============================================================
    # Team Leaders
    # ============================================================

    def get_team_leaders(
        self,
        *,
        user_id: int,
        organization_id: int,
        search: str | None = None,
    ):
        """
        Return active Team Leaders.

        Optional search filters by employee email.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        employees = (
            self.employee_repository
            .get_team_leader_candidates(
                organization_id=organization_id,
            )
        )

        if not search:
            return employees

        search = search.strip().lower()

        return [
            employee
            for employee in employees
            if employee.user is not None
            and search in employee.user.email.lower()
        ]

    # ============================================================
    # Reviewers
    # ============================================================

    def get_reviewers(
        self,
        *,
        user_id: int,
        organization_id: int,
        search: str | None = None,
    ):
        """
        Return active Reviewers.

        Optional search filters by employee email.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        employees = (
            self.employee_repository
            .get_reviewer_candidates(
                organization_id=organization_id,
            )
        )

        if not search:
            return employees

        search = search.strip().lower()

        return [
            employee
            for employee in employees
            if employee.user is not None
            and search in employee.user.email.lower()
        ]

    # ============================================================
    # Update Employee Project Capacity
    # ============================================================

    def update_employee_capacity(
        self,
        *,
        user_id: int,
        organization_id: int,
        target_user_id: int,
        max_concurrent_projects: int | None,
    ):
        """
        Update the maximum concurrent project capacity
        of an employee.

        None means no configured limit.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        if (
            max_concurrent_projects is not None
            and max_concurrent_projects < 1
        ):
            raise ValueError(
                "Maximum concurrent projects must be "
                "at least 1."
            )

        employee = (
            self.employee_repository
            .get_employee_by_user_for_update(
                organization_id=organization_id,
                user_id=target_user_id,
            )
        )

        if employee is None:
            raise ValueError(
                "Employee not found."
            )

        self.employee_repository.update_max_concurrent_projects(
            employee=employee,
            max_concurrent_projects=(
                max_concurrent_projects
            ),
        )

        self.db.commit()
        self.db.refresh(employee)

        return employee

    # ============================================================
    # Update Employee Responsibilities
    # ============================================================

        # ============================================================
    # Update Employee Responsibilities
    # ============================================================

    def update_employee_responsibilities(
        self,
        *,
        user_id: int,
        organization_id: int,
        target_user_id: int,
        is_team_leader: bool | None = None,
        is_reviewer: bool | None = None,
        reviewer_job_role_ids: list[int] | None = None,
    ):
        """
        Update Team Leader and Reviewer responsibilities.

        Reviewer job roles must already be assigned to the
        employee through EmployeeJobRole.

        If is_reviewer is False, all reviewer job roles are removed.

        If is_reviewer is True, reviewer_job_role_ids must contain
        only job roles already assigned to the employee.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        if (
            is_team_leader is None
            and is_reviewer is None
            and reviewer_job_role_ids is None
        ):
            raise ValueError(
                "At least one responsibility must be provided."
            )

        employee = (
            self.employee_repository
            .get_employee_by_user_for_update(
                organization_id=organization_id,
                user_id=target_user_id,
            )
        )

        if employee is None:
            raise ValueError(
                "Employee not found."
            )

        # A Team Leader / Reviewer post can only be taken away once the
        # person no longer holds it on a project that is not finished.
        check_responsibility_change(
            self.db,
            organization_id=organization_id,
            employee=employee,
            is_team_leader=is_team_leader,
            is_reviewer=is_reviewer,
            reviewer_job_role_ids=reviewer_job_role_ids,
        )
        
        # --------------------------------------------------------
        # If removing Team Leader responsibility, clear all
        # employees currently reporting to this Team Leader.
        # --------------------------------------------------------

        if is_team_leader is False:
            memberships = (
                self.employee_repository
                .get_memberships_with_team_leader(
                    organization_id=organization_id,
                    team_leader_id=target_user_id,
                )
            )

            for membership in memberships:
                membership.team_leader_id = None

        # --------------------------------------------------------
        # Reviewer role validation
        # --------------------------------------------------------

        if reviewer_job_role_ids is not None:

            # Remove duplicates while preserving order.
            reviewer_job_role_ids = list(
                dict.fromkeys(
                    reviewer_job_role_ids
                )
            )

            # If reviewer responsibility is explicitly disabled,
            # no reviewer job roles are allowed.
            if is_reviewer is False:
                if reviewer_job_role_ids:
                    raise ValueError(
                        "Reviewer job roles cannot be assigned "
                        "when Reviewer responsibility is disabled."
                    )

            # If reviewer responsibility is enabled, at least
            # one reviewer job role must be supplied.
            elif is_reviewer is True:
                if not reviewer_job_role_ids:
                    raise ValueError(
                        "Select at least one job role for which "
                        "this employee will be a Reviewer."
                    )

            # If reviewer_job_role_ids are supplied without
            # changing is_reviewer, make sure the employee is
            # already a reviewer.
            elif not employee.is_reviewer:
                raise ValueError(
                    "Reviewer responsibility must be enabled "
                    "before assigning reviewer job roles."
                )

            # ----------------------------------------------------
            # Get employee's currently assigned job roles.
            # ----------------------------------------------------

            employee_job_roles = (
                self.employee_repository
                .get_employee_job_roles(
                    employee_id=employee.id,
                )
            )

            assigned_job_role_ids = {
                assignment.job_role_id
                for assignment in employee_job_roles
            }

            # ----------------------------------------------------
            # Ensure every reviewer role is already assigned
            # to this employee.
            # ----------------------------------------------------

            invalid_reviewer_role_ids = [
                job_role_id
                for job_role_id in reviewer_job_role_ids
                if job_role_id not in assigned_job_role_ids
            ]

            if invalid_reviewer_role_ids:
                raise ValueError(
                    "Reviewer job roles must be selected "
                    "from the employee's assigned job roles."
                )

            # ----------------------------------------------------
            # Replace reviewer job-role assignments.
            # ----------------------------------------------------

            self.employee_repository.replace_employee_reviewer_job_roles(
                employee_id=employee.id,
                job_role_ids=reviewer_job_role_ids,
            )

        # --------------------------------------------------------
        # If Reviewer responsibility is explicitly disabled and
        # reviewer_job_role_ids were not supplied, clear all
        # existing reviewer job roles.
        # --------------------------------------------------------

        elif is_reviewer is False:
            self.employee_repository.delete_employee_reviewer_job_roles(
                employee_id=employee.id,
            )

        # --------------------------------------------------------
        # Update basic responsibilities.
        # --------------------------------------------------------

        self.employee_repository.update_responsibilities(
            employee=employee,
            is_team_leader=is_team_leader,
            is_reviewer=is_reviewer,
        )

        self.db.commit()
        self.db.refresh(employee)

        return employee

    # ============================================================
    # Assign Job Role
    # ============================================================

    def assign_employee_job_role(
        self,
        *,
        user_id: int,
        organization_id: int,
        target_user_id: int,
        job_role_id: int,
    ):
        """
        Assign an organization-specific job role to an employee.

        This operation is idempotent:
        if the employee already has the job role, the existing
        assignment is returned instead of raising an error.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        employee = (
            self.employee_repository.get_employee_by_user(
                organization_id=organization_id,
                user_id=target_user_id,
            )
        )

        if employee is None:
            raise ValueError(
                "Employee not found."
            )

        job_role = (
            self.employee_repository.get_job_role(
                organization_id=organization_id,
                job_role_id=job_role_id,
            )
        )

        if job_role is None:
            raise ValueError(
                "Job role not found in this organization."
            )

        # --------------------------------------------------------
        # Existing assignment
        # --------------------------------------------------------

        existing = (
            self.employee_repository.get_employee_job_role(
                employee_id=employee.id,
                job_role_id=job_role_id,
            )
        )

        # Idempotent behavior:
        # already assigned = success, not 400
        if existing is not None:
            return existing

        # --------------------------------------------------------
        # Create assignment
        # --------------------------------------------------------

        try:
            assignment = (
                self.employee_repository.assign_job_role(
                    employee_id=employee.id,
                    job_role_id=job_role_id,
                )
            )

            self.db.commit()
            self.db.refresh(assignment)

            return assignment

        except IntegrityError as exc:
            self.db.rollback()

            # Another request may have assigned the same role
            # between our existence check and insert.
            existing = (
                self.employee_repository.get_employee_job_role(
                    employee_id=employee.id,
                    job_role_id=job_role_id,
                )
            )

            if existing is not None:
                return existing

            raise ValueError(
                "Unable to assign this job role to the employee."
            ) from exc

    # ============================================================
    # Remove Job Role
    # ============================================================

    def remove_employee_job_role(
        self,
        *,
        user_id: int,
        organization_id: int,
        target_user_id: int,
        job_role_id: int,
    ):
        """
        Remove one organization-specific job role
        from an employee.
        """

        self._require_admin(
            user_id=user_id,
            organization_id=organization_id,
        )

        employee = (
            self.employee_repository.get_employee_by_user(
                organization_id=organization_id,
                user_id=target_user_id,
            )
        )

        if employee is None:
            raise ValueError(
                "Employee not found."
            )

        job_role = (
            self.employee_repository.get_job_role(
                organization_id=organization_id,
                job_role_id=job_role_id,
            )
        )

        if job_role is None:
            raise ValueError(
                "Job role not found in this organization."
            )

        assignment = (
            self.employee_repository.get_employee_job_role(
                employee_id=employee.id,
                job_role_id=job_role_id,
            )
        )

        if assignment is None:
            raise ValueError(
                "This job role is not assigned "
                "to the employee."
            )

        self.employee_repository.remove_job_role(
            employee_job_role=assignment,
        )

        self.db.commit()

        return {
            "message": "Job role removed successfully."
        }
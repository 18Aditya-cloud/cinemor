from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload


from app.models.employee import Employee
from app.models.employee_job_role import EmployeeJobRole
from app.models.employee_invitation import EmployeeInvitation
from app.models.membership import (
    OrganizationMembership,
    OrganizationRole,
)
from app.models.organization import Organization
from app.models.organization_job_role import OrganizationJobRole
from app.models.organization_job_role_tool import (
    OrganizationJobRoleTool,
)
from app.models.organization_job_role_feature import (
    OrganizationJobRoleFeature,
)
from app.models.organization_tool import OrganizationTool
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.models.email_verification_token import EmailVerificationToken
from app.models.password_reset_token import (
    PasswordResetToken,
)

class AuthRepository:
    """
    Repository for authentication and organization onboarding.

    Responsibilities:
        - User queries/creation
        - Organization queries/creation
        - Organization membership queries/creation
        - Employee queries/creation
        - Employee job-role queries/creation
        - Employee invitation queries/creation
        - Organization job-role queries/creation
        - Refresh-token session management
        - Employee project-capacity queries

    Business rules and authorization belong to AuthService.

    Transaction ownership belongs to AuthService.

    Repository methods only query, mutate and flush.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ========================================================
    # User
    # ========================================================

    def create_password_reset_token(
        self,
        *,
        user_id: int,
        token_hash: str,
        expires_at,
    ) -> PasswordResetToken:
        reset_token = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        self.db.add(reset_token)
        self.db.flush()

        return reset_token


    def get_password_reset_token(
        self,
        *,
        token_hash: str,
    ) -> PasswordResetToken | None:
        statement = (
            select(PasswordResetToken)
            .where(
                PasswordResetToken.token_hash
                == token_hash,
            )
        )

        return self.db.scalar(statement)


    def mark_password_reset_token_used(
        self,
        *,
        reset_token: PasswordResetToken,
        used_at,
    ) -> PasswordResetToken:
        reset_token.used_at = used_at

        self.db.flush()

        return reset_token

    # ========================================================
    # Email verification
    # ========================================================

    def create_email_verification_token(
        self,
        *,
        user_id: int,
        token_hash: str,
        expires_at,
    ) -> EmailVerificationToken:
        token = EmailVerificationToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(token)
        self.db.flush()
        return token

    def get_email_verification_token_for_update(
        self,
        *,
        token_hash: str,
    ) -> EmailVerificationToken | None:
        return self.db.scalar(
            select(EmailVerificationToken)
            .where(EmailVerificationToken.token_hash == token_hash)
            .with_for_update()
        )

    def get_latest_email_verification_token(
        self,
        *,
        user_id: int,
    ) -> EmailVerificationToken | None:
        return self.db.scalar(
            select(EmailVerificationToken)
            .where(EmailVerificationToken.user_id == user_id)
            .order_by(EmailVerificationToken.id.desc())
            .limit(1)
        )

    def retire_email_verification_tokens(
        self,
        *,
        user_id: int,
        at,
    ) -> None:
        """Mark every still-open verification link of this user as used."""
        tokens = self.db.scalars(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == user_id,
                EmailVerificationToken.used_at.is_(None),
            )
        ).all()
        for token in tokens:
            token.used_at = at
        self.db.flush()

    def deactivate_user_memberships(
        self,
        *,
        user_id: int,
    ) -> None:
        memberships = self.db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.is_active.is_(True),
            )
        ).all()
        for membership in memberships:
            membership.is_active = False
        self.db.flush()

    def get_user_by_email(
        self,
        email: str,
    ) -> User | None:

        return self.db.scalar(
            select(User).where(
                User.email == email,
            )
        )

    def get_user_by_email_for_update(
        self,
        email: str,
    ) -> User | None:

        return self.db.scalar(
            select(User)
            .where(
                User.email == email,
            )
            .with_for_update()
        )

    def get_user_by_id(
        self,
        user_id: int,
    ) -> User | None:

        return self.db.scalar(
            select(User).where(
                User.id == user_id,
            )
        )

    def create_user(
        self,
        *,
        email: str,
        password_hash: str,
    ) -> User:

        user = User(
            email=email,
            password_hash=password_hash,
        )

        self.db.add(user)
        self.db.flush()

        return user

    # ========================================================
    # Organization
    # ========================================================

    def get_organization_by_id(
        self,
        organization_id: int,
    ) -> Organization | None:

        return self.db.scalar(
            select(Organization).where(
                Organization.id == organization_id,
            )
        )

    def update_organization_profile(
        self,
        *,
        organization,
        name: str,
        business_type: str,
        official_address: str,
    ):
        organization.name = name
        organization.business_type = business_type
        organization.official_address = official_address

        self.db.flush()

        return organization

    def create_organization(self) -> Organization:

        organization = Organization()

        self.db.add(organization)
        self.db.flush()

        return organization

    # ========================================================
    # Organization Membership
    # ========================================================

    def get_membership(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> OrganizationMembership | None:

        return self.db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id
                == organization_id,
            )
        )

    def get_membership_for_update(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> OrganizationMembership | None:

        return self.db.scalar(
            select(OrganizationMembership)
            .where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id
                == organization_id,
            )
            .with_for_update()
        )

    def get_active_membership(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> OrganizationMembership | None:

        return self.db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
            )
        )

    def get_active_user_memberships(
        self,
        user_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.is_active.is_(True),
            )
            .order_by(
                OrganizationMembership.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    def create_membership(
        self,
        *,
        organization_id: int,
        user_id: int,
        role: OrganizationRole,
        team_leader_id: int | None = None,
    ) -> OrganizationMembership:

        membership = OrganizationMembership(
            organization_id=organization_id,
            user_id=user_id,
            role=role,
            team_leader_id=team_leader_id,
        )

        self.db.add(membership)
        self.db.flush()

        return membership

    def get_organization_members(
        self,
        organization_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id
                == organization_id,
            )
            .options(
                joinedload(
                    OrganizationMembership.user
                ),
            )
            .order_by(
                OrganizationMembership.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    def get_active_organization_members(
        self,
        organization_id: int,
    ) -> list[OrganizationMembership]:

        statement = (
            select(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
            )
            .options(
                joinedload(
                    OrganizationMembership.user
                ),
            )
            .order_by(
                OrganizationMembership.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    # ========================================================
    # Membership Role
    # ========================================================

    def update_membership_role(
        self,
        *,
        membership: OrganizationMembership,
        role: OrganizationRole,
    ) -> OrganizationMembership:

        membership.role = role

        self.db.flush()

        return membership

    # ========================================================
    # Team Leader Assignment
    # ========================================================
    #
    # This is the employee's assigned team leader.
    #
    # It is NOT the same thing as:
    #
    #     Employee.is_team_leader
    #
    # Employee.is_team_leader determines whether an employee
    # has Team Leader responsibility.
    #
    # membership.team_leader_id identifies who leads
    # this particular employee.
    # ========================================================

    def update_membership_team_leader(
        self,
        *,
        membership: OrganizationMembership,
        team_leader_id: int | None,
    ) -> OrganizationMembership:

        membership.team_leader_id = team_leader_id

        self.db.flush()

        return membership

    # ========================================================
    # Membership Status
    # ========================================================

    def deactivate_membership(
        self,
        *,
        membership: OrganizationMembership,
    ) -> OrganizationMembership:

        membership.is_active = False

        self.db.flush()

        return membership

    def activate_membership(
        self,
        *,
        membership: OrganizationMembership,
    ) -> OrganizationMembership:

        membership.is_active = True

        self.db.flush()

        return membership

    # ========================================================
    # Organization Job Roles
    # ========================================================

    def get_organization_job_role(
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

    def get_job_role_by_name(
        self,
        *,
        organization_id: int,
        name: str,
    ) -> OrganizationJobRole | None:

        return self.db.scalar(
            select(OrganizationJobRole).where(
                OrganizationJobRole.organization_id
                == organization_id,
                OrganizationJobRole.name == name,
            )
        )

    def get_organization_job_roles(
        self,
        *,
        organization_id: int,
    ) -> list[OrganizationJobRole]:
        statement = (
            select(OrganizationJobRole)
            .options(
                selectinload(
                    OrganizationJobRole.tool_assignments
                )
                .selectinload(
                    OrganizationJobRoleTool.tool
                ),
                selectinload(
                    OrganizationJobRole.feature_assignments
                ),
            )
            .where(
                OrganizationJobRole.organization_id
                == organization_id,
            )
            .order_by(
                OrganizationJobRole.name.asc(),
                OrganizationJobRole.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).unique().all()
        )

    def get_job_roles_by_ids(
        self,
        *,
        organization_id: int,
        job_role_ids: list[int],
    ) -> list[OrganizationJobRole]:

        if not job_role_ids:
            return []

        statement = (
            select(OrganizationJobRole)
            .where(
                OrganizationJobRole.organization_id
                == organization_id,
                OrganizationJobRole.id.in_(job_role_ids),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    def create_job_role(
        self,
        *,
        organization_id: int,
        name: str,
        description: str | None = None,
    ) -> OrganizationJobRole:

        job_role = OrganizationJobRole(
            organization_id=organization_id,
            name=name,
            description=description,
        )

        self.db.add(job_role)
        self.db.flush()

        return job_role


    def get_organization_tools_by_ids(
        self,
        *,
        organization_id: int,
        tool_ids: list[int],
    ) -> list[OrganizationTool]:
        """
        Return tools belonging to the specified organization.
        """

        if not tool_ids:
            return []

        statement = (
            select(OrganizationTool)
            .where(
                OrganizationTool.organization_id == organization_id,
                OrganizationTool.id.in_(tool_ids),
                OrganizationTool.is_active.is_(True),
            )
            .order_by(
                OrganizationTool.name.asc(),
                OrganizationTool.id.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )


    def create_job_role_tool_assignments(
        self,
        *,
        job_role_id: int,
        tool_ids: list[int],
    ) -> list[OrganizationJobRoleTool]:
        """
        Create job-role -> tool assignments.
        """

        assignments: list[OrganizationJobRoleTool] = []

        for tool_id in tool_ids:
            assignment = OrganizationJobRoleTool(
                job_role_id=job_role_id,
                tool_id=tool_id,
            )

            self.db.add(assignment)
            assignments.append(assignment)

        self.db.flush()

        return assignments


    def create_job_role_feature_assignments(
        self,
        *,
        job_role_id: int,
        feature_keys: list[str],
    ) -> list[OrganizationJobRoleFeature]:
        """
        Create job-role -> Cinemor feature assignments.
        """

        assignments: list[OrganizationJobRoleFeature] = []

        for feature_key in feature_keys:
            assignment = OrganizationJobRoleFeature(
                job_role_id=job_role_id,
                feature_key=feature_key,
            )

            self.db.add(assignment)
            assignments.append(assignment)

        self.db.flush()

        return assignments

    def replace_job_role_tool_assignments(
        self,
        *,
        job_role_id: int,
        tool_ids: list[int],
    ) -> list[OrganizationJobRoleTool]:
        """
        Replace all tool assignments for a job role.
        """

        self.db.query(
            OrganizationJobRoleTool
        ).filter(
            OrganizationJobRoleTool.job_role_id == job_role_id,
        ).delete(
            synchronize_session=False
        )

        assignments: list[OrganizationJobRoleTool] = []

        for tool_id in tool_ids:
            assignment = OrganizationJobRoleTool(
                job_role_id=job_role_id,
                tool_id=tool_id,
            )

            self.db.add(assignment)
            assignments.append(assignment)

        self.db.flush()

        return assignments


    def replace_job_role_feature_assignments(
        self,
        *,
        job_role_id: int,
        feature_keys: list[str],
    ) -> list[OrganizationJobRoleFeature]:
        """
        Replace all Cinemor feature assignments for a job role.
        """

        self.db.query(
            OrganizationJobRoleFeature
        ).filter(
            OrganizationJobRoleFeature.job_role_id == job_role_id,
        ).delete(
            synchronize_session=False
        )

        assignments: list[OrganizationJobRoleFeature] = []

        for feature_key in feature_keys:
            assignment = OrganizationJobRoleFeature(
                job_role_id=job_role_id,
                feature_key=feature_key,
            )

            self.db.add(assignment)
            assignments.append(assignment)

        self.db.flush()

        return assignments

    # ========================================================
    # Employee
    # ========================================================

    def get_employee(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> Employee | None:

        return self.db.scalar(
            select(Employee).where(
                Employee.user_id == user_id,
                Employee.organization_id
                == organization_id,
            )
        )

    def get_employee_for_update(
        self,
        *,
        user_id: int,
        organization_id: int,
    ) -> Employee | None:

        return self.db.scalar(
            select(Employee)
            .where(
                Employee.user_id == user_id,
                Employee.organization_id
                == organization_id,
            )
            .with_for_update()
        )

    def get_employee_by_user(
        self,
        *,
        organization_id: int,
        user_id: int,
    ) -> Employee | None:

        statement = (
            select(Employee)
            .where(
                Employee.organization_id
                == organization_id,
                Employee.user_id == user_id,
            )
            .options(
                joinedload(Employee.user),
                joinedload(Employee.job_roles)
                .joinedload(EmployeeJobRole.job_role),
            )
        )

        return self.db.scalar(statement)

    def create_employee(
        self,
        *,
        organization_id: int,
        user_id: int,
        max_concurrent_projects: int | None = None,
        is_team_leader: bool = False,
        is_reviewer: bool = False,
    ) -> Employee:

        employee = Employee(
            organization_id=organization_id,
            user_id=user_id,
            max_concurrent_projects=max_concurrent_projects,
            is_team_leader=is_team_leader,
            is_reviewer=is_reviewer,
        )

        self.db.add(employee)
        self.db.flush()

        return employee

    def update_employee_project_capacity(
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

    def update_employee_responsibilities(
        self,
        *,
        employee: Employee,
        is_team_leader: bool | None = None,
        is_reviewer: bool | None = None,
    ) -> Employee:

        if is_team_leader is not None:
            employee.is_team_leader = is_team_leader

        if is_reviewer is not None:
            employee.is_reviewer = is_reviewer

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
                joinedload(
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

    def create_employee_job_role(
        self,
        *,
        employee_id: int,
        job_role_id: int,
    ) -> EmployeeJobRole:

        assignment = EmployeeJobRole(
            employee_id=employee_id,
            job_role_id=job_role_id,
        )

        self.db.add(assignment)
        self.db.flush()

        return assignment

    def delete_employee_job_roles(
        self,
        *,
        employee_id: int,
    ) -> None:

        assignments = self.db.scalars(
            select(EmployeeJobRole).where(
                EmployeeJobRole.employee_id
                == employee_id,
            )
        ).all()

        for assignment in assignments:
            self.db.delete(assignment)

        self.db.flush()

    def replace_employee_job_roles(
        self,
        *,
        employee: Employee,
        job_role_ids: list[int],
    ) -> Employee:

        self.delete_employee_job_roles(
            employee_id=employee.id,
        )

        for job_role_id in job_role_ids:
            self.db.add(
                EmployeeJobRole(
                    employee_id=employee.id,
                    job_role_id=job_role_id,
                )
            )

        self.db.flush()

        return employee

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
        Count projects currently consuming an employee's
        concurrent-project capacity.

        PENDING projects do not consume capacity.

        Only STARTED projects count.

        COMPLETED and ABORTED projects release the employee's
        project capacity.
        """

        statement = (
            select(
                func.count(ProjectMember.id)
            )
            .join(
                Project,
                Project.id == ProjectMember.project_id,
            )
            .where(
                ProjectMember.user_id == user_id,
                Project.organization_id == organization_id,
                Project.status == ProjectStatus.STARTED,
            )
        )

        return int(
            self.db.scalar(statement) or 0
        )

    # ========================================================
    # Employee Invitations
    # ========================================================

    def get_pending_invitation_by_email(
        self,
        *,
        organization_id: int,
        email: str,
    ) -> EmployeeInvitation | None:

        return self.db.scalar(
            select(EmployeeInvitation)
            .where(
                EmployeeInvitation.organization_id
                == organization_id,
                EmployeeInvitation.email == email,
                EmployeeInvitation.is_accepted.is_(False),
                EmployeeInvitation.revoked_at.is_(None),
            )
            .options(
                joinedload(
                    EmployeeInvitation.job_role
                ),
            )
        )

    def get_invitation_by_token_hash(
        self,
        *,
        token_hash: str,
    ) -> EmployeeInvitation | None:

        return self.db.scalar(
            select(EmployeeInvitation)
            .where(
                EmployeeInvitation.token_hash
                == token_hash,
            )
            .options(
                joinedload(
                    EmployeeInvitation.job_role
                ),
            )
        )

    def create_employee_invitation(
        self,
        *,
        organization_id: int,
        email: str,
        job_role_id: int,
        system_role: str,
        max_concurrent_projects: int | None,
        token_hash: str,
        expires_at: datetime,
    ) -> EmployeeInvitation:

        invitation = EmployeeInvitation(
            organization_id=organization_id,
            email=email,
            job_role_id=job_role_id,
            system_role=system_role,
            max_concurrent_projects=max_concurrent_projects,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        self.db.add(invitation)
        self.db.flush()

        return invitation

    def accept_employee_invitation(
        self,
        *,
        invitation: EmployeeInvitation,
        accepted_at: datetime,
    ) -> EmployeeInvitation:

        invitation.is_accepted = True
        invitation.accepted_at = accepted_at

        self.db.flush()

        return invitation

    # ========================================================
    # Refresh Sessions
    # ========================================================

    def get_refresh_session_by_hash(
        self,
        token_hash: str,
    ) -> RefreshSession | None:

        return self.db.scalar(
            select(RefreshSession).where(
                RefreshSession.token_hash
                == token_hash,
            )
        )

    def get_refresh_session_by_hash_for_update(
        self,
        token_hash: str,
    ) -> RefreshSession | None:

        return self.db.scalar(
            select(RefreshSession)
            .where(
                RefreshSession.token_hash
                == token_hash,
            )
            .with_for_update()
        )

    def create_refresh_session(
        self,
        *,
        user_id: int,
        token_hash: str,
        expires_at: datetime,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> RefreshSession:

        refresh_session = RefreshSession(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        self.db.add(refresh_session)
        self.db.flush()

        return refresh_session

    def revoke_refresh_session(
        self,
        *,
        refresh_session: RefreshSession,
        replaced_by_token_hash: str | None = None,
        revoked_at: datetime | None = None,
    ) -> RefreshSession:

        refresh_session.revoked_at = revoked_at
        refresh_session.replaced_by_token_hash = (
            replaced_by_token_hash
        )

        self.db.flush()

        return refresh_session

    def revoke_all_user_refresh_sessions(
        self,
        *,
        user_id: int,
        revoked_at: datetime | None = None,
    ) -> int:

        statement = (
            select(RefreshSession)
            .where(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_(None),
            )
            .with_for_update()
        )

        sessions = list(
            self.db.scalars(statement).all()
        )

        if not sessions:
            return 0

        timestamp = (
            revoked_at
            if revoked_at is not None
            else datetime.now().astimezone()
        )

        for session in sessions:
            session.revoked_at = timestamp

        self.db.flush()

        return len(sessions)
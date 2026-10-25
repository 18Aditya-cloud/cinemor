from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.membership import OrganizationRole
from app.repositories.auth_repository import AuthRepository
from app.repositories.client_repository import ClientRepository
from app.models.user import User, AccountType
from app.models.project import Project, ProjectStatus
from sqlalchemy import func, select

class ClientService:
    """
    Business logic for organization client management.

    Organization administrators:
        - create clients
        - update clients
        - delete clients

    Active organization members:
        - view clients
        - search clients

    Transaction ownership remains in this service layer.
    """

    def __init__(self, db: Session):
        self.db = db
        self.auth_repository = AuthRepository(db)
        self.repository = ClientRepository(db)

    # ========================================================
    # Authorization
    # ========================================================

    def _require_admin(
        self,
        *,
        user_id: int,
        organization_id: int,
    ):
        """
        Verify that the authenticated user is an active
        organization administrator.
        """

        membership = self.auth_repository.get_active_membership(
            user_id=user_id,
            organization_id=organization_id,
        )

        if membership is None:
            raise PermissionError(
                "You are not an active member of this organization."
            )

        if membership.role != OrganizationRole.ADMIN:
            raise PermissionError(
                "Only organization administrators can manage clients."
            )

        return membership

    # ========================================================
    # Authorization: Active Member
    # ========================================================

    def _require_active_member(
        self,
        *,
        user_id: int,
        organization_id: int,
    ):
        """
        Verify that the authenticated user is an active
        member of the organization.
        """

        membership = self.auth_repository.get_active_membership(
            user_id=user_id,
            organization_id=organization_id,
        )

        if membership is None:
            raise PermissionError(
                "You are not an active member of this organization."
            )

        return membership

    # ========================================================
    # Create Client
    # ========================================================

    def create_client(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        name: str,
        email: str,
        phone: str | None = None,
    ):
        """
        Create a new client for an organization.

        Only organization administrators can create clients.
        """

        self._require_admin(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        name = name.strip()
        email = email.strip().lower()

        if not name:
            raise ValueError(
                "Client name cannot be empty."
            )

        if not email:
            raise ValueError(
                "Client email cannot be empty."
            )

        if phone is not None:
            phone = phone.strip() or None

        existing_client = self.repository.get_client_by_email(
            organization_id=organization_id,
            email=email,
        )

        if existing_client is not None:
            raise ValueError(
                "A client with this email already exists "
                "in this organization."
            )

        try:
            client = self.repository.create_client(
                organization_id=organization_id,
                name=name,
                email=email,
                phone=phone,
            )

            self.db.commit()
            self.db.refresh(client)

            return client

        except IntegrityError as exc:
            self.db.rollback()

            raise ValueError(
                "A client with this email already exists "
                "in this organization."
            ) from exc

    # ========================================================
    # Get Client
    # ========================================================

    def get_client(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        client_id: int,
    ):
        """Get a client with live project statistics."""

        self._require_active_member(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        client = self.repository.get_client_by_id(
            organization_id=organization_id,
            client_id=client_id,
        )

        if client is None:
            raise ValueError("Client not found.")

        ongoing_projects = self.db.scalar(
            select(func.count(Project.id)).where(
                Project.organization_id == organization_id,
                Project.client_id == client_id,
                Project.status == ProjectStatus.STARTED,
            )
        ) or 0

        successfully_delivered_projects = self.db.scalar(
            select(func.count(Project.id)).where(
                Project.organization_id == organization_id,
                Project.client_id == client_id,
                Project.status == ProjectStatus.COMPLETED,
            )
        ) or 0

        return {
            "id": client.id,
            "organization_id": client.organization_id,
            "name": client.name,
            "email": client.email,
            "phone": client.phone,
            "ongoing_projects": ongoing_projects,
            "successfully_delivered_projects": (
                successfully_delivered_projects
            ),
            "created_at": client.created_at,
            "updated_at": client.updated_at,
        }

    # ========================================================
    # List / Search Clients
    # ========================================================

    def get_clients(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        search: str | None = None,
    ):
        """
        Get all clients belonging to an organization,
        including their ongoing and successfully delivered
        project counts.
        """
        self._require_active_member(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        clients = self.repository.get_organization_clients(
            organization_id=organization_id,
            search=search,
        )

        if not clients:
            return []

        client_ids = [client.id for client in clients]

        # Fetch project counts for all listed clients in one query.
        project_counts = self.db.execute(
            select(
                Project.client_id,
                Project.status,
                func.count(Project.id).label("project_count"),
            ).where(
                Project.organization_id == organization_id,
                Project.client_id.in_(client_ids),
                Project.status.in_(
                    [ProjectStatus.STARTED, ProjectStatus.COMPLETED]
                ),
            ).group_by(
                Project.client_id,
                Project.status,
            )
        ).all()

        counts_by_client = {
            client_id: {
                "ongoing_projects": 0,
                "successfully_delivered_projects": 0,
            }
            for client_id in client_ids
        }

        for client_id, project_status, project_count in project_counts:
            if project_status == ProjectStatus.STARTED:
                counts_by_client[client_id]["ongoing_projects"] = project_count
            elif project_status == ProjectStatus.COMPLETED:
                counts_by_client[client_id][
                    "successfully_delivered_projects"
                ] = project_count

        return [
            {
                "id": client.id,
                "organization_id": client.organization_id,
                "name": client.name,
                "email": client.email,
                "phone": client.phone,
                "ongoing_projects": counts_by_client[client.id][
                    "ongoing_projects"
                ],
                "successfully_delivered_projects": counts_by_client[
                    client.id
                ]["successfully_delivered_projects"],
                "created_at": client.created_at,
                "updated_at": client.updated_at,
            }
            for client in clients
        ]

    # ========================================================
    # Update Client
    # ========================================================

    def update_client(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        client_id: int,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
    ):
        """
        Update an existing client.

        Only organization administrators can update clients.
        """

        self._require_admin(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        client = self.repository.get_client_by_id(
            organization_id=organization_id,
            client_id=client_id,
        )

        if client is None:
            raise ValueError(
                "Client not found."
            )

        if name is not None:
            name = name.strip()

            if not name:
                raise ValueError(
                    "Client name cannot be empty."
                )

        if email is not None:
            email = email.strip().lower()

            if not email:
                raise ValueError(
                    "Client email cannot be empty."
                )

            existing_client = (
                self.repository.get_client_by_email(
                    organization_id=organization_id,
                    email=email,
                )
            )

            if (
                existing_client is not None
                and existing_client.id != client.id
            ):
                raise ValueError(
                    "A client with this email already exists "
                    "in this organization."
                )

        if phone is not None:
            phone = phone.strip() or None

        try:
            client = self.repository.update_client(
                client=client,
                name=name,
                email=email,
                phone=phone,
            )

            self.db.commit()
            self.db.refresh(client)

            return client

        except IntegrityError as exc:
            self.db.rollback()

            raise ValueError(
                "A client with this email already exists "
                "in this organization."
            ) from exc

    # ========================================================
    # Delete Client
    # ========================================================

    def delete_client(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        client_id: int,
    ) -> None:
        """
        Delete an existing client.

        Only organization administrators can delete clients.

        A client referenced by an existing project cannot be
        deleted because of the project foreign-key constraint.
        """

        self._require_admin(
            user_id=actor_user_id,
            organization_id=organization_id,
        )

        client = self.repository.get_client_by_id(
            organization_id=organization_id,
            client_id=client_id,
        )

        if client is None:
            raise ValueError(
                "Client not found."
            )

        try:
            user = (
                self.db.query(User)
                .filter(
                    User.email == client.email,
                    User.account_type == AccountType.CLIENT,
                )
                .first()
            )
            self.repository.delete_client(
                client=client,
            )
            if user is not None:
                self.db.delete(user)

            self.db.commit()

        except IntegrityError as exc:
            self.db.rollback()

            raise ValueError(
                "Client cannot be deleted because it is "
                "associated with existing projects."
            ) from exc
from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.client import Client


class ClientRepository:
    """
    Database operations for organization clients.

    Transaction ownership remains in the service layer.

    This repository only performs database operations and does
    not contain authorization or business rules.
    """

    def __init__(self, db: Session):
        self.db = db

    # ========================================================
    # Create
    # ========================================================

    def create_client(
        self,
        *,
        organization_id: int,
        name: str,
        email: str,
        phone: str | None = None,
    ) -> Client:

        client = Client(
            organization_id=organization_id,
            name=name,
            email=email,
            phone=phone,
        )

        self.db.add(client)
        self.db.flush()

        return client

    # ========================================================
    # Get by ID
    # ========================================================

    def get_client_by_id(
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
    # Get by Email
    # ========================================================

    def get_client_by_email(
        self,
        *,
        organization_id: int,
        email: str,
    ) -> Client | None:

        return self.db.scalar(
            select(Client).where(
                Client.organization_id == organization_id,
                func.lower(Client.email) == email.lower(),
            )
        )

    # ========================================================
    # List / Search Organization Clients
    # ========================================================

    def get_organization_clients(
        self,
        *,
        organization_id: int,
        search: str | None = None,
    ) -> list[Client]:

        statement = (
            select(Client)
            .where(
                Client.organization_id == organization_id,
            )
            .order_by(
                Client.name.asc(),
                Client.id.asc(),
            )
        )

        if search:
            term = f"%{search.strip()}%"

            statement = statement.where(
                or_(
                    Client.name.ilike(term),
                    Client.email.ilike(term),
                    Client.phone.ilike(term),
                )
            )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
    # Update
    # ========================================================

    def update_client(
        self,
        *,
        client: Client,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
    ) -> Client:

        if name is not None:
            client.name = name

        if email is not None:
            client.email = email

        if phone is not None:
            client.phone = phone

        self.db.flush()

        return client

    # ========================================================
    # Delete
    # ========================================================

    def delete_client(
        self,
        *,
        client: Client,
    ) -> None:

        self.db.delete(client)
        self.db.flush()
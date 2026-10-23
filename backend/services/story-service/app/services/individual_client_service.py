from sqlalchemy.orm import Session

from app.repositories.individual_client_repository import (
    IndividualClientRepository,
)


class IndividualClientService:

    def __init__(self, db: Session):
        self.repository = IndividualClientRepository(db)

    def create_client(
        self,
        *,
        individual_user_id: int,
        name: str,
        email: str | None = None,
        phone: str | None = None,
        company_name: str | None = None,
    ):

        name = str(name or "").strip()

        if not name:
            raise ValueError(
                "Client name is required."
            )

        if email is not None:
            email = str(email).strip().lower() or None

        if phone is not None:
            phone = str(phone).strip() or None

        if company_name is not None:
            company_name = (
                str(company_name).strip() or None
            )

        return self.repository.create(
            individual_user_id=individual_user_id,
            name=name,
            email=email,
            phone=phone,
            company_name=company_name,
        )

    def get_clients(
        self,
        *,
        individual_user_id: int,
    ):

        return self.repository.get_all(
            individual_user_id=individual_user_id,
        )

    def get_client(
        self,
        *,
        individual_user_id: int,
        client_id: int,
    ):

        client = self.repository.get_by_id(
            individual_user_id=individual_user_id,
            client_id=client_id,
        )

        if client is None:
            raise ValueError(
                "Client not found."
            )

        return client

    def update_client(
        self,
        *,
        individual_user_id: int,
        client_id: int,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        company_name: str | None = None,
    ):

        client = self.get_client(
            individual_user_id=individual_user_id,
            client_id=client_id,
        )

        if name is not None:
            name = str(name).strip()

            if not name:
                raise ValueError(
                    "Client name cannot be empty."
                )

        if email is not None:
            email = (
                str(email).strip().lower() or None
            )

        if phone is not None:
            phone = str(phone).strip() or None

        if company_name is not None:
            company_name = (
                str(company_name).strip() or None
            )

        return self.repository.update(
            client=client,
            name=name,
            email=email,
            phone=phone,
            company_name=company_name,
        )

    def delete_client(
        self,
        *,
        individual_user_id: int,
        client_id: int,
    ):

        client = self.get_client(
            individual_user_id=individual_user_id,
            client_id=client_id,
        )

        self.repository.delete(
            client=client,
        )
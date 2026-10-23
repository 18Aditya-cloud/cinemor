from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.individual_client import IndividualClient


class IndividualClientRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        individual_user_id: int,
        name: str,
        email: str | None = None,
        phone: str | None = None,
        company_name: str | None = None,
    ) -> IndividualClient:

        client = IndividualClient(
            individual_user_id=individual_user_id,
            name=name,
            email=email,
            phone=phone,
            company_name=company_name,
        )

        self.db.add(client)
        self.db.flush()
        self.db.refresh(client)

        return client

    def get_by_id(
        self,
        *,
        individual_user_id: int,
        client_id: int,
    ) -> IndividualClient | None:

        statement = (
            select(IndividualClient)
            .where(
                IndividualClient.id == client_id,
                IndividualClient.individual_user_id
                == individual_user_id,
            )
        )

        return self.db.scalar(statement)

    def get_all(
        self,
        *,
        individual_user_id: int,
    ) -> list[IndividualClient]:

        statement = (
            select(IndividualClient)
            .where(
                IndividualClient.individual_user_id
                == individual_user_id
            )
            .order_by(
                IndividualClient.created_at.desc()
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    def update(
        self,
        *,
        client: IndividualClient,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        company_name: str | None = None,
    ) -> IndividualClient:

        if name is not None:
            client.name = name

        if email is not None:
            client.email = email

        if phone is not None:
            client.phone = phone

        if company_name is not None:
            client.company_name = company_name

        self.db.flush()
        self.db.refresh(client)

        return client

    def delete(
        self,
        *,
        client: IndividualClient,
    ) -> None:

        self.db.delete(client)
        self.db.flush()
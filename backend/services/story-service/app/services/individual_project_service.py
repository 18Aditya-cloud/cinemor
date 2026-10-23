from datetime import date

from sqlalchemy.orm import Session

from app.repositories.individual_client_repository import (
    IndividualClientRepository,
)
from app.repositories.individual_project_repository import (
    IndividualProjectRepository,
)


class IndividualProjectService:

    def __init__(self, db: Session):
        self.project_repository = (
            IndividualProjectRepository(db)
        )

        self.client_repository = (
            IndividualClientRepository(db)
        )

    def create_project(
        self,
        *,
        individual_user_id: int,
        title: str,
        description: str | None = None,
        project_type: str = "self",
        client_id: int | None = None,
        started_date: date | None = None,
        deadline: date | None = None,
    ):

        title = str(title or "").strip()

        if not title:
            raise ValueError(
                "Project title is required."
            )

        if project_type not in {
            "self",
            "client",
        }:
            raise ValueError(
                "Project type must be self or client."
            )

        if project_type == "self":
            client_id = None

        if project_type == "client":

            if client_id is None:
                raise ValueError(
                    "Client is required for a client project."
                )

            client = self.client_repository.get_by_id(
                individual_user_id=individual_user_id,
                client_id=client_id,
            )

            if client is None:
                raise ValueError(
                    "Selected client was not found."
                )

        if started_date and deadline:
            if deadline < started_date:
                raise ValueError(
                    "Deadline cannot be before started date."
                )

        if description is not None:
            description = (
                str(description).strip() or None
            )

        return self.project_repository.create(
            individual_user_id=individual_user_id,
            title=title,
            description=description,
            project_type=project_type,
            client_id=client_id,
            started_date=started_date,
            deadline=deadline,
        )

    def get_projects(
        self,
        *,
        individual_user_id: int,
    ):

        return self.project_repository.get_all(
            individual_user_id=individual_user_id,
        )

    def get_project(
        self,
        *,
        individual_user_id: int,
        project_id: int,
    ):

        project = self.project_repository.get_by_id(
            individual_user_id=individual_user_id,
            project_id=project_id,
        )

        if project is None:
            raise ValueError(
                "Project not found."
            )

        return project

    def update_project(
        self,
        *,
        individual_user_id: int,
        project_id: int,
        title: str | None = None,
        description: str | None = None,
        project_type: str | None = None,
        client_id: int | None = None,
        started_date: date | None = None,
        deadline: date | None = None,
        status: str | None = None,
    ):

        project = self.get_project(
            individual_user_id=individual_user_id,
            project_id=project_id,
        )

        final_type = (
            project_type
            if project_type is not None
            else project.project_type
        )

        if final_type not in {
            "self",
            "client",
        }:
            raise ValueError(
                "Project type must be self or client."
            )

        if title is not None:
            title = str(title).strip()

            if not title:
                raise ValueError(
                    "Project title cannot be empty."
                )

        if description is not None:
            description = (
                str(description).strip() or None
            )

        if final_type == "self":
            client_id = None

        elif final_type == "client":

            final_client_id = (
                client_id
                if client_id is not None
                else project.client_id
            )

            if final_client_id is None:
                raise ValueError(
                    "Client is required for a client project."
                )

            client = self.client_repository.get_by_id(
                individual_user_id=individual_user_id,
                client_id=final_client_id,
            )

            if client is None:
                raise ValueError(
                    "Selected client was not found."
                )

            client_id = final_client_id

        final_started_date = (
            started_date
            if started_date is not None
            else project.started_date
        )

        final_deadline = (
            deadline
            if deadline is not None
            else project.deadline
        )

        if (
            final_started_date
            and final_deadline
            and final_deadline < final_started_date
        ):
            raise ValueError(
                "Deadline cannot be before started date."
            )

        if status is not None:
            if status not in {
                "pending",
                "started",
                "completed",
                "aborted",
            }:
                raise ValueError(
                    "Invalid project status."
                )

        return self.project_repository.update(
            project=project,
            title=title,
            description=description,
            project_type=project_type,
            client_id=client_id,
            started_date=started_date,
            deadline=deadline,
            status=status,
        )

    def delete_project(
        self,
        *,
        individual_user_id: int,
        project_id: int,
    ):

        project = self.get_project(
            individual_user_id=individual_user_id,
            project_id=project_id,
        )

        self.project_repository.delete(
            project=project,
        )
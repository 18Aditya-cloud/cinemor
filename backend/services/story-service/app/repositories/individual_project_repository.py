from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.individual_project import IndividualProject


class IndividualProjectRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        individual_user_id: int,
        title: str,
        description: str | None = None,
        project_type: str = "self",
        client_id: int | None = None,
        started_date=None,
        deadline=None,
    ) -> IndividualProject:

        project = IndividualProject(
            individual_user_id=individual_user_id,
            title=title,
            description=description,
            project_type=project_type,
            client_id=client_id,
            status="pending",
            started_date=started_date,
            deadline=deadline,
        )

        self.db.add(project)
        self.db.flush()
        self.db.refresh(project)

        return project

    def get_by_id(
        self,
        *,
        individual_user_id: int,
        project_id: int,
    ) -> IndividualProject | None:

        statement = (
            select(IndividualProject)
            .where(
                IndividualProject.id == project_id,
                IndividualProject.individual_user_id
                == individual_user_id,
            )
        )

        return self.db.scalar(statement)

    def get_all(
        self,
        *,
        individual_user_id: int,
    ) -> list[IndividualProject]:

        statement = (
            select(IndividualProject)
            .where(
                IndividualProject.individual_user_id
                == individual_user_id
            )
            .order_by(
                IndividualProject.updated_at.desc()
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    def update(
        self,
        *,
        project: IndividualProject,
        title: str | None = None,
        description: str | None = None,
        project_type: str | None = None,
        client_id: int | None = None,
        started_date=None,
        deadline=None,
        status: str | None = None,
    ) -> IndividualProject:

        if title is not None:
            project.title = title

        if description is not None:
            project.description = description

        if project_type is not None:
            project.project_type = project_type

        if client_id is not None:
            project.client_id = client_id

        if started_date is not None:
            project.started_date = started_date

        if deadline is not None:
            project.deadline = deadline

        if status is not None:
            project.status = status

        self.db.flush()
        self.db.refresh(project)

        return project

    def delete(
        self,
        *,
        project: IndividualProject,
    ) -> None:

        self.db.delete(project)
        self.db.flush()

    def count_total(
        self,
        *,
        individual_user_id: int,
    ) -> int:

        statement = select(
            func.count(IndividualProject.id)
        ).where(
            IndividualProject.individual_user_id
            == individual_user_id
        )

        return int(
            self.db.scalar(statement) or 0
        )

    def count_by_status(
        self,
        *,
        individual_user_id: int,
        status: str,
    ) -> int:

        statement = select(
            func.count(IndividualProject.id)
        ).where(
            IndividualProject.individual_user_id
            == individual_user_id,
            IndividualProject.status == status,
        )

        return int(
            self.db.scalar(statement) or 0
        )
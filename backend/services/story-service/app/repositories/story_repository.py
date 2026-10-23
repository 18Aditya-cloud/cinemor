from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.story import Story
from app.schemas.story_request import StoryRequest
from app.schemas.story_response import StoryResponse


class StoryRepository:
    """
    Handles all database operations related to stories.

    The repository is responsible only for persistence.
    It does not call OpenRouter and does not contain
    story-generation logic.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ---------------------------------------------------------
    # CREATE
    # ---------------------------------------------------------

    def create(
        self,
        request: StoryRequest,
        story: StoryResponse,
        individual_project_id: int | None = None,
    ) -> Story:
        """
        Store a newly generated story in the database.

        individual_project_id is optional so that the existing
        generic story-generation endpoint continues to work.
        """

        db_story = Story(
            individual_project_id=individual_project_id,

            title=story.title,
            content=story.content,

            prompt=request.prompt,
            language=request.language,
            point_of_view=request.point_of_view,
            story_format=request.story_format,
            model_id=request.model,
            word_count=request.word_count,

            genre=request.genre,
            style=request.style,
            tone=request.tone,
            characters=[
                character.model_dump()
                for character in request.characters
            ],

            target_audience=request.target_audience,
            subject=request.subject,
            educational_objective=request.educational_objective,
            grade_level=request.grade_level,
            learning_points=request.learning_points,

            setting=request.setting,
            additional_details=request.additional_details,
            source_type="ai_generated",
        )

        self.db.add(db_story)
        self.db.commit()
        self.db.refresh(db_story)

        return db_story

    def create_uploaded_story(
        self,
        individual_project_id: int,
        title: str,
        content: str,
    ) -> Story:
        db_story = Story(
            individual_project_id=individual_project_id,
            title=title,
            content=content,
            prompt=None,
            language="English",
            point_of_view="third_person_limited",
            story_format="prose_narrative",
            model_id=None,
            word_count=len(content.split()),
            genre=[],
            style=[],
            tone=[],
            target_audience=None,
            subject=None,
            educational_objective=None,
            grade_level=None,
            learning_points=[],
            setting=None,
            additional_details=None,
            source_type="user_uploaded",
        )

        self.db.add(db_story)
        self.db.commit()
        self.db.refresh(db_story)

        return db_story

    # ---------------------------------------------------------
    # GET BY ID
    # ---------------------------------------------------------

    def get_by_id(
        self,
        story_id: int,
    ) -> Story | None:
        """
        Retrieve a story by its primary key.
        """

        statement = select(Story).where(
            Story.id == story_id
        )

        return self.db.scalar(statement)

    # ---------------------------------------------------------
    # GET ALL
    # ---------------------------------------------------------

    def get_all(
        self,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Story]:
        """
        Retrieve stories with pagination.
        """

        statement = (
            select(Story)
            .order_by(
                Story.created_at.desc()
            )
            .offset(offset)
            .limit(limit)
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ---------------------------------------------------------
    # GET BY INDIVIDUAL PROJECT
    # ---------------------------------------------------------

    def get_by_individual_project(
        self,
        individual_project_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Story]:
        """
        Retrieve stories belonging to an Individual Project.
        """

        statement = (
            select(Story)
            .where(
                Story.individual_project_id
                == individual_project_id
            )
            .order_by(
                Story.created_at.desc(),
                Story.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )

        return list(
            self.db.scalars(statement).all()
        )

    def update(
        self,
        story: Story,
        title: str,
        content: str,
    ) -> Story:
        story.title = title
        story.content = content

        self.db.commit()
        self.db.refresh(story)

        return story

    # ---------------------------------------------------------
    # DELETE
    # ---------------------------------------------------------

    def delete(
        self,
        story: Story,
    ) -> None:
        """
        Delete a story from the database.
        """

        self.db.delete(story)
        self.db.commit()
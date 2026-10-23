import json

from sqlalchemy.orm import Session

from app.clients.openrouter_client import OpenRouterClient
from app.llm.model_service import ModelService
from app.prompts.prompt_builder import (
    build_outline_prompts,
    build_story_from_outline_prompts,
)
from app.repositories.story_repository import StoryRepository
from app.schemas.story_request import StoryRequest
from app.schemas.story_response import StoryResponse
from app.schemas.story_ai_edit_request import StoryAIEditRequest
from app.repositories.story_version_repository import StoryVersionRepository
from app.repositories.story_edit_preview_repository import StoryEditPreviewRepository
from app.schemas.story_ai_edit_preview_response import (
            StoryAIEditPreviewResponse,
        )
from app.repositories.story_edit_history_repository import (
    StoryEditHistoryRepository,
)


class StoryService:
    """
    Business logic for story generation and persistence.

    Story generation pipeline:

    Pass 1:
        Generate a structured narrative outline.

    Pass 2:
        Generate the complete story from the outline.

    The generated story is then validated for basic JSON/content
    structure and persisted to PostgreSQL.
    """

    def __init__(
        self,
        db: Session,
    ) -> None:
        self.db = db

        self.model_service = ModelService()

        self.llm_client = OpenRouterClient()

        self.story_repository = StoryRepository(
            db
        )
        self.story_version_repository = StoryVersionRepository(db)
        self.story_edit_preview_repository = StoryEditPreviewRepository(db)
        self.story_edit_history_repository = StoryEditHistoryRepository(db)

    async def generate_story(
        self,
        request: StoryRequest,
        individual_project_id: int | None = None,
    ) -> StoryResponse:
        """
        Generate and persist a story using the two-pass
        story-generation pipeline.
        """

        # =====================================================
        # 1. VALIDATE SELECTED MODEL
        # =====================================================

        selected_model = (
            self.model_service.validate_model(
                request.model
            )
        )

        # =====================================================
        # 2. PASS 1 — GENERATE NARRATIVE OUTLINE
        # =====================================================

        (
            outline_system_prompt,
            outline_user_prompt,
        ) = build_outline_prompts(
            request
        )

        raw_outline = await self.llm_client.generate(
            model_id=selected_model.id,
            system_prompt=outline_system_prompt,
            user_prompt=outline_user_prompt,
            temperature=0.3,
        )

        # =====================================================
        # 3. PARSE OUTLINE
        # =====================================================

        outline = self._parse_outline_response(
            raw_outline
        )

        # =====================================================
        # 4. VALIDATE OUTLINE
        # =====================================================

        self._validate_outline(
            outline
        )

        # =====================================================
        # 5. PASS 2 — GENERATE FINAL STORY
        # =====================================================

        (
            story_system_prompt,
            story_user_prompt,
        ) = build_story_from_outline_prompts(
            request,
            outline,
        )

        raw_story = await self.llm_client.generate(
            model_id=selected_model.id,
            system_prompt=story_system_prompt,
            user_prompt=story_user_prompt,
            temperature=0.7,
        )

        # =====================================================
        # 6. PARSE FINAL STORY
        # =====================================================

        result = self._parse_llm_response(
            raw_story
        )

        # =====================================================
        # 7. BASIC STORY VALIDATION
        # =====================================================

        self._validate_story_result(
            result
        )

        # =====================================================
        # 8. CREATE STORY RESPONSE
        # =====================================================

        title = result.get(
            "title"
        )

        content = result.get(
            "content"
        )


        generated_story = StoryResponse(
            id=0,
            individual_project_id=individual_project_id,
            title=title.strip(),
            content=content.strip(),
            source_type="ai_generated",
            prompt=request.prompt,
            model_id=request.model,
            language=request.language,
            point_of_view=request.point_of_view,
            story_format=request.story_format,
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
        )


        # =====================================================
        # 9. SAVE STORY TO DATABASE
        # =====================================================

        saved_story = self.story_repository.create(
            request=request,
            story=generated_story,
            individual_project_id=individual_project_id,
        )

        self.initialize_story_version(
            story_id=saved_story.id,
        )

        # =====================================================
        # 10. RETURN DATABASE-BACKED STORY
        # =====================================================


        return StoryResponse(
            id=saved_story.id,
            individual_project_id=saved_story.individual_project_id,
            title=saved_story.title,
            content=saved_story.content,
            source_type=saved_story.source_type,
            prompt=saved_story.prompt,
            model_id=saved_story.model_id,
            language=saved_story.language,
            point_of_view=saved_story.point_of_view,
            story_format=saved_story.story_format,
            word_count=saved_story.word_count,
            genre=saved_story.genre,
            style=saved_story.style,
            tone=saved_story.tone,
            characters=saved_story.characters,
            target_audience=saved_story.target_audience,
            subject=saved_story.subject,
            educational_objective=saved_story.educational_objective,
            grade_level=saved_story.grade_level,
            learning_points=saved_story.learning_points,
            setting=saved_story.setting,
            additional_details=saved_story.additional_details,
        )


    def update_story(
        self,
        story_id: int,
        title: str,
        content: str,
    ) -> StoryResponse:
        story = self.story_repository.get_by_id(story_id)

        if story is None:
            raise ValueError("Story not found.")

        if story.current_version_id is None:
            self.initialize_story_version(story_id=story.id)
            story = self.story_repository.get_by_id(story_id)

            if story is None:
                raise ValueError("Story not found.")

        before_version_id = story.current_version_id

        updated_story = self.story_repository.update(
            story=story,
            title=title.strip(),
            content=content.strip(),
        )

        new_version = self.story_version_repository.create(
            story_id=updated_story.id,
            title=updated_story.title,
            content=updated_story.content,
            source_type="manual_edit",
        )

        updated_story.current_version_id = new_version.id
        self.db.commit()
        self.db.refresh(updated_story)

        self.story_edit_history_repository.create(
            story_id=updated_story.id,
            action_type="manual_edit",
            status="completed",
            before_version_id=before_version_id,
            after_version_id=new_version.id,
            details={
                "title": updated_story.title,
            },
        )
        self.db.commit()

        return StoryResponse(
            id=updated_story.id,
            individual_project_id=updated_story.individual_project_id,
            title=updated_story.title,
            content=updated_story.content,
            source_type=updated_story.source_type,
        )

    async def ai_edit_story(
        self,
        story_id: int,
        request: StoryAIEditRequest,
    ):
        """
        Generate an AI-edited preview for an existing story.

        The story itself is NOT modified here.
        The generated result is stored as a pending preview.
        The preview must be accepted separately before
        creating a new story version.
        """

        story = self.story_repository.get_by_id(story_id)

        if story is None:
            raise ValueError("Story not found.")

        # =====================================================
        # 1. VALIDATE EDIT INSTRUCTION
        # =====================================================

        instruction = request.instruction.strip()

        if not instruction:
            raise ValueError(
                "AI edit instruction cannot be empty."
            )

        # =====================================================
        # 2. ENSURE CURRENT VERSION EXISTS
        # =====================================================

        if story.current_version_id is None:
            self.initialize_story_version(
                story_id=story.id,
            )

            # Reload story after initialization.
            story = self.story_repository.get_by_id(story_id)

            if story is None:
                raise ValueError("Story not found.")

        # =====================================================
        # 3. GENERATE AI EDIT
        # =====================================================

        system_prompt = """
You are an expert story editor.

Your task is to modify an existing story according to the user's
editing instruction.

Rules:
1. Preserve the original story's core meaning unless the instruction
   explicitly asks for a change.
2. Apply the requested changes naturally throughout the story.
3. Keep the story coherent and logically consistent.
4. Preserve important characters, setting, events, and narrative
   structure unless the user asks to change them.
5. Return ONLY valid JSON.
6. The JSON must contain exactly two fields:
   - "title": the story title
   - "content": the complete revised story
7. Do not include markdown, explanations, comments, or code fences.
"""

        user_prompt = f"""
Existing Story Title:
{story.title}

Existing Story:
{story.content}

User's Editing Instruction:
{instruction}

Return the complete revised story as JSON.
"""

        raw_response = await self.llm_client.generate(
            model_id=story.model_id or "qwen/qwen3-30b-a3b",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.7,
        )

        # =====================================================
        # 4. PARSE AI RESPONSE
        # =====================================================

        result = self._parse_llm_response(
            raw_response
        )

        # =====================================================
        # 5. VALIDATE AI RESULT
        # =====================================================

        self._validate_story_result(
            result
        )

        title = result.get(
            "title"
        )

        content = result.get(
            "content"
        )

        title = title.strip()
        content = content.strip()

        # =====================================================
        # 6. CREATE PENDING PREVIEW
        # =====================================================

        preview = self.story_edit_preview_repository.create(
            story_id=story.id,
            base_version_id=story.current_version_id,
            instruction=instruction,
            title=title,
            content=content,
        )

        self.story_edit_history_repository.create(
            story_id=story.id,
            action_type="ai_edit",
            instruction=instruction,
            status="pending",
            before_version_id=story.current_version_id,
            details={
                "preview_id": preview.id,
                "preview_title": preview.title,
            },
        )

        # =====================================================
        # 7. RETURN PREVIEW
        # =====================================================


        return StoryAIEditPreviewResponse(
            preview_id=preview.id,
            story_id=story.id,
            current_version_id=story.current_version_id,
            title=preview.title,
            content=preview.content,
            source_type="ai_edit",
        )

    # =========================================================
    # BASIC STORY VALIDATION
    # =========================================================

    @staticmethod
    def _validate_story_result(
        result: dict,
    ) -> None:
        """
        Validate the basic structure of a generated story.

        This does not perform another LLM quality-validation pass.
        """

        title = result.get(
            "title"
        )

        content = result.get(
            "content"
        )

        if (
            not isinstance(title, str)
            or not title.strip()
        ):
            raise ValueError(
                "LLM response does not contain a valid "
                "story title."
            )

        if (
            not isinstance(content, str)
            or not content.strip()
        ):
            raise ValueError(
                "LLM response does not contain valid "
                "story content."
            )

    # =========================================================
    # OUTLINE PARSER
    # =========================================================

    @staticmethod
    def _parse_outline_response(
        raw_response: str,
    ) -> dict:
        """
        Parse the JSON returned by the outline-generation pass.
        """

        cleaned_response = (
            raw_response.strip()
        )

        cleaned_response = (
            StoryService._remove_code_fences(
                cleaned_response
            )
        )

        try:
            result = json.loads(
                cleaned_response
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                "LLM returned invalid JSON for the "
                "narrative outline."
            ) from exc

        if not isinstance(
            result,
            dict,
        ):
            raise ValueError(
                "Narrative outline must be a JSON object."
            )

        return result

    # =========================================================
    # OUTLINE VALIDATION
    # =========================================================

    @staticmethod
    def _validate_outline(
        outline: dict,
    ) -> None:
        """
        Validate the minimum structure required by the
        narrative-planning pass.
        """

        events = outline.get(
            "events"
        )

        if not isinstance(
            events,
            list,
        ):
            raise ValueError(
                "Narrative outline must contain an "
                "'events' array."
            )

        if len(events) < 5:
            raise ValueError(
                "Narrative outline must contain at least "
                "5 meaningful events."
            )

        if len(events) > 20:
            raise ValueError(
                "Narrative outline contains too many events."
            )

        previous_number = 0

        for event in events:

            # -------------------------------------------------
            # Event object
            # -------------------------------------------------

            if not isinstance(
                event,
                dict,
            ):
                raise ValueError(
                    "Every outline event must be a JSON object."
                )

            # -------------------------------------------------
            # Event number
            # -------------------------------------------------

            number = event.get(
                "number"
            )

            if not isinstance(
                number,
                int,
            ) or isinstance(
                number,
                bool,
            ):
                raise ValueError(
                    "Every outline event must contain an "
                    "integer number."
                )

            if number <= previous_number:
                raise ValueError(
                    "Narrative outline events must be "
                    "in chronological order."
                )

            # -------------------------------------------------
            # Event title
            # -------------------------------------------------

            title = event.get(
                "title"
            )

            if (
                not isinstance(
                    title,
                    str,
                )
                or not title.strip()
            ):
                raise ValueError(
                    "Every outline event must contain a title."
                )

            # -------------------------------------------------
            # Event description
            # -------------------------------------------------

            description = event.get(
                "description"
            )

            if (
                not isinstance(
                    description,
                    str,
                )
                or not description.strip()
            ):
                raise ValueError(
                    "Every outline event must contain a "
                    "description."
                )

            previous_number = number

    # =========================================================
    # FINAL STORY PARSER
    # =========================================================

    @staticmethod
    def _parse_llm_response(
        raw_response: str,
    ) -> dict:
        """
        Parse JSON returned by the final story-generation pass.

        Handles:

        - plain JSON
        - ```json ... ```
        - ``` ... ```
        """

        cleaned_response = (
            raw_response.strip()
        )

        cleaned_response = (
            StoryService._remove_code_fences(
                cleaned_response
            )
        )

        try:
            result = json.loads(
                cleaned_response
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                "LLM returned invalid JSON."
            ) from exc

        if not isinstance(
            result,
            dict,
        ):
            raise ValueError(
                "LLM response must be a JSON object."
            )

        return result

    # =========================================================
    # CODE-FENCE CLEANER
    # =========================================================

    @staticmethod
    def _remove_code_fences(
        response: str,
    ) -> str:
        """
        Remove Markdown code fences if the model returns them.
        """

        cleaned = response.strip()

        # -----------------------------------------------------
        # ```json
        # -----------------------------------------------------

        if cleaned.startswith(
            "```json"
        ):
            cleaned = cleaned[
                len("```json"):
            ].strip()

        # -----------------------------------------------------
        # ```
        # -----------------------------------------------------

        elif cleaned.startswith(
            "```"
        ):
            cleaned = cleaned[
                len("```"):
            ].strip()

        # -----------------------------------------------------
        # Closing ```
        # -----------------------------------------------------

        if cleaned.endswith(
            "```"
        ):
            cleaned = cleaned[
                :-len("```")
            ].strip()

        return cleaned

    def accept_ai_edit_preview(
        self,
        preview_id: int,
    ) -> StoryResponse:
        """
        Accept a pending AI edit preview.

        This creates a new StoryVersion and makes it the
        current version of the story.
        """

        # =====================================================
        # 1. GET PENDING PREVIEW
        # =====================================================

        preview = self.story_edit_preview_repository.get_pending_by_id(
            preview_id=preview_id,
        )

        if preview is None:
            raise ValueError(
                "Pending AI edit preview not found."
            )

        # =====================================================
        # 2. GET STORY
        # =====================================================

        story = self.story_repository.get_by_id(
            preview.story_id
        )

        if story is None:
            raise ValueError(
                "Story not found."
            )

        # =====================================================
        # 3. VERIFY PREVIEW IS BASED ON CURRENT VERSION
        # =====================================================

        if story.current_version_id != preview.base_version_id:
            raise ValueError(
                "This AI edit preview is no longer valid because "
                "the story has changed since the preview was created."
            )

        # =====================================================
        # 4. CREATE NEW STORY VERSION
        # =====================================================

        new_version = self.story_version_repository.create(
            story_id=story.id,
            title=preview.title,
            content=preview.content,
            source_type="ai_edit",
        )

        # =====================================================
        # 5. UPDATE CURRENT STORY
        # =====================================================

        story.title = new_version.title
        story.content = new_version.content
        story.current_version_id = new_version.id

        self.db.commit()
        self.db.refresh(story)

        # =====================================================
        # 6. MARK PREVIEW AS ACCEPTED
        # =====================================================

        self.story_edit_preview_repository.update_status(
            preview=preview,
            status="accepted",
        )


        history = self.story_edit_history_repository.get_by_preview_id(
            story_id=story.id,
            preview_id=preview.id,
        )

        if history is None:
            self.story_edit_history_repository.create(
                story_id=story.id,
                action_type="ai_edit",
                instruction=preview.instruction,
                status="accepted",
                before_version_id=preview.base_version_id,
                after_version_id=new_version.id,
                details={
                    "preview_id": preview.id,
                    "accepted_title": new_version.title,
                },
            )
        else:
            details = dict(history.details or {})
            details["accepted_title"] = new_version.title

            self.story_edit_history_repository.update(
                history_id=history.id,
                status="accepted",
                after_version_id=new_version.id,
                details=details,
            )
        self.db.commit()


        # =====================================================
        # 7. RETURN UPDATED STORY
        # =====================================================

        return StoryResponse(
            id=story.id,
            individual_project_id=story.individual_project_id,
            title=story.title,
            content=story.content,
            source_type=story.source_type,
        )

    def discard_ai_edit_preview(
        self,
        preview_id: int,
    ) -> None:
        """
        Discard a pending AI edit preview.

        Discarding a preview does not modify the story
        or create a new story version.
        """

        # =====================================================
        # 1. GET PENDING PREVIEW
        # =====================================================

        preview = self.story_edit_preview_repository.get_pending_by_id(
            preview_id=preview_id,
        )

        if preview is None:
            raise ValueError(
                "Pending AI edit preview not found."
            )

        # =====================================================
        # 2. MARK PREVIEW AS DISCARDED
        # =====================================================

        self.story_edit_preview_repository.update_status(
            preview=preview,
            status="discarded",
        )

        history = self.story_edit_history_repository.get_by_preview_id(
            story_id=preview.story_id,
            preview_id=preview.id,
        )

        if history is None:
            self.story_edit_history_repository.create(
                story_id=preview.story_id,
                action_type="ai_edit",
                instruction=preview.instruction,
                status="discarded",
                before_version_id=preview.base_version_id,
                details={
                    "preview_id": preview.id,
                    "discarded_title": preview.title,
                },
            )
        else:
            details = dict(history.details or {})
            details["discarded_title"] = preview.title

            self.story_edit_history_repository.update(
                history_id=history.id,
                status="discarded",
                details=details,
            )
        self.db.commit()

    def get_story_versions(
        self,
        story_id: int,
    ):
        """
        Get all versions of a story, newest version first.
        """

        story = self.story_repository.get_by_id(
            story_id
        )

        if story is None:
            raise ValueError(
                "Story not found."
            )

        return self.story_version_repository.get_by_story(
            story_id=story.id,
        )

    def restore_story_version(
        self,
        story_id: int,
        version_id: int,
    ) -> StoryResponse:
        """
        Restore a previous story version.

        The selected version is copied into a new version so the
        existing version history is never modified or deleted.
        """

        # =====================================================
        # 1. GET STORY
        # =====================================================

        story = self.story_repository.get_by_id(
            story_id,
        )

        if story is None:
            raise ValueError(
                "Story not found."
            )

        # =====================================================
        # 2. GET VERSION
        # =====================================================

        version = self.story_version_repository.get_by_id(
            version_id,
        )

        if version is None:
            raise ValueError(
                "Story version not found."
            )

        # =====================================================
        # 3. VERIFY VERSION BELONGS TO STORY
        # =====================================================

        if version.story_id != story.id:
            raise ValueError(
                "Story version does not belong to this story."
            )

        # =====================================================
        # 4. CREATE NEW VERSION FROM SELECTED VERSION
        # =====================================================

        restored_version = self.story_version_repository.create(
            story_id=story.id,
            title=version.title,
            content=version.content,
            source_type="rollback",
        )

        self.story_edit_history_repository.create(
            story_id=story.id,
            action_type="restore_version",
            status="completed",
            before_version_id=story.current_version_id,
            after_version_id=restored_version.id,
            details={
                "restored_from_version_id": version.id,
                "restored_version_number": version.version_number,
            },
        )

        # =====================================================
        # 5. UPDATE CURRENT STORY
        # =====================================================

        story.title = restored_version.title
        story.content = restored_version.content
        story.current_version_id = restored_version.id

        self.db.commit()
        self.db.refresh(story)

        # =====================================================
        # 6. RETURN UPDATED STORY
        # =====================================================

        return StoryResponse(
            id=story.id,
            individual_project_id=story.individual_project_id,
            title=story.title,
            content=story.content,
            source_type=story.source_type,
        )

    def initialize_story_version(
        self,
        story_id: int,
    ) -> None:
        story = self.story_repository.get_by_id(story_id)

        if story is None:
            raise ValueError("Story not found.")

        if story.current_version_id is not None:
            return

        version = self.story_version_repository.create_initial_version(
            story_id=story.id,
            title=story.title,
            content=story.content,
            source_type=story.source_type,
        )

        story.current_version_id = version.id

        self.db.commit()
        self.db.refresh(story)
from io import BytesIO

from app.core.image_safety import inspect_image
from sqlalchemy.orm import Session

from app.clients.openrouter_image_client import (
    DEFAULT_IMAGE_MODEL,
    OpenRouterImageClient,
)
from app.models.scenes import Scene
from app.models.story_board import StoryBoard
from app.models.scene_sketch import SceneSketch
from app.repositories.scene_sketch_repository import SceneSketchRepository
from app.services.scene_sketch_storage import SceneSketchStorage
import base64
from pathlib import Path

from app.models.scene_character import SceneCharacter
from app.models.character_master_image import CharacterMasterImage
from app.models.location_master_image import LocationMasterImage

from app.services.character_master_image_storage import (
    CharacterMasterImageStorage,
)
from app.services.location_master_image_storage import (
    LocationMasterImageStorage,
)
from app.models.characters import Character
from app.models.location import Location

class SceneSketchService:
    """Generate and persist scene-sketch images."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = SceneSketchRepository(db)
        self.storage = SceneSketchStorage()
        self.image_client = OpenRouterImageClient()
        self.character_storage = CharacterMasterImageStorage()
        self.location_storage = LocationMasterImageStorage()

    @staticmethod
    def _validate_image(image_bytes: bytes) -> tuple[str, str]:
        """Only single-frame PNG / JPEG / WEBP pass; no other decoder runs (app/core/image_safety.py)."""
        try:
            return inspect_image(image_bytes)
        except ValueError as exc:
            raise ValueError(
                "The provider did not return a valid image file."
            ) from exc

    @staticmethod
    def _build_prompt(
        *,
        scene: Scene,
        storyboard_title: str,
        sketch_number: int,
        customization: str = "",
    ) -> str:
        scene_data = scene.scene_data or {}

        return f"""
Create a production-ready visual sketch for a scene in an animated film.

STORYBOARD:
{storyboard_title}

SCENE NUMBER:
{scene.scene_json_id}

SCENE TITLE:
{scene.title}

SCENE SUMMARY:
{scene.summary}

PRIMARY ACTION:
{scene.primary_action}

EMOTION:
{scene.overall_emotion}

VISUAL DESCRIPTION:
{scene.visual_description}

LOCATION:
{scene.scene_location_name}

LOCATION TYPE:
{scene.scene_location_type}

TIME OF DAY:
{scene.scene_location_time_of_day}

LOCATION DESCRIPTION:
{scene.scene_location_description}

CAMERA SUGGESTION:
{scene.camera_suggestion}

SCENE TRANSITION:
{scene.scene_transition}

SOURCE SCENE DATA:
{scene_data}

SKETCH NUMBER:
{sketch_number}

VISUAL REQUIREMENTS:
- Illustrate the specified scene faithfully.
- Preserve the described characters, actions, setting, and emotional tone.
- Use the camera suggestion to guide composition and framing.
- Maintain visual continuity with the supplied scene description.
- Do not invent major story events or change the intended action.
- Do not include captions, subtitles, watermarks, borders, or UI elements.
- Produce one image only.
- This is a scene sketch, not a location-only reference image.

USER CUSTOMIZATION (the person's own directions for this sketch; follow them closely, and where they ask
for a different framing, angle, lighting, mood or style, they take priority over the camera suggestion and the
visual description above, while keeping the scene's characters, place and story action):
{customization or "No additional customization."}

Generate the image only.
""".strip()


    @staticmethod
    def _plan_visual_beats(
        *,
        scene: Scene,
        max_sketches: int = 8,
    ) -> list[dict[str, str]]:
        """Create a basic shot plan from the available scene data."""
        data = scene.scene_data or {}
        summary = scene.summary or ""
        action = scene.primary_action or ""
        visual = scene.visual_description or ""
        camera = scene.camera_suggestion or ""

        # Start with the scene's main action.
        beats = [
            {
                "title": scene.title or "Scene",
                "description": summary or visual or action,
                "camera_details": camera or "Medium-wide cinematic shot.",
            }
        ]

        # Add meaningful visual beats when the scene contains multiple actions.
        dialogues = data.get("dialogues", [])
        if isinstance(dialogues, list):
            for dialogue in dialogues:
                if len(beats) >= max_sketches:
                    break
                if not isinstance(dialogue, dict):
                    continue

                text = str(dialogue.get("text") or "").strip()
                if not text:
                    continue

                speaker = str(dialogue.get("speaker_name") or "Character")
                emotion = str(dialogue.get("emotion") or scene.overall_emotion or "neutral")

                beats.append({
                    "title": f"{scene.title or 'Scene'} — {speaker}",
                    "description": f'{speaker} speaks: "{text}". Emotion: {emotion}.',
                    "camera_details": (
                        f"Medium close-up of {speaker}, expressive facial acting, "
                        "cinematic composition."
                    ),
                })

        # If the scene contains several distinct characters, add a group shot.
        characters = data.get("characters_present", [])
        if (
            isinstance(characters, list)
            and len(characters) > 1
            and len(beats) < max_sketches
        ):
            names = [
                str(character.get("name"))
                for character in characters
                if isinstance(character, dict) and character.get("name")
            ]
            if names:
                beats.append({
                    "title": f"{scene.title or 'Scene'} — Group Shot",
                    "description": (
                        f"Show {', '.join(names)} together during this scene. "
                        f"Main action: {action or summary}"
                    ),
                    "camera_details": (
                        "Wide cinematic shot showing the characters and their "
                        "spatial relationships."
                    ),
                })

        return beats[:max_sketches]


    async def generate_many(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        scene_id: int,
        model_id: str | None = None,
        max_sketches: int = 8,
        customization_instructions: str = "",
    ) -> list[SceneSketch]:
        if not 1 <= max_sketches <= 8:
            raise ValueError("max_sketches must be between 1 and 8.")

        scene = (
            self.db.query(Scene)
            .filter(
                Scene.id == scene_id,
                Scene.story_board_id == storyboard_id,
            )
            .first()
        )
        if scene is None:
            raise ValueError("Scene not found in this storyboard.")

        storyboard = (
            self.db.query(StoryBoard)
            .filter(
                StoryBoard.id == storyboard_id,
                StoryBoard.story_id == story_id,
            )
            .first()
        )
        if storyboard is None:
            raise ValueError("Storyboard not found for this story.")

        beats = self._plan_visual_beats(
            scene=scene,
            max_sketches=max_sketches,
        )

        results = []

        for number, beat in enumerate(beats, start=1):
            try:
                sketch = await self.generate(
                    project_id=project_id,
                    story_id=story_id,
                    storyboard_id=storyboard_id,
                    scene_id=scene_id,
                    sketch_number=number,
                    model_id=model_id,
                    title=beat["title"],
                    description=beat["description"],
                    camera_details=beat["camera_details"],
                    customization_instructions=customization_instructions,
                )
                results.append(sketch)
            except Exception:
                # Keep successful sketches if a later generation fails.
                continue

        return results

    async def generate(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        scene_id: int,
        sketch_number: int = 1,
        model_id: str | None = None,
        title: str | None = None,
        description: str | None = None,
        camera_details: str | None = None,
        customization_instructions: str = "",
    ) -> SceneSketch:
        if sketch_number < 1:
            raise ValueError("sketch_number must be at least 1.")

        storyboard = (
            self.db.query(StoryBoard)
            .filter(
                StoryBoard.id == storyboard_id,
                StoryBoard.story_id == story_id,
            )
            .with_for_update()
            .first()
        )

        if storyboard is None:
            raise ValueError("Storyboard not found for this story.")

        scene = (
            self.db.query(Scene)
            .filter(
                Scene.id == scene_id,
                Scene.story_board_id == storyboard_id,
            )
            .first()
        )

        if scene is None:
            raise ValueError("Scene not found in this storyboard.")

        selected_model = model_id or DEFAULT_IMAGE_MODEL
        version = self.repository.get_next_version(
            scene_id=scene_id,
            sketch_number=sketch_number,
        )

        prompt = self._build_prompt(
            scene=scene,
            storyboard_title=storyboard.title,
            sketch_number=sketch_number,
            customization=customization_instructions,
        )

        record = SceneSketch(
            scene_id=scene_id,
            sketch_number=sketch_number,
            title=title or scene.title,
            description=description or scene.visual_description or scene.summary,
            camera_details=camera_details or scene.camera_suggestion,
            prompt=prompt,
            model_name=selected_model,
            model_version="",
            source_type="generated",
            status="generating",
            version=version,
            image_url=None,
            storage_key=None,
        )

        self.repository.create(record)
        self.db.commit()
        self.db.refresh(record)

        saved_storage_key = None

        try:
            references = self._get_scene_master_references(
                scene=scene,
                storyboard_id=storyboard_id,
            )

            image_bytes, provider_mime_type = await self.image_client.generate_image(
                model_id=selected_model,
                prompt=prompt,
                resolution="1K",
                output_format="png",
                input_references=references[:8],
            )

            actual_mime_type, extension = self._validate_image(image_bytes)

            if provider_mime_type != actual_mime_type:
                raise ValueError(
                    "Image MIME type does not match the returned image content."
                )

            _, storage_key = self.storage.save_bytes(
                image_bytes=image_bytes,
                project_id=project_id,
                story_id=story_id,
                scene_id=scene_id,
                sketch_number=sketch_number,
                version=version,
                extension=extension,
            )
            saved_storage_key = storage_key

            record.storage_key = storage_key
            record.mime_type = actual_mime_type
            record.file_size_bytes = len(image_bytes)
            record.status = "generated"
            record.error_message = None

            self.db.commit()
            self.db.refresh(record)
            return record

        except Exception as exc:
            self.db.rollback()

            if saved_storage_key:
                try:
                    self.storage.delete_file(saved_storage_key)
                except Exception:
                    pass

            failed_record = (
                self.db.query(SceneSketch)
                .filter(SceneSketch.id == record.id)
                .first()
            )

            if failed_record is not None:
                failed_record.status = "failed"
                failed_record.error_message = str(exc)[:4000]
                self.db.commit()

            raise
    
    def upload(
        self,
        *,
        project_id: int,
        story_id: int,
        storyboard_id: int,
        scene_id: int,
        image_bytes: bytes,
        original_filename: str = "",
    ) -> SceneSketch:
        """Save the creator's own image as the scene's newest sketch."""
        scene = (
            self.db.query(Scene)
            .filter(
                Scene.id == scene_id,
                Scene.story_board_id == storyboard_id,
            )
            .first()
        )

        if scene is None:
            raise ValueError("Scene not found in this storyboard.")

        if not image_bytes:
            raise ValueError("The uploaded file is empty.")

        try:
            mime_type, extension = self._validate_image(image_bytes)
        except ValueError as exc:
            raise ValueError(
                "Upload a PNG, JPG or WEBP image."
            ) from exc

        version = self.repository.get_next_version(
            scene_id=scene_id,
            sketch_number=1,
        )

        _, storage_key = self.storage.save_bytes(
            image_bytes=image_bytes,
            project_id=project_id,
            story_id=story_id,
            scene_id=scene_id,
            sketch_number=1,
            version=version,
            extension=extension,
        )

        record = SceneSketch(
            scene_id=scene_id,
            sketch_number=1,
            title=scene.title,
            description=scene.visual_description or scene.summary or "",
            camera_details=scene.camera_suggestion or "",
            prompt=(original_filename or "")[:255],
            model_name="user_upload",
            model_version="",
            source_type="user_upload",
            status="generated",
            version=version,
            image_url=None,
            storage_key=storage_key,
            mime_type=mime_type,
            file_size_bytes=len(image_bytes),
        )

        try:
            self.repository.create(record)
            self.db.commit()
            self.db.refresh(record)
        except Exception:
            self.db.rollback()
            self.storage.delete_file(storage_key)
            raise

        return record
    
    @staticmethod
    def _image_to_data_url(
        storage_dir: Path,
        storage_key: str,
        mime_type: str | None,
    ) -> str:
        root = storage_dir.resolve()
        image_path = (root / storage_key).resolve()

        if root not in image_path.parents or not image_path.is_file():
            raise ValueError("Master image file was not found in storage.")

        image_bytes = image_path.read_bytes()

        if len(image_bytes) > 15 * 1024 * 1024:
            raise ValueError("Master image exceeds the 15 MB limit.")

        content_type = mime_type or "image/png"

        if content_type not in {
            "image/png",
            "image/jpeg",
            "image/webp",
        }:
            raise ValueError("Unsupported master image MIME type.")

        encoded = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{content_type};base64,{encoded}"


    def _get_scene_master_references(
        self,
        *,
        scene: Scene,
        storyboard_id: int,
    ) -> list[str]:
        references: list[str] = []
        seen_character_ids: set[int] = set()

        scene_characters = (
            self.db.query(SceneCharacter)
            .filter(SceneCharacter.scene_id == scene.id)
            .all()
        )

        character_storage_dir = self.character_storage.storage_dir

        for scene_character in scene_characters:
            character = (
                self.db.query(Character)
                .filter(
                    Character.id == scene_character.character_id,
                    Character.story_board_id == storyboard_id,
                )
                .first()
            )

            if character is None:
                continue

            if character.character_json_id in seen_character_ids:
                continue

            master_image = (
                self.db.query(CharacterMasterImage)
                .filter(
                    CharacterMasterImage.story_board_id == storyboard_id,
                    CharacterMasterImage.character_json_id
                    == character.character_json_id,
                    CharacterMasterImage.image_type == "canonical",
                    CharacterMasterImage.status.in_(["generated", "uploaded"]),
                )
                .order_by(
                    CharacterMasterImage.version.desc(),
                    CharacterMasterImage.id.desc(),
                )
                .first()
            )

            if master_image is None or not master_image.storage_key:
                continue

            references.append(
                self._image_to_data_url(
                    character_storage_dir,
                    master_image.storage_key,
                    master_image.mime_type,
                )
            )
            seen_character_ids.add(character.character_json_id)

        if scene.location_id is not None:
            location_record = (
                self.db.query(Location)
                .filter(
                    Location.id == scene.location_id,
                    Location.story_board_id == storyboard_id,
                )
                .first()
            )

            if location_record is not None:
                location_image = (
                    self.db.query(LocationMasterImage)
                    .filter(
                        LocationMasterImage.story_board_id == storyboard_id,
                        LocationMasterImage.location_json_id
                        == location_record.location_json_id,
                        LocationMasterImage.image_type == "canonical",
                        LocationMasterImage.status.in_(["generated", "uploaded"]),
                    )
                    .order_by(
                        LocationMasterImage.version.desc(),
                        LocationMasterImage.id.desc(),
                    )
                    .first()
                )

                if location_image is not None and location_image.storage_key:
                    references.append(
                        self._image_to_data_url(
                            self.location_storage.storage_dir,
                            location_image.storage_key,
                            location_image.mime_type,
                        )
                    )

        return references
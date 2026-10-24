from typing import Sequence



from sqlalchemy.orm import Session

from app.models import SceneVideoClip

from app.core.config import settings
from app.models import Scene, StoryBoard, VideoGenerationJob

from app.models import SceneSketch

from app.services.scene_sketch_service import SceneSketchService

from app.services.scene_sketch_storage import SceneSketchStorage

import asyncio

import base64

import io

import logging

from datetime import datetime, timezone

from pathlib import Path



from PIL import Image



from app.clients.openrouter_video_client import (

    OpenRouterVideoClient,

    OpenRouterVideoError,

)

from app.services.scene_video_storage import SceneVideoStorage

from app.services.video_assembly_service import (
    VideoAssemblyService,
    VideoAssemblyError,
)



class VideoGenerationService:

    """Create video-generation jobs and resolve their storyboard scenes."""



    VALID_MODES = {"all", "selected", "newly_added"}



    def __init__(self, db: Session):

        self.db = db



    def get_storyboard_scenes(

        self,

        story_id: int,

        scene_ids: Sequence[int] | None = None,

    ) -> list[Scene]:

        """Return scenes belonging to the requested story."""



        storyboards = (

            self.db.query(StoryBoard)

            .filter(StoryBoard.story_id == story_id)

            .all()

        )



        if not storyboards:

            raise ValueError(

                f"No storyboard found for story ID {story_id}."

            )



        storyboard_ids = [storyboard.id for storyboard in storyboards]



        query = self.db.query(Scene).filter(

            Scene.story_board_id.in_(storyboard_ids)

        )



        if scene_ids is not None:

            requested_ids = list(dict.fromkeys(scene_ids))



            if not requested_ids:

                raise ValueError(

                    "Select at least one scene for this generation mode."

                )



            query = query.filter(Scene.id.in_(requested_ids))



        scenes = query.order_by(Scene.id.asc()).all()



        if scene_ids is not None:

            found_ids = {scene.id for scene in scenes}

            missing_ids = set(scene_ids) - found_ids



            if missing_ids:

                raise ValueError(

                    "These scene IDs do not belong to the requested story: "

                    f"{sorted(missing_ids)}"

                )



        if not scenes:

            raise ValueError(

                f"No scenes found for story ID {story_id}."

            )



        return scenes





    @staticmethod

    def _extract_dialogue_text(scene: Scene) -> str:

        """Extract existing dialogue without generating new lines."""

        scene_data = scene.scene_data or {}

        dialogues = scene_data.get("dialogues", [])



        if not isinstance(dialogues, list):

            return ""



        lines = []



        for item in dialogues:

            if not isinstance(item, dict):

                continue



            text = str(item.get("text") or "").strip()

            if not text:

                continue



            speaker = str(

                item.get("speaker_name") or "Narrator"

            ).strip()



            lines.append(f"{speaker}: {text}")



        return "\n".join(lines)



    @classmethod

    def _build_scene_prompt(cls, scene: Scene) -> str:

        """Build a video prompt from the stored storyboard scene."""

        dialogue_text = cls._extract_dialogue_text(scene)



        return f"""

Create a cinematic animated video clip for this storyboard scene.



SCENE TITLE:

{scene.title or "Untitled scene"}



SCENE SUMMARY:

{scene.summary or ""}



PRIMARY ACTION:

{scene.primary_action or ""}



VISUAL DESCRIPTION:

{scene.visual_description or ""}



LOCATION:

{scene.scene_location_name or ""}



LOCATION DESCRIPTION:

{scene.scene_location_description or ""}



TIME OF DAY:

{scene.scene_location_time_of_day or ""}



EMOTION:

{scene.overall_emotion or ""}



CAMERA DIRECTION:

{scene.camera_suggestion or ""}



SCENE TRANSITION:

{scene.scene_transition or ""}



EXISTING DIALOGUE:

{dialogue_text or "No dialogue specified."}



VISUAL CONTINUITY:

Preserve character appearance, clothing, location, lighting,

and animation style from the supplied reference images.

Follow the described action and maintain the scene's intended emotion.

Do not invent dialogue or introduce unrelated story events.

Do not render captions, subtitles, watermarks, or UI elements.

""".strip()





    def _get_scene_image_references(

        self,

        scene: Scene,

        storyboard_id: int,

    ) -> list[str]:

        """Load character, location, and latest scene-sketch images."""

        references = []



        # Reuse existing character and location master-image logic.

        sketch_service = SceneSketchService(self.db)

        master_references = sketch_service._get_scene_master_references(

            scene=scene,

            storyboard_id=storyboard_id,

        )

        references.extend(master_references)



        # Add the latest successfully generated scene sketch.

        sketch = (

            self.db.query(SceneSketch)

            .filter(

                SceneSketch.scene_id == scene.id,

                SceneSketch.status == "generated",

            )

            .order_by(SceneSketch.created_at.desc())

            .first()

        )



        if sketch and sketch.storage_key:

            storage = SceneSketchStorage()



            sketch_data_url = SceneSketchService._image_to_data_url(

                storage.storage_dir,

                sketch.storage_key,

                sketch.mime_type,

            )

            references.append(sketch_data_url)



        # Avoid sending too many reference images to the provider.

        return references[:8]





    @staticmethod

    def _format_video_references(

        image_data_urls: list[str],

    ) -> list[dict]:

        """Convert image data URLs into OpenRouter video references."""

        references = []



        for image_url in image_data_urls:

            if not isinstance(image_url, str):

                continue



            if not image_url.startswith("data:image/"):

                continue



            references.append(

                {

                    "type": "image_url",

                    "image_url": {

                        "url": image_url,

                    },

                }

            )



        return references[:8]



    @staticmethod

    def _choose_duration(

        model_info: dict,

        dialogue_text: str,

        scene: Scene,

    ) -> int:

        """Estimate scene duration and choose a supported model duration."""

        supported = model_info.get("supported_durations") or []



        durations = sorted(

            {

                int(value)

                for value in supported

                if str(value).isdigit() and int(value) > 0

            }

        )



        if not durations:

            raise OpenRouterVideoError(

                "The selected model does not advertise supported_durations. "

                "Cannot safely choose a duration."

            )



        action_text = " ".join(

            str(value or "")

            for value in (

                scene.primary_action,

                scene.summary,

                scene.visual_description,

            )

        )



        # Estimate spoken dialogue at roughly 2.5 words per second,

        # with time reserved for the visual action.

        spoken_seconds = len(dialogue_text.split()) / 2.5

        estimated = max(4, int(spoken_seconds + 3))



        if len(action_text.split()) > 35:

            estimated += 2



        return min(durations, key=lambda duration: abs(duration - estimated))



    @staticmethod

    def _extract_last_frame(

        video_path: Path,

        frame_path: Path,

    ) -> bool:

        """Extract the last frame for optional visual continuation."""

        try:

            from moviepy import VideoFileClip



            frame_path.parent.mkdir(parents=True, exist_ok=True)



            with VideoFileClip(str(video_path)) as video:

                if video.duration is None or video.duration <= 0:

                    return False



                frame = video.get_frame(

                    max(0, video.duration - 0.05)

                )



            Image.fromarray(frame).save(frame_path, format="PNG")

            return True



        except Exception:

            logging.exception(

                "Could not extract final frame from %s",

                video_path,

            )

            return False



    @staticmethod

    def _image_path_to_data_url(image_path: Path) -> str:

        """Convert a local image into a PNG data URL."""

        with Image.open(image_path) as image:

            image = image.convert("RGB")

            buffer = io.BytesIO()

            image.save(buffer, format="PNG")



        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

        return f"data:image/png;base64,{encoded}"



    def run_job(self, job_id: int) -> None:

        """Synchronous entry point suitable for FastAPI BackgroundTasks."""

        asyncio.run(self._run_job_async(job_id))



    async def _run_job_async(self, job_id: int) -> None:

        """Generate each scene sequentially and persist its result."""

        client = OpenRouterVideoClient()

        storage = SceneVideoStorage()



        job = (

            self.db.query(VideoGenerationJob)

            .filter(VideoGenerationJob.id == job_id)

            .first()

        )



        if job is None:

            return



        job.status = "planning"

        job.started_at = datetime.now(timezone.utc)

        job.error_message = None

        self.db.commit()



        try:

            scenes = self.get_storyboard_scenes(

                story_id=job.story_id,

                scene_ids=job.scene_ids,

            )



            model_info = await client.get_model(job.model_name)



            job.status = "generating"

            self.db.commit()



            previous_clip = None

            completed = 0

            failed = 0
            generated_clip_ids = []



            for index, scene in enumerate(scenes, start=1):

                clip = None



                try:

                    storyboard = (

                        self.db.query(StoryBoard)

                        .filter(StoryBoard.id == scene.story_board_id)

                        .first()

                    )



                    if storyboard is None:

                        raise ValueError(

                            f"Storyboard not found for scene {scene.id}."

                        )



                    dialogue = self._extract_dialogue_text(scene)

                    prompt = self._build_scene_prompt(scene)



                    references = self._get_scene_image_references(

                        scene=scene,

                        storyboard_id=storyboard.id,

                    )



                    # Increment the version for each regenerated scene.

                    latest = (

                        self.db.query(SceneVideoClip)

                        .filter(SceneVideoClip.scene_id == scene.id)

                        .order_by(SceneVideoClip.version.desc())

                        .first()

                    )



                    version = (latest.version + 1) if latest else 1



                    clip = SceneVideoClip(

                        scene_id=scene.id,

                        clip_number=index,

                        title=scene.title or f"Scene {index}",

                        scene_description=(

                            scene.visual_description

                            or scene.summary

                            or ""

                        ),

                        dialogue_text=dialogue,

                        prompt=prompt,

                        provider="openrouter",

                        model_name=job.model_name,

                        status="generating",

                        version=version,

                        generation_metadata={

                            "job_id": job.id,

                            "story_id": job.story_id,

                            "storyboard_id": storyboard.id,

                            "reference_image_count": len(references),

                        },

                    )



                    self.db.add(clip)

                    self.db.commit()

                    self.db.refresh(clip)



                    duration = self._choose_duration(

                        model_info,

                        dialogue,

                        scene,

                    )

                    clip.planned_duration_seconds = duration

                    self.db.commit()



                    # Use the previous clip's last frame for continuity. For the
                    # first clip (or if continuation is unavailable), use the
                    # generated scene sketch as the opening frame when supported.
                    supported_frames = model_info.get("supported_frame_images") or []
                    frame_images = []
                    previous_clip_id = None

                    if (
                        previous_clip is not None
                        and previous_clip.storage_key
                        and "first_frame" in supported_frames
                    ):
                        previous_video_path = (
                            storage.storage_dir / previous_clip.storage_key
                        ).resolve()

                        if (
                            storage.storage_dir.resolve() in previous_video_path.parents
                            and previous_video_path.is_file()
                        ):
                            previous_frame_path = storage.continuation_frame_path(
                                project_id=job.project_id or 0,
                                story_id=job.story_id,
                                scene_id=previous_clip.scene_id,
                                clip_id=previous_clip.id,
                            )

                            if previous_frame_path.is_file():
                                frame_images = [
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": self._image_path_to_data_url(
                                                previous_frame_path
                                            )
                                        },
                                        "frame_type": "first_frame",
                                    }
                                ]
                                previous_clip_id = previous_clip.id

                    # Scene sketch is the first-frame fallback. It is generated
                    # by the existing sketch pipeline, which has access to the
                    # character/location master references.
                    if not frame_images and "first_frame" in supported_frames:
                        latest_scene_sketch = (
                            self.db.query(SceneSketch)
                            .filter(
                                SceneSketch.scene_id == scene.id,
                                SceneSketch.status == "generated",
                            )
                            .order_by(SceneSketch.created_at.desc())
                            .first()
                        )

                        if latest_scene_sketch and latest_scene_sketch.storage_key:
                            sketch_storage = SceneSketchStorage()
                            sketch_data_url = SceneSketchService._image_to_data_url(
                                sketch_storage.storage_dir,
                                latest_scene_sketch.storage_key,
                                latest_scene_sketch.mime_type,
                            )
                            if sketch_data_url:
                                frame_images = [
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": sketch_data_url},
                                        "frame_type": "first_frame",
                                    }
                                ]

                    # Reference-image support is model-specific.

                    supported_reference_types = (

                        model_info.get("supported_input_reference_types")

                        or model_info.get("supported_input_references")

                        or []

                    )



                    supports_input_references = bool(supported_reference_types)



                    input_references = (

                        self._format_video_references(references)

                        if supports_input_references

                        else []

                    )



                    # Do not send duplicate images if the continuation

                    # frame is already supplied separately.

                    if frame_images:

                        continuation_url = (

                            frame_images[0]["image_url"]["url"]

                        )

                        input_references = [

                            item

                            for item in input_references

                            if item.get("image_url", {}).get("url")

                            != continuation_url

                        ]



                    supported_resolutions = model_info.get("supported_resolutions") or []



                    preferred_resolutions = ["720p", "768p", "480p", "1080p", "2K"]

                    resolution = next(

                        (

                            value

                            for value in preferred_resolutions

                            if value in supported_resolutions

                        ),

                        supported_resolutions[0] if supported_resolutions else None,

                    )



                    supported_ratios = model_info.get("supported_aspect_ratios") or []

                    aspect_ratio = (

                        "16:9"

                        if "16:9" in supported_ratios

                        else supported_ratios[0] if supported_ratios else None

                    )



                    audio_capability = model_info.get("generate_audio")

                    if "heygen/heygen-video-1" in job.model_name:
                        generate_audio = None  # Omit this parameter for HeyGen
                    else:
                        generate_audio = (
                            audio_capability
                            if isinstance(audio_capability, bool)
                            else None
                        )



                    submission = await client.submit_video(

                        model=job.model_name,

                        prompt=prompt,

                        duration=duration,

                        aspect_ratio=aspect_ratio,

                        resolution=resolution,

                        generate_audio=generate_audio,

                        frame_images=frame_images or None,

                        input_references=input_references or None,

                    )



                    clip.previous_clip_id = previous_clip_id

                    clip.generation_metadata = {

                        **(clip.generation_metadata or {}),

                        "provider_job_id": submission["id"],

                        "provider_status": submission.get("status"),

                    }

                    self.db.commit()



                    result = await client.poll_job(submission["id"])



                    output_path = storage.video_path(

                        project_id=job.project_id or 0,

                        story_id=job.story_id,

                        scene_id=scene.id,

                        clip_id=clip.id,

                    )



                    await client.download_video(

                        result,

                        str(output_path),

                    )



                    frame_path = storage.continuation_frame_path(

                        project_id=job.project_id or 0,

                        story_id=job.story_id,

                        scene_id=scene.id,

                        clip_id=clip.id,

                    )



                    frame_extracted = await asyncio.to_thread(

                        self._extract_last_frame,

                        output_path,

                        frame_path,

                    )



                    clip.storage_key = storage.relative_key(output_path)

                    clip.mime_type = "video/mp4"

                    clip.file_size_bytes = output_path.stat().st_size

                    clip.actual_duration_seconds = duration

                    clip.status = "generated"

                    clip.error_message = None



                    if frame_extracted:

                        clip.continuation_frame_key = (

                            frame_path.resolve()

                            .relative_to(storage.storage_dir)

                            .as_posix()

                        )



                    clip.generation_metadata = {

                        **(clip.generation_metadata or {}),

                        "frame_extracted": frame_extracted,

                    }



                    self.db.commit()



                    previous_clip = clip

                    completed += 1
                    generated_clip_ids.append(clip.id)



                except Exception as exc:

                    self.db.rollback()



                    failed += 1

                    logging.exception(

                        "Video generation failed for scene %s",

                        scene.id,

                    )



                    if clip is not None:

                        failed_clip = (

                            self.db.query(SceneVideoClip)

                            .filter(SceneVideoClip.id == clip.id)

                            .first()

                        )



                        if failed_clip is not None:

                            failed_clip.status = "failed"

                            failed_clip.error_message = str(exc)[:4000]

                            self.db.commit()




                job = (
                    self.db.query(VideoGenerationJob)
                    .filter(VideoGenerationJob.id == job_id)
                    .first()
                )

                if job is not None:
                    job.completed_scenes = completed
                    job.failed_scenes = failed
                    job.error_message = None

                    # Assemble only when every scene generated successfully.
                    if failed == 0 and completed == len(scenes) and completed > 0:
                        try:
                            clip_by_id = {
                                clip.id: clip
                                for clip in (
                                    self.db.query(SceneVideoClip)
                                    .filter(
                                        SceneVideoClip.id.in_(generated_clip_ids),
                                        SceneVideoClip.status == "generated",
                                    )
                                    .all()
                                )
                            }

                            # Preserve storyboard order using the generation sequence.
                            ordered_clips = [
                                clip_by_id[clip_id]
                                for clip_id in generated_clip_ids
                                if clip_id in clip_by_id
                            ]

                            if len(ordered_clips) != len(scenes):
                                raise VideoAssemblyError(
                                    "Not every generated scene clip could be found."
                                )

                            clip_paths = []

                            for clip in ordered_clips:
                                if not clip.storage_key:
                                    raise VideoAssemblyError(
                                        f"Clip {clip.id} has no storage key."
                                    )

                                clip_path = (
                                    storage.storage_dir / clip.storage_key
                                ).resolve()

                                if (
                                    storage.storage_dir.resolve() not in clip_path.parents
                                    or not clip_path.is_file()
                                ):
                                    raise VideoAssemblyError(
                                        f"Video file missing for clip {clip.id}."
                                    )

                                clip_paths.append(str(clip_path))

                            assembler = VideoAssemblyService()
                            output_path = assembler.assemble(
                                clip_paths,
                                output_filename=f"story_{job.story_id}_job_{job.id}.mp4",
                            )

                            # Store a path relative to the assembly output directory.
                            job.output_storage_key = (
                                output_path.resolve()
                                .relative_to(assembler.output_dir.resolve())
                                .as_posix()
                            )
                            job.status = "completed"

                        except Exception as exc:
                            logging.exception(
                                "Automatic video assembly failed for job %s",
                                job.id,
                            )
                            job.status = "failed"
                            job.error_message = (
                                f"All scenes generated, but video assembly failed: {exc}"
                            )[:4000]

                    else:
                        job.status = "failed"
                        job.error_message = (
                            f"{failed} scene(s) failed; final video was not assembled."
                            if failed
                            else "Not all scenes completed; final video was not assembled."
                        )

                    job.completed_at = datetime.now(timezone.utc)
                    self.db.commit()




                if job is not None:

                    job.completed_scenes = completed

                    job.failed_scenes = failed

                    job.status = "generating"

                    self.db.commit()



            job = (

                self.db.query(VideoGenerationJob)

                .filter(VideoGenerationJob.id == job_id)

                .first()

            )



            if job is not None:

                job.completed_scenes = completed

                job.failed_scenes = failed

                job.status = (

                    "completed"

                    if completed > 0

                    else "failed"

                )

                job.error_message = (

                    f"{failed} scene(s) failed."

                    if failed

                    else None

                )

                job.completed_at = datetime.now(timezone.utc)

                self.db.commit()



        except Exception as exc:

            self.db.rollback()

            logging.exception(

                "Video generation job %s failed",

                job_id,

            )



            job = (

                self.db.query(VideoGenerationJob)

                .filter(VideoGenerationJob.id == job_id)

                .first()

            )



            if job is not None:

                job.status = "failed"

                job.error_message = str(exc)[:4000]

                job.completed_at = datetime.now(timezone.utc)

                self.db.commit()



    def create_job(

        self,

        *,

        story_id: int,

        generation_mode: str,

        provider: str,

        model_name: str,

        scene_ids: Sequence[int] | None = None,

        project_id: int | None = None,

    ) -> VideoGenerationJob:

        """Create and persist a queued video-generation job."""



        # Only models on the configured allowlist may be requested, so a
        # caller cannot pick an arbitrary (expensive) OpenRouter model.
        allowed_video_models = set(settings.OPENROUTER_VIDEO_MODELS)
        if model_name not in allowed_video_models:
            raise ValueError(
                "Unsupported video model. Choose one of: "
                + ", ".join(sorted(allowed_video_models))
            )

        # Refuse a new job while one is already running for this story, so a
        # single story cannot spin up unbounded concurrent generation work.
        active = (
            self.db.query(VideoGenerationJob)
            .filter(
                VideoGenerationJob.story_id == story_id,
                VideoGenerationJob.status.in_(
                    ["queued", "planning", "generating", "assembling"]
                ),
            )
            .first()
        )
        if active is not None:
            raise ValueError(
                "A video generation job is already running for this story. "
                "Wait for it to finish before starting another."
            )

        if generation_mode not in self.VALID_MODES:

            raise ValueError(

                "generation_mode must be 'all', 'selected', "

                "or 'newly_added'."

            )



        if generation_mode == "selected" and not scene_ids:

            raise ValueError(

                "scene_ids are required for selected-scene generation."

            )



        selected_ids = (

            list(dict.fromkeys(scene_ids))

            if scene_ids is not None

            else None

        )



        scenes = self.get_storyboard_scenes(

            story_id=story_id,

            scene_ids=selected_ids if generation_mode == "selected" else None,

        )



        if generation_mode == "newly_added":

            existing_scene_ids = {

                scene_id

                for (scene_id,) in (

                    self.db.query(SceneVideoClip.scene_id)

                    .filter(

                        SceneVideoClip.status == "generated",

                        SceneVideoClip.scene_id.in_(

                            [scene.id for scene in scenes]

                        ),

                    )

                    .distinct()

                    .all()

                )

            }



            scenes = [

                scene for scene in scenes

                if scene.id not in existing_scene_ids

            ]



            if not scenes:

                raise ValueError(

                    "There are no newly added scenes without generated clips."

                )



        job = VideoGenerationJob(

            story_id=story_id,

            project_id=project_id,

            generation_mode=generation_mode,

            status="queued",

            total_scenes=len(scenes),

            completed_scenes=0,

            failed_scenes=0,

            scene_ids=[scene.id for scene in scenes],

            provider=provider,

            model_name=model_name,

            job_metadata={},

        )



        self.db.add(job)

        self.db.commit()

        self.db.refresh(job)



        return job

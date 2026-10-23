from sqlalchemy.orm import Session

from app.models import SceneVideoClip, VideoGenerationJob


class VideoGenerationRepository:
    """Database operations for video-generation jobs and scene clips."""

    def __init__(self, db: Session):
        self.db = db

    def create_job(self, **data) -> VideoGenerationJob:
        job = VideoGenerationJob(**data)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def get_job(self, job_id: int) -> VideoGenerationJob | None:
        return (
            self.db.query(VideoGenerationJob)
            .filter(VideoGenerationJob.id == job_id)
            .first()
        )

    def get_jobs_for_story(
        self,
        story_id: int,
        limit: int = 50,
    ) -> list[VideoGenerationJob]:
        return (
            self.db.query(VideoGenerationJob)
            .filter(VideoGenerationJob.story_id == story_id)
            .order_by(VideoGenerationJob.created_at.desc())
            .limit(limit)
            .all()
        )

    def update_job(self, job_id: int, **changes) -> VideoGenerationJob | None:
        job = self.get_job(job_id)
        if job is None:
            return None

        for key, value in changes.items():
            setattr(job, key, value)

        self.db.commit()
        self.db.refresh(job)
        return job

    def create_clip(self, **data) -> SceneVideoClip:
        clip = SceneVideoClip(**data)
        self.db.add(clip)
        self.db.commit()
        self.db.refresh(clip)
        return clip

    def get_clip(self, clip_id: int) -> SceneVideoClip | None:
        return (
            self.db.query(SceneVideoClip)
            .filter(SceneVideoClip.id == clip_id)
            .first()
        )

    def get_clips_for_scene(
        self,
        scene_id: int,
    ) -> list[SceneVideoClip]:
        return (
            self.db.query(SceneVideoClip)
            .filter(SceneVideoClip.scene_id == scene_id)
            .order_by(
                SceneVideoClip.clip_number.asc(),
                SceneVideoClip.version.desc(),
            )
            .all()
        )

    def update_clip(
        self,
        clip_id: int,
        **changes,
    ) -> SceneVideoClip | None:
        clip = self.get_clip(clip_id)
        if clip is None:
            return None

        for key, value in changes.items():
            setattr(clip, key, value)

        self.db.commit()
        self.db.refresh(clip)
        return clip

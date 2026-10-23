from pathlib import Path
import re

from app.core.config import STORY_SERVICE_DIR


class SceneVideoStorage:
    """Store generated scene videos and continuation frames locally."""

    def __init__(self) -> None:
        self.storage_dir = (
            STORY_SERVICE_DIR / "storage" / "scene_videos"
        ).resolve()
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _safe_name(value: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_")
        return cleaned or "file"

    def scene_directory(
        self,
        *,
        project_id: int,
        story_id: int,
        scene_id: int,
    ) -> Path:
        directory = (
            self.storage_dir
            / f"project_{project_id}"
            / f"story_{story_id}"
            / f"scene_{scene_id}"
        ).resolve()

        if self.storage_dir not in directory.parents:
            raise ValueError("Invalid video storage path.")

        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def video_path(
        self,
        *,
        project_id: int,
        story_id: int,
        scene_id: int,
        clip_id: int,
        extension: str = ".mp4",
    ) -> Path:
        if extension not in {".mp4", ".webm", ".mov"}:
            raise ValueError("Unsupported video extension.")

        directory = self.scene_directory(
            project_id=project_id,
            story_id=story_id,
            scene_id=scene_id,
        )

        return directory / f"clip_{clip_id}{extension}"

    def continuation_frame_path(
        self,
        *,
        project_id: int,
        story_id: int,
        scene_id: int,
        clip_id: int,
    ) -> Path:
        directory = self.scene_directory(
            project_id=project_id,
            story_id=story_id,
            scene_id=scene_id,
        )

        return directory / f"clip_{clip_id}_last_frame.png"

    def relative_key(self, path: Path) -> str:
        resolved = path.resolve()

        if self.storage_dir not in resolved.parents:
            raise ValueError("File is outside the video storage directory.")

        return resolved.relative_to(self.storage_dir).as_posix()

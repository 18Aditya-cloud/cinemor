import re
import uuid
from pathlib import Path


class SceneSketchStorage:
    """Store generated scene-sketch images."""

    MAX_FILE_SIZE = 15 * 1024 * 1024
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".webp"}

    def __init__(self, storage_dir: str | None = None) -> None:
        if storage_dir:
            self.storage_dir = Path(storage_dir).resolve()
        else:
            self.storage_dir = (
                Path(__file__).resolve().parents[2]
                / "storage"
                / "scene-sketches"
            )

        self.storage_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _safe_segment(value: str) -> str:
        value = re.sub(r"[^a-zA-Z0-9_-]", "_", value)
        return value[:80] or "unknown"

    def save_bytes(
        self,
        *,
        image_bytes: bytes,
        project_id: int,
        story_id: int,
        scene_id: int,
        sketch_number: int,
        version: int,
        extension: str,
    ) -> tuple[str, str]:
        if not image_bytes:
            raise ValueError("Image content cannot be empty.")

        if len(image_bytes) > self.MAX_FILE_SIZE:
            raise ValueError("Image size exceeds the 15 MB limit.")

        if extension not in self.ALLOWED_EXTENSIONS:
            raise ValueError("Unsupported image extension.")

        directory = (
            self.storage_dir
            / str(project_id)
            / str(story_id)
            / str(scene_id)
            / self._safe_segment(
                f"sketch-{sketch_number}-v{version}"
            )
        )
        directory.mkdir(parents=True, exist_ok=True)

        filename = f"{uuid.uuid4().hex}{extension}"
        destination = directory / filename
        destination.write_bytes(image_bytes)

        storage_key = destination.relative_to(
            self.storage_dir
        ).as_posix()

        return str(destination), storage_key

    def delete_file(self, storage_key: str) -> bool:
        root = self.storage_dir.resolve()
        candidate = (root / storage_key).resolve()

        if candidate == root or root not in candidate.parents:
            raise ValueError("Invalid storage key.")

        if not candidate.is_file():
            return False

        candidate.unlink()
        return True
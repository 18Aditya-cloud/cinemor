
import re
import uuid
from pathlib import Path

from fastapi import UploadFile


class LocationMasterImageStorage:
    ALLOWED_MIME_TYPES = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }

    MAX_FILE_SIZE = 15 * 1024 * 1024

    def __init__(self, storage_dir: str | None = None) -> None:
        if storage_dir:
            self.storage_dir = Path(storage_dir).resolve()
        else:
            self.storage_dir = (
                Path(__file__).resolve().parents[2]
                / "storage"
                / "location-master-images"
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
        location_id: int,
        image_type: str,
        extension: str,
    ) -> tuple[str, str]:
        if not image_bytes:
            raise ValueError("Image content cannot be empty.")

        if len(image_bytes) > self.MAX_FILE_SIZE:
            raise ValueError("Image size exceeds the 15 MB limit.")

        if extension not in {".png", ".jpg", ".webp"}:
            raise ValueError("Unsupported image extension.")

        directory = (
            self.storage_dir
            / str(project_id)
            / str(story_id)
            / str(location_id)
            / self._safe_segment(image_type)
        )
        directory.mkdir(parents=True, exist_ok=True)

        filename = f"{uuid.uuid4().hex}{extension}"
        destination = directory / filename
        destination.write_bytes(image_bytes)

        storage_key = destination.relative_to(
            self.storage_dir
        ).as_posix()

        return str(destination), storage_key

    async def save_upload(
        self,
        *,
        upload: UploadFile,
        project_id: int,
        story_id: int,
        location_id: int,
        image_type: str,
    ) -> tuple[str, str, bytes]:
        extension = self.ALLOWED_MIME_TYPES.get(
            upload.content_type or ""
        )

        if extension is None:
            raise ValueError(
                "Only PNG, JPEG, and WebP images are supported."
            )

        image_bytes = await upload.read(self.MAX_FILE_SIZE + 1)

        if len(image_bytes) > self.MAX_FILE_SIZE:
            raise ValueError("Image size exceeds the 15 MB limit.")

        path, storage_key = self.save_bytes(
            image_bytes=image_bytes,
            project_id=project_id,
            story_id=story_id,
            location_id=location_id,
            image_type=image_type,
            extension=extension,
        )

        return path, storage_key, image_bytes

    def delete_file(self, storage_key: str) -> bool:
        root = self.storage_dir.resolve()
        candidate = (root / storage_key).resolve()

        if candidate == root or root not in candidate.parents:
            raise ValueError("Invalid storage key.")

        if not candidate.is_file():
            return False

        candidate.unlink()
        return True

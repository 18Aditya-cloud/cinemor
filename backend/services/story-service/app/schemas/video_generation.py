from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


GenerationMode = Literal["all", "selected", "newly_added"]


class VideoGenerationRequest(BaseModel):
    story_id: int = Field(gt=0)
    project_id: int | None = Field(default=None, gt=0)
    generation_mode: GenerationMode = "all"
    scene_ids: list[int] | None = None
    provider: Literal["openrouter"] = "openrouter"
    model_name: str = "heygen/heygen-video-1"

    @model_validator(mode="after")
    def validate_scene_selection(self):
        if self.generation_mode == "selected" and not self.scene_ids:
            raise ValueError(
                "scene_ids are required for selected-scene generation."
            )

        if self.scene_ids is not None:
            if any(scene_id <= 0 for scene_id in self.scene_ids):
                raise ValueError("Every scene ID must be positive.")

            if len(set(self.scene_ids)) != len(self.scene_ids):
                raise ValueError("scene_ids must not contain duplicates.")

        return self


class VideoGenerationJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    story_id: int
    project_id: int | None
    generation_mode: str
    status: str
    total_scenes: int
    completed_scenes: int
    failed_scenes: int
    scene_ids: list[int] | None
    provider: str
    model_name: str
    output_video_url: str | None = None
    error_message: str | None = None


class SceneVideoClipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scene_id: int
    clip_number: int
    title: str
    provider: str
    model_name: str
    planned_duration_seconds: int | None
    actual_duration_seconds: int | None
    video_url: str | None
    storage_key: str | None
    status: str
    error_message: str | None
    previous_clip_id: int | None
    version: int

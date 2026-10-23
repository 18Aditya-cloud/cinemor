
from pydantic import BaseModel, Field


class SceneSketchGenerateRequest(BaseModel):
    model_id: str = "black-forest-labs/flux.2-flex"
    prompt: str | None = None
    sketch_number: int = Field(default=1, ge=1)
    title: str | None = None
    description: str | None = None
    camera_details: str | None = None


class SceneSketchResponse(BaseModel):
    id: int
    scene_id: int
    sketch_number: int
    title: str
    description: str
    camera_details: str
    prompt: str
    model_name: str
    model_version: str
    image_url: str | None = None
    storage_key: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None
    source_type: str
    status: str
    version: int
    error_message: str | None = None

    model_config = {"from_attributes": True}


class SceneSketchListResponse(BaseModel):
    sketches: list[SceneSketchResponse]
    total: int

class AutoSceneSketchRequest(BaseModel):
    model_id: str = "black-forest-labs/flux.2-flex"
    prompt: str | None = None
    max_sketches: int = Field(default=1, ge=1, le=8)


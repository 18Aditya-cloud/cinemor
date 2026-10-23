
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MasterImageGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_type: Literal["canonical", "reference_sheet"]
    model_id: str = Field(min_length=1, max_length=255)
    customization_instructions: str = Field(
        default="",
        max_length=10000,
    )


class MasterImageUploadMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_type: Literal["canonical", "reference_sheet", "user_upload"] = (
        "user_upload"
    )

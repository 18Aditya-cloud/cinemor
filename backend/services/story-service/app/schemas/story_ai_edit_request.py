from pydantic import BaseModel, Field


class StoryAIEditRequest(BaseModel):
    instruction: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Instruction describing how the AI should modify the existing story.",
    )
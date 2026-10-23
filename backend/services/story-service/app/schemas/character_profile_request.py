
from pydantic import BaseModel, Field, ConfigDict


class CharacterProfileGenerateRequest(BaseModel):
    """Options for generating a character's canonical visual profile."""

    model_config = ConfigDict(extra="forbid")

    style_name: str = Field(min_length=1, max_length=150)
    style_instructions: str = Field(default="", max_length=10000)
    customization_instructions: str = Field(default="", max_length=10000)
    reference_information: str = Field(default="", max_length=10000)
    model_id: str | None = Field(default=None, max_length=255)


from typing import Literal

from pydantic import BaseModel, Field


class CharacterSchema(BaseModel):
    character_id: str
    name: str
    role: str = "supporting"
    age: str | None = None
    description: str
    personality: list[str] = Field(default_factory=list)
    appearance: str | None = None
    goals: list[str] = Field(default_factory=list)
    relationships: list[dict] = Field(default_factory=list)


class LocationSchema(BaseModel):
    location_id: str
    name: str
    description: str
    visual_details: list[str] = Field(default_factory=list)
    atmosphere: str | None = None


class ObjectSchema(BaseModel):
    object_id: str
    name: str
    description: str
    significance: str | None = None


class NarratorSchema(BaseModel):
    narrator_type: Literal[
        "character",
        "omniscient",
        "external",
        "custom",
    ] = "external"
    name: str | None = None
    voice_description: str | None = None
    point_of_view: str = "third_person_limited"


class SceneSchema(BaseModel):
    scene_id: str
    scene_number: int = Field(ge=1)
    title: str
    summary: str
    location_id: str | None = None
    character_ids: list[str] = Field(default_factory=list)
    object_ids: list[str] = Field(default_factory=list)
    time_of_day: str | None = None
    mood: str | None = None
    visual_description: str
    action: list[str] = Field(default_factory=list)
    dialogue: list[dict] = Field(default_factory=list)
    transition: str | None = None


class StoryboardSchema(BaseModel):
    story_id: int
    title: str
    language: str
    story_format: str
    point_of_view: str

    logline: str | None = None
    synopsis: str | None = None

    characters: list[CharacterSchema] = Field(default_factory=list)
    locations: list[LocationSchema] = Field(default_factory=list)
    objects: list[ObjectSchema] = Field(default_factory=list)
    narrator: NarratorSchema = Field(default_factory=NarratorSchema)
    scenes: list[SceneSchema] = Field(default_factory=list)

    total_scenes: int = Field(default=0, ge=0)

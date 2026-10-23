
from typing import Any

from sqlalchemy.orm import Session

from app.models.character_appearance import CharacterAppearance
from app.models.characters import Character
from app.models.dialogues import Dialogue
from app.models.location import Location
from app.models.narrator import Narrator
from app.models.objects import StoryObject
from app.models.relationship import CharacterRelationship
from app.models.scene_character import SceneCharacter
from app.models.scenes import Scene


class StoryboardEntityRepository:
    """Database operations for storyboard entity tables."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def delete_entities(self, storyboard_id: int) -> None:
        """Delete dependent records before rebuilding a storyboard."""

        scene_ids = [
            row[0]
            for row in self.db.query(Scene.id)
            .filter(Scene.story_board_id == storyboard_id)
            .all()
        ]

        character_ids = [
            row[0]
            for row in self.db.query(Character.id)
            .filter(Character.story_board_id == storyboard_id)
            .all()
        ]

        if character_ids:
            self.db.query(CharacterAppearance).filter(
                CharacterAppearance.character_id.in_(character_ids)
            ).delete(synchronize_session=False)

        if scene_ids:
            self.db.query(SceneCharacter).filter(
                SceneCharacter.scene_id.in_(scene_ids)
            ).delete(synchronize_session=False)

            self.db.query(Dialogue).filter(
                Dialogue.scene_id.in_(scene_ids)
            ).delete(synchronize_session=False)

            self.db.query(StoryObject).filter(
                StoryObject.scene_id.in_(scene_ids)
            ).delete(synchronize_session=False)

        self.db.query(StoryObject).filter(
            StoryObject.story_board_id == storyboard_id
        ).delete(synchronize_session=False)

        self.db.query(CharacterRelationship).filter(
            CharacterRelationship.story_board_id == storyboard_id
        ).delete(synchronize_session=False)

        self.db.query(Narrator).filter(
            Narrator.story_board_id == storyboard_id
        ).delete(synchronize_session=False)

        # Scenes reference locations, so delete scenes first.
        self.db.query(Scene).filter(
            Scene.story_board_id == storyboard_id
        ).delete(synchronize_session=False)

        self.db.query(Character).filter(
            Character.story_board_id == storyboard_id
        ).delete(synchronize_session=False)

        self.db.query(Location).filter(
            Location.story_board_id == storyboard_id
        ).delete(synchronize_session=False)

    def add_character(self, **values: Any) -> Character:
        record = Character(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_location(self, **values: Any) -> Location:
        record = Location(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_scene(self, **values: Any) -> Scene:
        record = Scene(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_appearance(self, **values: Any) -> CharacterAppearance:
        record = CharacterAppearance(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_relationship(self, **values: Any) -> CharacterRelationship:
        record = CharacterRelationship(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_object(self, **values: Any) -> StoryObject:
        record = StoryObject(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_narrator(self, **values: Any) -> Narrator:
        record = Narrator(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_scene_character(self, **values: Any) -> SceneCharacter:
        record = SceneCharacter(**values)
        self.db.add(record)
        self.db.flush()
        return record

    def add_dialogue(self, **values: Any) -> Dialogue:
        record = Dialogue(**values)
        self.db.add(record)
        self.db.flush()
        return record

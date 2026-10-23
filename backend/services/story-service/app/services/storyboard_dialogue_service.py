"""
Change the text of one dialogue line of a storyboard.

A line is stored in three places, and all three are updated together:
    story_board.storyboard_data   scenes[i].dialogues[j].text   (what the Storyboard page shows and exports)
    scenes.scene_data             dialogues[j].text             (what video generation reads)
    dialogues.dialogue_text       (and dialogue_data.text)      (the line's own row)

Scenes and lines are addressed by their position in storyboard_data (0-based), so lines without an id
(or with repeated ids) can be edited too.
"""

from __future__ import annotations

import copy

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.dialogues import Dialogue
from app.models.scenes import Scene
from app.models.story_board import StoryBoard


class StoryboardDialogueService:
    def __init__(self, db: Session):
        self.db = db

    def update_text(
        self,
        *,
        storyboard: StoryBoard,
        scene_index: int,
        dialogue_index: int,
        text: str,
    ) -> StoryBoard:
        text = (text or "").strip()
        if not text:
            raise ValueError("The line cannot be empty.")

        data = copy.deepcopy(storyboard.storyboard_data or {})
        scenes = data.get("scenes")
        if not isinstance(scenes, list) or not 0 <= scene_index < len(scenes) or not isinstance(scenes[scene_index], dict):
            raise LookupError("Scene not found in this storyboard.")
        scene = scenes[scene_index]
        lines = scene.get("dialogues")
        if not isinstance(lines, list) or not 0 <= dialogue_index < len(lines) or not isinstance(lines[dialogue_index], dict):
            raise LookupError("Dialogue line not found in this scene.")
        item = lines[dialogue_index]
        key = "line" if "line" in item and "text" not in item else "text"
        item[key] = text

        storyboard.storyboard_data = data
        flag_modified(storyboard, "storyboard_data")

        # the scene's own row (video generation reads its scene_data)
        scene_row = (
            self.db.query(Scene)
            .filter(
                Scene.story_board_id == storyboard.id,
                Scene.scene_json_id == scene.get("scene_id"),
            )
            .first()
        )
        if scene_row is not None:
            scene_data = copy.deepcopy(scene_row.scene_data or {})
            row_lines = scene_data.get("dialogues")
            if isinstance(row_lines, list) and dialogue_index < len(row_lines) and isinstance(row_lines[dialogue_index], dict):
                row_lines[dialogue_index]["text"] = text
                scene_row.scene_data = scene_data
                flag_modified(scene_row, "scene_data")

            # the line's row: by its id when that is unique, else by its position
            rows = (
                self.db.query(Dialogue)
                .filter(Dialogue.scene_id == scene_row.id)
                .order_by(Dialogue.id)
                .all()
            )
            target = None
            json_id = item.get("dialogue_id")
            if json_id is not None:
                same = [row for row in rows if row.dialogue_json_id == json_id]
                if len(same) == 1:
                    target = same[0]
            if target is None and len(rows) == len(lines):
                target = rows[dialogue_index]
            if target is not None:
                target.dialogue_text = text
                row_data = copy.deepcopy(target.dialogue_data or {})
                if isinstance(row_data, dict):
                    row_data["text"] = text
                    target.dialogue_data = row_data
                    flag_modified(target, "dialogue_data")

        self.db.commit()
        self.db.refresh(storyboard)
        return storyboard

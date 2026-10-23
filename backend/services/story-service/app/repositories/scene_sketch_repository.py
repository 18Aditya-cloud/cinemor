
from sqlalchemy.orm import Session

from app.models.scene_sketch import SceneSketch


class SceneSketchRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, sketch: SceneSketch) -> SceneSketch:
        self.db.add(sketch)
        self.db.flush()
        return sketch

    def get_by_id(self, sketch_id: int) -> SceneSketch | None:
        return (
            self.db.query(SceneSketch)
            .filter(SceneSketch.id == sketch_id)
            .first()
        )

    def list_by_scene(
        self,
        scene_id: int,
    ) -> list[SceneSketch]:
        return (
            self.db.query(SceneSketch)
            .filter(SceneSketch.scene_id == scene_id)
            .order_by(
                SceneSketch.sketch_number.asc(),
                SceneSketch.version.desc(),
                SceneSketch.id.desc(),
            )
            .all()
        )

    def get_next_version(
        self,
        *,
        scene_id: int,
        sketch_number: int,
    ) -> int:
        latest = (
            self.db.query(SceneSketch.version)
            .filter(
                SceneSketch.scene_id == scene_id,
                SceneSketch.sketch_number == sketch_number,
            )
            .order_by(SceneSketch.version.desc())
            .first()
        )

        return (latest[0] if latest else 0) + 1

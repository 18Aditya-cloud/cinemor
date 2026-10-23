from app.database.session import SessionLocal
from app.services.story_service import StoryService


def main() -> None:
    db = SessionLocal()

    try:
        story_service = StoryService(db)

        story_service.initialize_story_version(
            story_id=7,
        )

        print("Story #7 version initialized successfully.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


# ---------------------------------------------------------
# Database Engine
# ---------------------------------------------------------

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
)


# ---------------------------------------------------------
# Session Factory
# ---------------------------------------------------------

SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


# ---------------------------------------------------------
# FastAPI Database Dependency
# ---------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """
    Provide a database session for a request.

    The session is always closed after the request finishes.
    """

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
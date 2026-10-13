from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from config import settings
from logging_config import get_logger

logger = get_logger("db")

# DATABASE_URL must be a PostgreSQL connection string.
# Set via DATABASE_URL env var (see .env.example).
# Example: postgresql+psycopg2://paperchat:secret@localhost:5432/paperchat
DATABASE_URL = settings.DATABASE_URL

if not DATABASE_URL or DATABASE_URL.startswith("sqlite"):
    logger.warning(
        "SQLite is no longer supported. Set DATABASE_URL to a PostgreSQL connection string. "
        "Example: postgresql+psycopg2://paperchat:secret@localhost:5432/paperchat"
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Verify DB connection is alive at startup.

    Schema is managed exclusively by Alembic migrations (alembic upgrade head).
    This function does NOT call create_all() -- run Alembic before starting
    the server on a fresh database.
    """
    import models  # noqa: F401
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("database connection ok url=%s", DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)
    except Exception as exc:
        logger.error("database connection FAILED: %s", exc)
        raise

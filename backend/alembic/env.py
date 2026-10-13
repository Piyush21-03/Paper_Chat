"""Alembic environment configuration for PaperChat.

Reads DATABASE_URL from the same env-var / config.py as the app so that
`alembic upgrade head` automatically uses the correct database whether
running locally or in Docker.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# ---------------------------------------------------------------------------
# Path setup: make the backend package importable from here.
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Load .env if present (same logic as the app startup).
try:
    from dotenv import load_dotenv
    _env = BACKEND_DIR.parent / ".env"
    if _env.exists():
        load_dotenv(_env)
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Alembic config object.
# ---------------------------------------------------------------------------
config = context.config

# Override sqlalchemy.url from the environment so we don't have to repeat
# the connection string in alembic.ini.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://paperchat:paperchat@localhost:5432/paperchat",
)
config.set_main_option(
    "sqlalchemy.url",
    DATABASE_URL.replace("%", "%%")
)

# Set up Python logging from alembic.ini.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import all models so Alembic can compare metadata for autogenerate.
# ---------------------------------------------------------------------------
from db import Base  # noqa: E402
import models  # noqa: E402, F401  -- registers all ORM classes onto Base

target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Migration runners
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """Run in 'offline' mode (emit SQL without connecting)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run in 'online' mode (requires a live database connection)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

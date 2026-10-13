"""Centralized, typed configuration. All production knobs are env-var
driven with safe local-dev defaults. Never hardcode secrets here."""

import os
from dataclasses import dataclass, field
from typing import List


def _bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    return default if val is None else val.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _list(name: str, default: List[str]) -> List[str]:
    val = os.environ.get(name)
    if not val:
        return default
    return [v.strip() for v in val.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    # ---- Database ----
    # PostgreSQL is required. Set DATABASE_URL in your .env file.
    # Format: postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DBNAME
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://paperchat:paperchat@localhost:5432/paperchat",
    )

    # ---- Qdrant ----
    QDRANT_URL: str = os.environ.get("QDRANT_URL", "http://localhost:6333")

    # ---- Redis (optional: enables Redis-backed rate limiting + job queue) ----
    REDIS_URL: str = os.environ.get("REDIS_URL", "")

    # ---- Background jobs ----
    JOB_BACKEND: str = os.environ.get("JOB_BACKEND", "inline")  # "inline" | "rq"

    # ---- Auth / JWT ----
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev-insecure-secret-change-me")
    JWT_ALGORITHM: str = os.environ.get("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = _int("JWT_EXPIRE_MINUTES", 60 * 24 * 7)  # 7 days

    # ---- CORS ----
    CORS_ORIGINS: List[str] = field(default_factory=lambda: _list("CORS_ORIGINS", ["*"]))

    # ---- Uploads ----
    MAX_UPLOAD_MB: int = _int("MAX_UPLOAD_MB", 20)

    # ---- Rate limiting ----
    RATE_LIMIT_PER_MINUTE: int = _int("RATE_LIMIT_PER_MINUTE", 60)
    AUTH_RATE_LIMIT_PER_MINUTE: int = _int("AUTH_RATE_LIMIT_PER_MINUTE", 10)

    # ---- Environment ----
    ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development")
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


settings = Settings()


def get_settings() -> Settings:
    return settings

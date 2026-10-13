from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import AppSettings, User
from schemas import SettingsOut, SettingsUpdateRequest
from retrieval import config as retrieval_config
from retrieval import runtime_settings
from logging_config import get_logger

logger = get_logger("settings_router")

router = APIRouter(prefix="/api/settings", tags=["settings"])

ROW_ID = "default"


def _row_to_overrides(row: AppSettings) -> dict:
    if row is None:
        return {}
    return {
        "dense_top_k": row.dense_top_k,
        "bm25_top_k": row.bm25_top_k,
        "rerank_top_k": row.rerank_top_k,
        "final_chunks": row.final_chunks,
        "reranker_enabled": (row.reranker_enabled == "true") if row.reranker_enabled is not None else None,
    }


def load_persisted_settings(db: Session) -> None:
    """Called once at app startup so overrides survive a restart."""
    row = db.get(AppSettings, ROW_ID)
    if row:
        runtime_settings.set_overrides(_row_to_overrides(row))


def _current() -> SettingsOut:
    return SettingsOut(
        dense_top_k=runtime_settings.get("dense_top_k", retrieval_config.DENSE_TOP_K),
        bm25_top_k=runtime_settings.get("bm25_top_k", retrieval_config.BM25_TOP_K),
        rerank_top_k=runtime_settings.get("rerank_top_k", retrieval_config.RERANK_TOP_K),
        final_chunks=runtime_settings.get("final_chunks", retrieval_config.FINAL_CHUNKS),
        reranker_enabled=runtime_settings.get("reranker_enabled", True),
        max_context_chars=retrieval_config.MAX_CONTEXT_CHARS,
    )


@router.get("", response_model=SettingsOut)
def get_settings(current_user: User = Depends(get_current_user)):
    return _current()


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    # Pydantic already validated ranges (ge/le); apply only provided fields.
    row = db.get(AppSettings, ROW_ID)
    if row is None:
        row = AppSettings(id=ROW_ID)
        db.add(row)

    if payload.dense_top_k is not None:
        row.dense_top_k = payload.dense_top_k
    if payload.bm25_top_k is not None:
        row.bm25_top_k = payload.bm25_top_k
    if payload.rerank_top_k is not None:
        row.rerank_top_k = payload.rerank_top_k
    if payload.final_chunks is not None:
        row.final_chunks = payload.final_chunks
    if payload.reranker_enabled is not None:
        row.reranker_enabled = "true" if payload.reranker_enabled else "false"

    db.commit()
    db.refresh(row)

    runtime_settings.set_overrides(_row_to_overrides(row))
    logger.info("settings updated: %s", runtime_settings.get_all_overrides())

    return _current()

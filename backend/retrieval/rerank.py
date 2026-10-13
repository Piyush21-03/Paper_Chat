"""Lazy-loaded cross-encoder reranker. Never blocks app startup, and
falls back gracefully (returns the input order unchanged) if the model
can't be loaded (no network, missing dependency, etc.) or fails at
inference time.
"""

import math
from typing import Any, Dict, List, Optional

from retrieval import config
from logging_config import get_logger

logger = get_logger("retrieval.rerank")

_model = None
_load_failed = False


def _get_model():

    global _model, _load_failed

    if _model is not None or _load_failed:
        return _model

    try:
        from sentence_transformers import CrossEncoder
        _model = CrossEncoder(config.RERANKER_MODEL)
    except Exception as error:
        logger.warning("reranker model load failed, falling back to fused ranking: %s", error)
        _load_failed = True
        _model = None

    return _model


def rerank(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: int = 8,
) -> List[Dict[str, Any]]:
    """Returns candidates re-ordered with an added "rerank_score" and
    "reranked": True, or the original (RRF-ordered) top_k candidates
    with "reranked": False if the reranker is unavailable.
    """

    if not candidates:
        return []

    model = _get_model()

    if model is None:
        return [
            {**c, "reranked": False}
            for c in candidates[:top_k]
        ]

    try:
        pairs = [(query, c["content"]) for c in candidates]
        raw_scores = model.predict(pairs)
    except Exception as error:
        logger.warning("rerank inference failed, falling back to fused ranking: %s", error)
        return [
            {**c, "reranked": False}
            for c in candidates[:top_k]
        ]

    scored = [
        {**c, "rerank_score": _sigmoid(float(s)), "reranked": True}
        for c, s in zip(candidates, raw_scores)
    ]

    scored.sort(key=lambda r: r["rerank_score"], reverse=True)

    return scored[:top_k]


def _sigmoid(x: float) -> float:
    try:
        return 1 / (1 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0

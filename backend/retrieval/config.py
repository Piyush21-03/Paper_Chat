"""Retrieval pipeline configuration, driven by environment variables
with sensible defaults. Never exposed to the frontend."""

import os


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


DENSE_TOP_K = _int_env("RAG_DENSE_TOP_K", 20)
BM25_TOP_K = _int_env("RAG_BM25_TOP_K", 20)
RRF_TOP_K = _int_env("RAG_RRF_TOP_K", 12)
RERANK_TOP_K = _int_env("RAG_RERANK_TOP_K", 8)
FINAL_CHUNKS = _int_env("RAG_FINAL_CHUNKS", 5)
MAX_CONTEXT_CHARS = _int_env("RAG_MAX_CONTEXT_CHARS", 12000)

# RRF constant (standard default; higher = flatter fusion curve)
RRF_K = _int_env("RAG_RRF_K", 60)

RERANKER_MODEL = os.environ.get("RAG_RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

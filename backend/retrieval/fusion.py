"""Reciprocal Rank Fusion of dense + BM25 result lists."""

from typing import Any, Dict, List


def reciprocal_rank_fusion(
    dense_results: List[Dict[str, Any]],
    bm25_results: List[Dict[str, Any]],
    k: int = 60,
    top_k: int = 12,
) -> List[Dict[str, Any]]:
    """Both inputs are already-ranked lists of chunk records (with a
    stable "chunk_id"). Returns a merged, deduplicated, re-ranked list
    with an added "rrf_score", truncated to top_k.
    """

    scores: Dict[str, float] = {}
    merged: Dict[str, Dict[str, Any]] = {}

    for rank, record in enumerate(dense_results):
        cid = record["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
        merged.setdefault(cid, record)

    for rank, record in enumerate(bm25_results):
        cid = record["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
        merged.setdefault(cid, record)

    fused = []
    for cid, record in merged.items():
        fused.append({**record, "rrf_score": scores[cid]})

    fused.sort(key=lambda r: r["rrf_score"], reverse=True)

    return fused[:top_k]

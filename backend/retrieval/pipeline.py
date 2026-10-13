"""Orchestrates the full retrieval pipeline (retrieval only -- no
generation, kept separate per architecture requirements):

question -> query rewrite -> dense + BM25 -> RRF -> rerank -> context

rag.py calls retrieve() and handles the Gemini generation step itself.
"""

import time
from typing import Any, Dict, List, Optional

from retrieval import config, context, dense_search, fusion, keyword_search, query_rewrite, rerank, runtime_settings


def retrieve(
    question: str,
    document_ids: Optional[List[str]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Returns:
    {
        "context": str,
        "sources": [...],
        "rewritten_query": str,
        "retrieval_latency_ms": float,
        "stage_meta": {dense_count, bm25_count, fused_count, reranked}
    }
    """

    start = time.perf_counter()

    dense_top_k = runtime_settings.get("dense_top_k", config.DENSE_TOP_K)
    bm25_top_k = runtime_settings.get("bm25_top_k", config.BM25_TOP_K)
    rerank_top_k = runtime_settings.get("rerank_top_k", config.RERANK_TOP_K)
    final_chunks = runtime_settings.get("final_chunks", config.FINAL_CHUNKS)
    reranker_enabled = runtime_settings.get("reranker_enabled", True)

    rewritten_query = query_rewrite.maybe_rewrite(question, history)

    dense_results = dense_search.dense_search(
        rewritten_query, document_ids, k=dense_top_k
    )

    bm25_results = keyword_search.keyword_search(
        rewritten_query, document_ids, k=bm25_top_k
    )

    fused = fusion.reciprocal_rank_fusion(
        dense_results, bm25_results, k=config.RRF_K, top_k=config.RRF_TOP_K
    )

    if reranker_enabled:
        reranked = rerank.rerank(rewritten_query, fused, top_k=rerank_top_k)
    else:
        reranked = [{**c, "reranked": False} for c in fused[:rerank_top_k]]

    context_str, sources = context.build_context(
        reranked, final_chunks=final_chunks, max_context_chars=config.MAX_CONTEXT_CHARS
    )

    elapsed_ms = (time.perf_counter() - start) * 1000

    return {
        "context": context_str,
        "sources": sources,
        "rewritten_query": rewritten_query,
        "retrieval_latency_ms": round(elapsed_ms, 1),
        "stage_meta": {
            "dense_count": len(dense_results),
            "bm25_count": len(bm25_results),
            "fused_count": len(fused),
            "reranked": bool(reranked and reranked[0].get("reranked")),
        },
    }

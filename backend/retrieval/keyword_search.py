"""Keyword (BM25) retrieval, built from chunks already stored in Qdrant
(no separate text store). Indices are cached per document-id scope and
rebuilt only when the underlying collection changes (see
clients.INDEX_VERSION) -- not on every question.
"""

import re
from typing import Any, Dict, List, Optional, Tuple

from rank_bm25 import BM25Okapi

from retrieval import clients

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# cache_key -> (BM25Okapi, records, index_version)
_cache: Dict[Tuple, Any] = {}

MAX_SCROLL_POINTS = 5000  # safety cap for this scale


def _tokenize(text: str) -> List[str]:
    return _TOKEN_RE.findall(text.lower())


def _cache_key(document_ids: Optional[List[str]]) -> Tuple:
    return tuple(sorted(document_ids)) if document_ids else ("__all__",)


def _load_records(document_ids: Optional[List[str]]) -> List[Dict[str, Any]]:
    """Pulls chunk text + metadata straight out of Qdrant via scroll (no
    vector query needed), scoped to document_ids."""

    records = []
    next_offset = None

    while True:

        points, next_offset = clients.qdrant_client.scroll(
            collection_name=clients.COLLECTION_NAME,
            scroll_filter=clients.document_filter(document_ids),
            limit=500,
            offset=next_offset,
            with_payload=True,
            with_vectors=False,
        )

        for point in points:
            payload = point.payload or {}
            metadata = payload.get("metadata", {})
            content = payload.get("page_content", "")

            document_id = metadata.get("document_id")
            chunk_index = metadata.get("chunk_index")
            page_number = metadata.get("page_number") or (
                metadata.get("page_label") or metadata.get("page", 0) + 1
            )

            records.append({
                "chunk_id": f"{document_id}:{chunk_index}",
                "document_id": document_id,
                "page_number": page_number,
                "chunk_index": chunk_index,
                "content": content,
            })

        if not next_offset or len(records) >= MAX_SCROLL_POINTS:
            break

    return records


def _get_index(document_ids: Optional[List[str]]):

    key = _cache_key(document_ids)
    cached = _cache.get(key)

    if cached and cached[2] == clients.INDEX_VERSION:
        return cached[0], cached[1]

    records = _load_records(document_ids)

    if not records:
        _cache[key] = (None, [], clients.INDEX_VERSION)
        return None, []

    tokenized_corpus = [_tokenize(r["content"]) for r in records]
    bm25 = BM25Okapi(tokenized_corpus)

    _cache[key] = (bm25, records, clients.INDEX_VERSION)
    return bm25, records


def keyword_search(
    query: str,
    document_ids: Optional[List[str]] = None,
    k: int = 20,
) -> List[Dict[str, Any]]:
    """Returns chunk records with a "bm25_score" field, same shape as
    dense_search's output (minus dense_score)."""

    bm25, records = _get_index(document_ids)

    if bm25 is None or not records:
        return []

    scores = bm25.get_scores(_tokenize(query))

    ranked = sorted(
        zip(records, scores), key=lambda pair: pair[1], reverse=True
    )[:k]

    return [
        {**record, "bm25_score": float(score)}
        for record, score in ranked
        if score > 0
    ]

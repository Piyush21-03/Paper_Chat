"""Final context selection: dedupe near-identical chunks, cap chunk
count and total characters before handing off to generation."""

import re
from typing import Any, Dict, List, Tuple

MAX_CONTEXT_CHARS_PER_CHUNK = 1500


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())[:300]


def build_context(
    chunks: List[Dict[str, Any]],
    final_chunks: int = 5,
    max_context_chars: int = 12000,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Returns (context_string, sources).

    sources: list of {document_id, page_number, chunk_index, snippet,
    relevance_score} in the order used for the prompt.
    """

    deduped = []
    seen_prefixes = set()

    for chunk in chunks:
        prefix = _normalize(chunk["content"])
        if prefix in seen_prefixes:
            continue
        seen_prefixes.add(prefix)
        deduped.append(chunk)

    selected = deduped[:final_chunks]

    parts = []
    sources = []
    total_chars = 0

    for chunk in selected:

        content = chunk["content"][:MAX_CONTEXT_CHARS_PER_CHUNK]

        if total_chars + len(content) > max_context_chars:
            remaining = max_context_chars - total_chars
            if remaining <= 0:
                break
            content = content[:remaining]

        total_chars += len(content)

        relevance_score = (
            chunk.get("rerank_score")
            if chunk.get("rerank_score") is not None
            else chunk.get("rrf_score", 0.0)
        )

        parts.append(f"[Page {chunk['page_number']}]\n{content}")

        sources.append({
            "document_id": chunk["document_id"],
            "page_number": chunk["page_number"],
            "chunk_index": chunk.get("chunk_index"),
            "snippet": content[:220],
            "relevance_score": round(float(relevance_score), 4),
        })

        if total_chars >= max_context_chars:
            break

    return "\n\n---\n\n".join(parts), sources

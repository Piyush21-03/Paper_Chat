"""Application-level document discovery search ("find documents/pages
mentioning X"). Reuses the existing dense + BM25 + RRF infrastructure
from retrieval/ -- no separate search system, no generation call, no
reranker (this is discovery, not an answer).

`perform_document_search` is factored out so routers/research.py's
scoped (collection/multi-doc) research search reuses the exact same
logic instead of a second implementation.

Filters/sorting added in Phase 7 are all optional; with none supplied
the behavior (and response shape, apart from additive fields) is
identical to before.
"""

from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Query, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import CollectionDocument, Document, ResearchCollection, User
from retrieval import dense_search, keyword_search, fusion, config

router = APIRouter(prefix="/api/search", tags=["search"])

VALID_MODES = ("hybrid", "keyword", "semantic")
VALID_SORTS = ("relevance", "document", "page")


def _page_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def perform_document_search(
    query: str,
    document_ids: List[str],
    db: Session,
    limit: int = 20,
    mode: str = "hybrid",
    min_relevance: float = 0.0,
    page: Optional[int] = None,
    sort: str = "relevance",
) -> list:
    """mode: "hybrid" (dense+BM25 fused with RRF -- the default),
    "semantic" (dense/vector only) or "keyword" (BM25 only).

    Each match carries `match_type` ("hybrid" | "semantic" | "keyword")
    saying which retrieval path(s) actually found that chunk, plus a
    0-1 `relevance` (normalized within this result set) used by
    `min_relevance`. The raw `score` field keeps its original meaning.
    """

    if not document_ids:
        return []

    # A page filter is applied after retrieval, so pull a wider candidate
    # pool so the filter doesn't leave nothing to show.
    widen = 3 if page is not None else 1
    dense_results = []
    bm25_results = []

    if mode in ("hybrid", "semantic"):
        dense_results = dense_search.dense_search(query, document_ids=document_ids, k=config.DENSE_TOP_K * widen)
    if mode in ("hybrid", "keyword"):
        bm25_results = keyword_search.keyword_search(query, document_ids=document_ids, k=config.BM25_TOP_K * widen)

    dense_ids = {r["chunk_id"] for r in dense_results}
    bm25_ids = {r["chunk_id"] for r in bm25_results}

    if mode == "hybrid":
        ranked = fusion.reciprocal_rank_fusion(
            dense_results, bm25_results, k=config.RRF_K, top_k=limit * widen
        )
        for r in ranked:
            r["_score"] = r["rrf_score"]
    elif mode == "semantic":
        ranked = [{**r, "_score": r["dense_score"]} for r in dense_results][: limit * widen]
    else:
        ranked = [{**r, "_score": r["bm25_score"]} for r in bm25_results][: limit * widen]

    if page is not None:
        ranked = [r for r in ranked if _page_int(r.get("page_number")) == page]

    if not ranked:
        return []

    max_score = max((r["_score"] for r in ranked), default=0) or 1.0

    for r in ranked:
        cid = r["chunk_id"]
        if mode == "hybrid":
            r["match_type"] = "hybrid" if (cid in dense_ids and cid in bm25_ids) else ("semantic" if cid in dense_ids else "keyword")
            r["relevance"] = round(r["_score"] / max_score, 4)
        elif mode == "semantic":
            r["match_type"] = "semantic"
            r["relevance"] = round(max(0.0, min(1.0, r["_score"])), 4)
        else:
            r["match_type"] = "keyword"
            r["relevance"] = round(r["_score"] / max_score, 4)

    if min_relevance > 0:
        ranked = [r for r in ranked if r["relevance"] >= min_relevance]

    if not ranked:
        return []

    doc_ids = {r["document_id"] for r in ranked if r.get("document_id")}
    rows = db.query(Document).filter(Document.id.in_(doc_ids)).all()
    names = {row.id: row.original_filename for row in rows}

    grouped = defaultdict(list)
    for r in ranked:
        grouped[r["document_id"]].append(r)

    results = []
    for document_id, hits in grouped.items():
        if sort == "page":
            hits.sort(key=lambda h: (_page_int(h["page_number"]) or 0))
        else:
            hits.sort(key=lambda h: h["_score"], reverse=True)

        results.append({
            "document_id": document_id,
            "filename": names.get(document_id, "(deleted document)"),
            "matches": [
                {
                    "page_number": h["page_number"],
                    "snippet": h["content"][:200],
                    "score": round(h["_score"], 4),
                    "relevance": h["relevance"],
                    "match_type": h["match_type"],
                }
                for h in hits[:3]
            ],
        })

    if sort in ("document", "page"):
        results.sort(key=lambda r: r["filename"].lower())
    else:
        results.sort(key=lambda r: max(m["score"] for m in r["matches"]), reverse=True)

    return results


def _parse_date(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return "invalid"


@router.get("")
def search_documents(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    document_id: Optional[str] = Query(default=None),
    collection_id: Optional[str] = Query(default=None),
    page: Optional[int] = Query(default=None, ge=1),
    mode: str = Query(default="hybrid"),
    min_relevance: float = Query(default=0.0, ge=0.0, le=1.0),
    sort: str = Query(default="relevance"),
    uploaded_after: Optional[str] = Query(default=None, description="ISO date; only documents uploaded on/after"),
    uploaded_before: Optional[str] = Query(default=None, description="ISO date; only documents uploaded on/before"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if mode not in VALID_MODES:
        return JSONResponse(status_code=400, content={"success": False, "message": f"mode must be one of {', '.join(VALID_MODES)}."})
    if sort not in VALID_SORTS:
        return JSONResponse(status_code=400, content={"success": False, "message": f"sort must be one of {', '.join(VALID_SORTS)}."})

    after, before = _parse_date(uploaded_after), _parse_date(uploaded_before)
    if after == "invalid" or before == "invalid":
        return JSONResponse(status_code=400, content={"success": False, "message": "Dates must be ISO format (YYYY-MM-DD)."})

    # SECURITY: this is document *discovery*, not a public index -- every
    # filter below only ever narrows the set of documents the caller owns.
    query = db.query(Document.id).filter(Document.user_id == current_user.id)

    if document_id:
        query = query.filter(Document.id == document_id)

    if collection_id:
        collection = db.get(ResearchCollection, collection_id)
        if collection is None or collection.user_id != current_user.id:
            return JSONResponse(status_code=404, content={"success": False, "message": "Collection not found."})
        member_ids = [
            row.document_id for row in db.query(CollectionDocument).filter(CollectionDocument.collection_id == collection_id).all()
        ]
        query = query.filter(Document.id.in_(member_ids))

    if after:
        query = query.filter(Document.created_at >= after)
    if before:
        query = query.filter(Document.created_at <= before)

    owned_ids = [row.id for row in query.all()]

    if not owned_ids:
        return {"success": True, "documents": []}

    results = perform_document_search(
        q, owned_ids, db, limit=limit, mode=mode, min_relevance=min_relevance, page=page, sort=sort,
    )
    return {"success": True, "documents": results}

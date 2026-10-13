from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

import rag
import research
from auth import get_current_user
from db import get_db
from models import (
    CollectionDocument,
    Document,
    ResearchBookmark,
    ResearchCollection,
    ResearchMetadata,
    ResearchSession,
    ResearchSessionEntry,
    User,
)
from schemas import (
    AddDocumentsRequest,
    BookmarkCreate,
    BookmarkOut,
    BookmarkUpdate,
    CollectionCreate,
    CollectionDetailOut,
    CollectionOut,
    CollectionUpdate,
    DocumentOut,
    ExportRequest,
    ResearchMetadataOut,
    ResearchScopeRequest,
    ResearchSearchRequest,
    SessionCreate,
    SessionDetailOut,
    SessionEntryOut,
    SessionOut,
    SessionUpdate,
    SynthesizeRequest,
)
from logging_config import get_logger

logger = get_logger("research_router")

router = APIRouter(prefix="/api/research", tags=["research"])

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"


def _not_found(message="Not found."):
    return JSONResponse(status_code=404, content={"success": False, "message": message})


def _forbidden(message="Access denied."):
    return JSONResponse(status_code=403, content={"success": False, "message": message})


def _get_owned_collection(db: Session, collection_id: str, user: User) -> Optional[ResearchCollection]:
    collection = db.get(ResearchCollection, collection_id)
    if collection is None or collection.user_id != user.id:
        return None
    return collection


def _collection_document_ids(db: Session, collection_id: str) -> List[str]:
    rows = db.query(CollectionDocument).filter(CollectionDocument.collection_id == collection_id).all()
    return [r.document_id for r in rows]


def _resolve_scope(
    db: Session, user: User, document_ids: Optional[List[str]], collection_id: Optional[str]
) -> Tuple[Optional[List[str]], Optional[JSONResponse]]:
    """Resolves a request's document scope (explicit ids OR a
    collection) and validates the caller owns every document. Never
    trusts document_ids supplied by the frontend without checking."""

    if collection_id:
        collection = _get_owned_collection(db, collection_id, user)
        if collection is None:
            return None, _not_found("Collection not found.")
        ids = _collection_document_ids(db, collection_id)
    else:
        ids = list(dict.fromkeys(document_ids or []))

    if not ids:
        return None, JSONResponse(status_code=400, content={"success": False, "message": "No documents specified."})

    owned_count = db.query(Document).filter(Document.id.in_(ids), Document.user_id == user.id).count()
    if owned_count != len(set(ids)):
        return None, _forbidden("One or more documents are not accessible.")

    return ids, None


# ========================================
# Collections
# ========================================

def _collection_out(db: Session, collection: ResearchCollection) -> CollectionOut:
    count = db.query(CollectionDocument).filter(CollectionDocument.collection_id == collection.id).count()
    return CollectionOut(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        document_count=count,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.post("/collections")
def create_collection(payload: CollectionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    collection = ResearchCollection(
        user_id=current_user.id,
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)

    return {"success": True, "collection": _collection_out(db, collection)}


@router.get("/collections")
def list_collections(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    collections = (
        db.query(ResearchCollection)
        .filter(ResearchCollection.user_id == current_user.id)
        .order_by(ResearchCollection.updated_at.desc())
        .all()
    )

    return {"success": True, "collections": [_collection_out(db, c) for c in collections]}


@router.get("/collections/{collection_id}")
def get_collection(collection_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    collection = _get_owned_collection(db, collection_id, current_user)
    if collection is None:
        return _not_found("Collection not found.")

    doc_ids = _collection_document_ids(db, collection_id)
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).all() if doc_ids else []

    detail = CollectionDetailOut(
        **_collection_out(db, collection).model_dump(),
        documents=[DocumentOut.model_validate(d) for d in docs],
    )

    return {"success": True, "collection": detail}


@router.patch("/collections/{collection_id}")
def rename_collection(
    collection_id: str, payload: CollectionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):

    collection = _get_owned_collection(db, collection_id, current_user)
    if collection is None:
        return _not_found("Collection not found.")

    if payload.name is not None:
        collection.name = payload.name.strip()
    if payload.description is not None:
        collection.description = payload.description.strip() or None

    db.commit()
    db.refresh(collection)

    return {"success": True, "collection": _collection_out(db, collection)}


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    collection = _get_owned_collection(db, collection_id, current_user)
    if collection is None:
        return _not_found("Collection not found.")

    # Only removes the grouping -- the underlying documents are untouched.
    db.query(CollectionDocument).filter(CollectionDocument.collection_id == collection_id).delete()
    db.delete(collection)
    db.commit()

    return {"success": True, "message": "Collection deleted."}


@router.post("/collections/{collection_id}/documents")
def add_documents(
    collection_id: str, payload: AddDocumentsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):

    collection = _get_owned_collection(db, collection_id, current_user)
    if collection is None:
        return _not_found("Collection not found.")

    owned_count = (
        db.query(Document)
        .filter(Document.id.in_(payload.document_ids), Document.user_id == current_user.id)
        .count()
    )
    if owned_count != len(set(payload.document_ids)):
        return _forbidden("One or more documents are not accessible.")

    existing = set(_collection_document_ids(db, collection_id))

    for document_id in payload.document_ids:
        if document_id in existing:
            continue
        db.add(CollectionDocument(collection_id=collection_id, document_id=document_id))

    db.commit()

    return {"success": True, "collection": _collection_out(db, collection)}


@router.delete("/collections/{collection_id}/documents/{document_id}")
def remove_document(
    collection_id: str, document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):

    collection = _get_owned_collection(db, collection_id, current_user)
    if collection is None:
        return _not_found("Collection not found.")

    db.query(CollectionDocument).filter(
        CollectionDocument.collection_id == collection_id,
        CollectionDocument.document_id == document_id,
    ).delete()
    db.commit()

    return {"success": True, "collection": _collection_out(db, collection)}


# ========================================
# Research Search (reuses the same dense+BM25+RRF pipeline as /api/search)
# ========================================

def _get_owned_session(db: Session, session_id: str, user: User) -> Optional[ResearchSession]:
    session = db.get(ResearchSession, session_id)
    if session is None or session.user_id != user.id:
        return None
    return session


def _save_entry(db: Session, session_id: Optional[str], user: User, action_type: str, question: Optional[str],
                 result_text: Optional[str] = None, result_json=None, sources=None) -> None:
    """Best-effort: silently skips if session_id is absent or not owned,
    never fails the parent research action over a save."""

    if not session_id:
        return

    session = _get_owned_session(db, session_id, user)
    if session is None:
        return

    db.add(ResearchSessionEntry(
        session_id=session_id, action_type=action_type, question=question,
        result_text=result_text, result_json=result_json, sources=sources,
    ))
    db.commit()


@router.post("/search")
def research_search(payload: ResearchSearchRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    from routers.search import perform_document_search

    document_ids, error = _resolve_scope(db, current_user, payload.document_ids, payload.collection_id)
    if error:
        return error

    results = perform_document_search(payload.query, document_ids, db, limit=20)

    _save_entry(db, payload.session_id, current_user, "search", payload.query, result_json=results)

    return {"success": True, "documents": results}


# ========================================
# Comparison / Synthesis / Gap Detection
# ========================================

@router.post("/compare")
def compare(payload: ResearchScopeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document_ids, error = _resolve_scope(db, current_user, payload.document_ids, payload.collection_id)
    if error:
        return error

    if len(document_ids) < 2:
        return JSONResponse(status_code=400, content={"success": False, "message": "Select at least 2 documents to compare."})

    try:
        result = research.compare_documents(document_ids, db)
    except Exception as error:
        logger.error("compare failed: %s", error)
        return JSONResponse(status_code=500, content={"success": False, "message": "Comparison failed."})

    _save_entry(db, payload.session_id, current_user, "compare", None,
                result_text=result.get("comparison_markdown"), sources=result.get("sources"))

    return {"success": True, **result}


@router.post("/synthesize")
def synthesize(payload: SynthesizeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document_ids, error = _resolve_scope(db, current_user, payload.document_ids, payload.collection_id)
    if error:
        return error

    try:
        result = research.synthesize(payload.question.strip(), document_ids, db)
    except Exception as error:
        logger.error("synthesize failed: %s", error)
        return JSONResponse(status_code=500, content={"success": False, "message": "Synthesis failed."})

    _save_entry(db, payload.session_id, current_user, "synthesize", payload.question.strip(),
                result_text=result.get("answer"), sources=result.get("sources"))

    return {"success": True, **result}


@router.post("/gaps")
def gaps(payload: ResearchScopeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document_ids, error = _resolve_scope(db, current_user, payload.document_ids, payload.collection_id)
    if error:
        return error

    try:
        result = research.detect_gaps(document_ids, db)
    except Exception as error:
        logger.error("gap detection failed: %s", error)
        return JSONResponse(status_code=500, content={"success": False, "message": "Gap analysis failed."})

    _save_entry(db, payload.session_id, current_user, "gaps", None,
                result_json={"explicit_gaps": result.get("explicit_gaps"), "inferred_gaps": result.get("inferred_gaps")},
                sources=result.get("sources"))

    return {"success": True, **result}


# ========================================
# Structured Metadata (lazy, cached)
# ========================================

@router.get("/metadata/{document_id}")
def get_metadata(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = db.get(Document, document_id)
    if document is None or document.user_id != current_user.id:
        return _not_found("Document not found.")

    existing = db.query(ResearchMetadata).filter(ResearchMetadata.document_id == document_id).first()
    if existing is not None and existing.status in ("ready", "failed"):
        return {"success": True, "metadata": ResearchMetadataOut.model_validate(existing)}

    # Not computed yet -- extract now (lazy, cached after this).
    file_path = UPLOAD_DIR / document.stored_filename
    if not file_path.exists():
        return _not_found("Original file is missing on disk.")

    row = existing or ResearchMetadata(document_id=document_id, status="pending")
    if existing is None:
        db.add(row)
        db.commit()

    try:
        chunks, _ = rag.load_and_chunk(file_path, document_id)
        extracted = research.extract_research_metadata(chunks)

        for field, value in extracted.items():
            setattr(row, field, value)
        row.status = "ready"
        row.error = None

    except Exception as error:
        logger.warning("research metadata extraction failed document_id=%s: %s", document_id, error)
        row.status = "failed"
        row.error = str(error)

    db.commit()
    db.refresh(row)

    return {"success": True, "metadata": ResearchMetadataOut.model_validate(row)}


# ========================================
# Bookmarks
# ========================================

def _bookmark_out(bookmark: ResearchBookmark, filename: Optional[str]) -> BookmarkOut:
    return BookmarkOut(
        id=bookmark.id,
        document_id=bookmark.document_id,
        filename=filename,
        page_number=bookmark.page_number,
        chunk_index=bookmark.chunk_index,
        snippet=bookmark.snippet,
        note=bookmark.note,
        created_at=bookmark.created_at,
    )


@router.post("/bookmarks")
def create_bookmark(payload: BookmarkCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = db.get(Document, payload.document_id)
    if document is None or document.user_id != current_user.id:
        return _not_found("Document not found.")

    bookmark = ResearchBookmark(
        user_id=current_user.id,
        document_id=payload.document_id,
        page_number=payload.page_number,
        chunk_index=payload.chunk_index,
        snippet=payload.snippet,
        note=(payload.note or "").strip() or None,
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)

    return {"success": True, "bookmark": _bookmark_out(bookmark, document.original_filename)}


@router.get("/bookmarks")
def list_bookmarks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    bookmarks = (
        db.query(ResearchBookmark)
        .filter(ResearchBookmark.user_id == current_user.id)
        .order_by(ResearchBookmark.created_at.desc())
        .all()
    )

    doc_ids = {b.document_id for b in bookmarks}
    names = {d.id: d.original_filename for d in db.query(Document).filter(Document.id.in_(doc_ids)).all()} if doc_ids else {}

    return {"success": True, "bookmarks": [_bookmark_out(b, names.get(b.document_id)) for b in bookmarks]}


@router.patch("/bookmarks/{bookmark_id}")
def update_bookmark(
    bookmark_id: str, payload: BookmarkUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):

    bookmark = db.get(ResearchBookmark, bookmark_id)
    if bookmark is None or bookmark.user_id != current_user.id:
        return _not_found("Bookmark not found.")

    bookmark.note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(bookmark)

    document = db.get(Document, bookmark.document_id)
    return {"success": True, "bookmark": _bookmark_out(bookmark, document.original_filename if document else None)}


@router.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    bookmark = db.get(ResearchBookmark, bookmark_id)
    if bookmark is None or bookmark.user_id != current_user.id:
        return _not_found("Bookmark not found.")

    db.delete(bookmark)
    db.commit()

    return {"success": True, "message": "Bookmark deleted."}


# ========================================
# Export (Markdown)
# ========================================

@router.post("/export")
def export_research(payload: ExportRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    lines = ["# PaperChat Research Export", ""]

    if payload.collection_id:
        collection = _get_owned_collection(db, payload.collection_id, current_user)
        if collection is None:
            return _not_found("Collection not found.")

        doc_ids = _collection_document_ids(db, payload.collection_id)
        docs = db.query(Document).filter(Document.id.in_(doc_ids)).all() if doc_ids else []

        lines.append(f"## Workspace: {collection.name}")
        if collection.description:
            lines.append(collection.description)
        lines.append("")
        lines.append("### Documents")
        for d in docs:
            lines.append(f"- {d.original_filename}")
        lines.append("")

    for section in payload.sections:
        lines.append(f"## {section.title}")
        lines.append(section.content)
        lines.append("")

    if payload.include_bookmarks:
        bookmarks = (
            db.query(ResearchBookmark)
            .filter(ResearchBookmark.user_id == current_user.id)
            .order_by(ResearchBookmark.created_at.asc())
            .all()
        )
        if bookmarks:
            doc_ids = {b.document_id for b in bookmarks}
            names = {d.id: d.original_filename for d in db.query(Document).filter(Document.id.in_(doc_ids)).all()}

            lines.append("## Saved Evidence")
            for b in bookmarks:
                page = f", Page {b.page_number}" if b.page_number else ""
                lines.append(f"- **{names.get(b.document_id, 'Unknown document')}{page}**: \"{b.snippet}\"")
                if b.note:
                    lines.append(f"  - Note: {b.note}")
            lines.append("")

    markdown = "\n".join(lines)

    return PlainTextResponse(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=paperchat-research-export.md"},
    )


# ========================================
# Persistent Research Sessions
# ========================================

def _session_out(db: Session, session: ResearchSession) -> SessionOut:
    count = db.query(ResearchSessionEntry).filter(ResearchSessionEntry.session_id == session.id).count()
    return SessionOut(
        id=session.id,
        title=session.title,
        collection_id=session.collection_id,
        document_ids=session.document_ids,
        entry_count=count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("/sessions")
def create_session(payload: SessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    if payload.collection_id:
        collection = _get_owned_collection(db, payload.collection_id, current_user)
        if collection is None:
            return _not_found("Collection not found.")

    if payload.document_ids:
        owned_count = (
            db.query(Document)
            .filter(Document.id.in_(payload.document_ids), Document.user_id == current_user.id)
            .count()
        )
        if owned_count != len(set(payload.document_ids)):
            return _forbidden("One or more documents are not accessible.")

    session = ResearchSession(
        user_id=current_user.id,
        title=(payload.title or "New research session").strip() or "New research session",
        collection_id=payload.collection_id,
        document_ids=payload.document_ids,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {"success": True, "session": _session_out(db, session)}


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    sessions = (
        db.query(ResearchSession)
        .filter(ResearchSession.user_id == current_user.id)
        .order_by(ResearchSession.updated_at.desc())
        .all()
    )

    return {"success": True, "sessions": [_session_out(db, s) for s in sessions]}


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    session = _get_owned_session(db, session_id, current_user)
    if session is None:
        return _not_found("Research session not found.")

    entries = (
        db.query(ResearchSessionEntry)
        .filter(ResearchSessionEntry.session_id == session_id)
        .order_by(ResearchSessionEntry.created_at.asc())
        .all()
    )

    detail = SessionDetailOut(
        **_session_out(db, session).model_dump(),
        entries=[SessionEntryOut.model_validate(e) for e in entries],
    )

    return {"success": True, "session": detail}


@router.patch("/sessions/{session_id}")
def rename_session(session_id: str, payload: SessionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    session = _get_owned_session(db, session_id, current_user)
    if session is None:
        return _not_found("Research session not found.")

    session.title = payload.title.strip()
    db.commit()
    db.refresh(session)

    return {"success": True, "session": _session_out(db, session)}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    session = _get_owned_session(db, session_id, current_user)
    if session is None:
        return _not_found("Research session not found.")

    db.query(ResearchSessionEntry).filter(ResearchSessionEntry.session_id == session_id).delete()
    db.delete(session)
    db.commit()

    return {"success": True, "message": "Research session deleted."}

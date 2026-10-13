import json
import time
import uuid
from pathlib import Path
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

import calculator
import rag
import research
from auth import get_current_user
from config import settings
from db import get_db, init_db
from models import Conversation, Document, ExtractedTable, Message, User
from schemas import AskRequest
from rate_limit import check_rate_limit
from routers import auth as auth_router
from routers import documents as documents_router
from routers import conversations as conversations_router
from routers import eval as eval_router
from routers import search as search_router
from routers import settings as settings_router
from routers import research as research_router
from logging_config import get_logger

logger = get_logger("main")

if settings.is_production and settings.JWT_SECRET == "dev-insecure-secret-change-me":
    logger.warning("JWT_SECRET is using the insecure development default in production! Set JWT_SECRET.")


app = FastAPI()

init_db()

# Load any persisted retrieval-setting overrides so they survive restarts.
try:
    from db import SessionLocal
    _startup_db = SessionLocal()
    try:
        settings_router.load_persisted_settings(_startup_db)
    finally:
        _startup_db.close()
except Exception as _startup_error:
    logger.warning("could not load persisted settings at startup: %s", _startup_error)


# ========================================
# Paths
# ========================================

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent


# ========================================
# Application Limits
# ========================================

MAX_QUESTIONS_PER_DAY = 20

# In-memory; resets on restart. This is the existing per-user *daily*
# question quota (business logic), distinct from the general
# requests-per-minute API rate limiting below.
question_usage = {}

HISTORY_WINDOW_MESSAGES = 8


def _check_daily_limit(user_id: str):
    """Returns a JSONResponse (429) if the daily quota is exceeded, else
    None. Shared by /ask and /ask/stream so the quota can't be doubled
    by using one endpoint to dodge the other's check."""

    today = str(date.today())
    usage = question_usage.get(user_id)

    if usage is None or usage["date"] != today:
        question_usage[user_id] = {"date": today, "count": 0}

    current_count = question_usage[user_id]["count"]

    if current_count >= MAX_QUESTIONS_PER_DAY:
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "message": (
                    "Daily question limit reached. "
                    "You can ask a maximum of 20 questions per day. "
                    "Please try again tomorrow."
                ),
                "questions_used": current_count,
                "questions_remaining": 0,
            },
        )
    return None


def _increment_daily_usage(user_id: str):
    question_usage[user_id]["count"] += 1
    used = question_usage[user_id]["count"]
    return used, MAX_QUESTIONS_PER_DAY - used


def _resolve_ask_context(db: Session, current_user: User, data: AskRequest):
    """Resolves conversation/document_ids/history for a question,
    enforcing ownership. Returns (conversation, document_ids, history,
    error_response). error_response is a JSONResponse when the caller
    should stop immediately, else None. Shared by /ask and /ask/stream --
    the exact same ownership checks apply to both."""

    conversation = None
    document_ids = data.document_ids
    history = None

    if data.conversation_id:

        conversation = db.get(Conversation, data.conversation_id)

        if conversation is None or conversation.user_id != current_user.id:
            return None, None, None, JSONResponse(
                status_code=404,
                content={"success": False, "message": "Conversation not found."},
            )

        document_ids = conversation.document_ids or None

        recent_messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc())
            .limit(HISTORY_WINDOW_MESSAGES)
            .all()
        )
        recent_messages.reverse()

        history = [{"role": m.role, "content": m.content} for m in recent_messages]

    elif document_ids:

        # SECURITY: a standalone (non-conversation) ask must never be
        # allowed to retrieve another user's document vectors.
        owned_count = (
            db.query(Document)
            .filter(Document.id.in_(document_ids), Document.user_id == current_user.id)
            .count()
        )
        if owned_count != len(set(document_ids)):
            return None, None, None, JSONResponse(
                status_code=403,
                content={"success": False, "message": "One or more documents are not accessible."},
            )

    return conversation, document_ids, history, None


def _persist_turn(db: Session, conversation: Optional[Conversation], question: str, answer: str, sources, mode: str) -> None:
    if conversation is None:
        return

    db.add(Message(conversation_id=conversation.id, role="user", content=question))
    db.add(Message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        sources=sources or None,
        mode=mode,
    ))

    if conversation.title == "New chat":
        conversation.title = question[:60] + ("…" if len(question) > 60 else "")

    db.commit()


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _attach_filenames(sources, db: Session) -> None:
    """Enriches source dicts in-place with the document's display name."""

    if not sources:
        return

    ids = {s.get("document_id") for s in sources if s.get("document_id")}
    if not ids:
        return

    rows = db.query(Document).filter(Document.id.in_(ids)).all()
    names = {row.id: row.original_filename for row in rows}

    for s in sources:
        s["filename"] = names.get(s.get("document_id"))


# ========================================
# CORS (env-driven; "*" is the local-dev default)
# ========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,  # no cookie/session auth in use
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ========================================
# Request ID + latency logging + security headers
# ========================================

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error("unhandled error request_id=%s path=%s error=%s", request_id, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error.", "request_id": request_id},
    )

@app.middleware("http")
async def observability_and_security_middleware(request: Request, call_next):

    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    start = time.perf_counter()

    response = await call_next(request)

    elapsed_ms = (time.perf_counter() - start) * 1000

    logger.info(
        "request_id=%s method=%s path=%s status=%d latency_ms=%.1f",
        request_id, request.method, request.url.path, response.status_code, elapsed_ms,
    )

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    return response


# ========================================
# General API rate limiting (per-user if authenticated, else per-IP).
# Auth endpoints get a stricter limit to slow down credential stuffing.
# ========================================

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):

    path = request.url.path

    if not path.startswith("/api/") and path != "/ask":
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    identity = auth_header[-32:] if auth_header else (request.client.host if request.client else "unknown")

    is_auth_endpoint = path.startswith("/api/auth/")
    limit = settings.AUTH_RATE_LIMIT_PER_MINUTE if is_auth_endpoint else settings.RATE_LIMIT_PER_MINUTE

    if not check_rate_limit(f"{'auth' if is_auth_endpoint else 'api'}:{identity}", limit):
        return JSONResponse(
            status_code=429,
            content={"success": False, "message": "Too many requests. Please slow down."},
        )

    return await call_next(request)


# ========================================
# Routers
# ========================================

app.include_router(auth_router.router)
app.include_router(documents_router.router)
app.include_router(conversations_router.router)
app.include_router(eval_router.router)
app.include_router(search_router.router)
app.include_router(settings_router.router)
app.include_router(research_router.router)


# ========================================
# Health Checks
# ========================================

@app.get("/health")
def health():
    """Liveness probe -- no external dependencies checked."""
    return {"success": True, "status": "alive"}


@app.get("/api/health")
def health_check():
    return {"success": True, "message": "RAG API is running"}


@app.get("/health/ready")
def health_ready(db: Session = Depends(get_db)):
    """Readiness probe -- checks the services the app actually needs."""

    checks = {}

    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as error:
        checks["database"] = f"error: {error}"

    try:
        from retrieval.clients import qdrant_client
        qdrant_client.get_collections()
        checks["qdrant"] = "ok"
    except Exception as error:
        checks["qdrant"] = f"error: {error}"

    if settings.REDIS_URL:
        try:
            import redis
            redis.from_url(settings.REDIS_URL, socket_connect_timeout=2).ping()
            checks["redis"] = "ok"
        except Exception as error:
            checks["redis"] = f"error: {error}"

    all_ok = all(v == "ok" for v in checks.values())

    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={"success": all_ok, "checks": checks},
    )


# ========================================
# Ask Question
# ========================================

@app.post("/ask")
async def ask(
    request: Request,
    data: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    question = data.question.strip()

    if not question:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Question cannot be empty."}
        )

    # ------------------------------------
    # Daily rate limit (per user)
    # ------------------------------------

    limit_error = _check_daily_limit(current_user.id)
    if limit_error is not None:
        return limit_error

    # ------------------------------------
    # Resolve conversation context (if any) -- ownership enforced
    # ------------------------------------

    conversation, document_ids, history, context_error = _resolve_ask_context(db, current_user, data)
    if context_error is not None:
        return context_error

    # ------------------------------------
    # Try deterministic calculator mode first (cheaper + more reliable
    # for numeric questions than asking Gemini to do arithmetic)
    # ------------------------------------

    mode = "rag"
    calculation_result = None
    answer = None
    sources = []
    low_evidence = False
    follow_up_questions = []

    try:

        if document_ids and calculator.detect_calculation_intent(question):

            table_rows = (
                db.query(ExtractedTable)
                .filter(ExtractedTable.document_id.in_(document_ids))
                .all()
            )

            points = calculator.gather_from_tables([
                {"csv_path": Path(r.csv_path), "page_number": r.page_number}
                for r in table_rows
            ])

            if not points:
                # Fallback: pull numbers out of retrieved chunk text.
                chunks = rag.retrieve(question, document_ids, k=6)
                points = calculator.gather_from_text([c["content"] for c in chunks])

            calculation_result = calculator.calculate(question, points)

            if calculation_result:
                mode = "calculation"
                answer = calculation_result["explanation"]

        if answer is None:
            rag_result = rag.ask_question(question, document_ids, history=history)
            answer = rag_result["answer"]
            sources = rag_result["sources"]
            low_evidence = bool(rag_result.get("low_evidence"))
            _attach_filenames(sources, db)
            if not low_evidence:
                try:
                    follow_up_questions = research.generate_follow_up_questions(question, answer, sources)
                except Exception as error:
                    logger.warning("follow-up generation failed: %s", error)
            logger.info(
                "ask complete user_id=%s mode=rag retrieval_ms=%s generation_ms=%s total_ms=%s sources=%d",
                current_user.id, rag_result.get("retrieval_latency_ms"), rag_result.get("generation_latency_ms"),
                rag_result.get("total_latency_ms"), len(sources),
            )
        else:
            logger.info("ask complete user_id=%s mode=calculation", current_user.id)

    except Exception as error:

        logger.error("ask failed user_id=%s: %s", current_user.id, error)

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": (
                    "Unable to answer the question. "
                    "Check that Qdrant, embeddings, "
                    "and Gemini are available."
                )
            }
        )

    # ------------------------------------
    # Persist to conversation (if scoped to one)
    # ------------------------------------

    _persist_turn(db, conversation, question, answer, sources, mode)

    # ------------------------------------
    # Increment usage only after success
    # ------------------------------------

    questions_used, questions_remaining = _increment_daily_usage(current_user.id)

    return {
        "success": True,
        "answer": answer,
        "sources": sources,
        "mode": mode,
        "low_evidence": low_evidence,
        "calculation": calculation_result,
        "follow_up_questions": follow_up_questions,
        "conversation_id": conversation.id if conversation else None,
        "questions_used": questions_used,
        "questions_remaining": questions_remaining
    }


# ========================================
# Ask Question (streaming, SSE)
# ========================================

@app.post("/ask/stream")
async def ask_stream(
    request: Request,
    data: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Server-Sent Events version of /ask. Same auth, same ownership
    checks, same rate limit, same retrieval pipeline and grounded
    prompt as /ask -- only the generation call streams instead of
    returning all at once. /ask itself is unchanged and remains fully
    supported for clients that don't want streaming.
    """

    question = data.question.strip()

    if not question:
        return JSONResponse(status_code=400, content={"success": False, "message": "Question cannot be empty."})

    limit_error = _check_daily_limit(current_user.id)
    if limit_error is not None:
        return limit_error

    conversation, document_ids, history, context_error = _resolve_ask_context(db, current_user, data)
    if context_error is not None:
        return context_error

    # Calculator mode has no meaningful token-by-token stream (the
    # answer is already a fully-formed deterministic string) -- it's
    # still served over this endpoint for a consistent client contract,
    # emitted as a single chunk.
    calculation_result = None
    mode = "rag"

    if document_ids and calculator.detect_calculation_intent(question):
        table_rows = (
            db.query(ExtractedTable)
            .filter(ExtractedTable.document_id.in_(document_ids))
            .all()
        )
        points = calculator.gather_from_tables([
            {"csv_path": Path(r.csv_path), "page_number": r.page_number}
            for r in table_rows
        ])
        if not points:
            chunks = rag.retrieve(question, document_ids, k=6)
            points = calculator.gather_from_text([c["content"] for c in chunks])
        calculation_result = calculator.calculate(question, points)
        if calculation_result:
            mode = "calculation"

    async def event_stream():

        answer_text = ""
        sources = []
        low_evidence = False

        try:
            if calculation_result:
                answer_text = calculation_result["explanation"]
                yield _sse_event({"type": "sources", "sources": [], "low_evidence": False})
                yield _sse_event({"type": "chunk", "text": answer_text})
                yield _sse_event({
                    "type": "done", "answer": answer_text, "sources": [], "low_evidence": False,
                    "mode": "calculation", "calculation": calculation_result, "follow_up_questions": [],
                })
            else:
                for event in rag.ask_question_stream(question, document_ids, history=history):

                    if await request.is_disconnected():
                        logger.info("stream cancelled by client user_id=%s", current_user.id)
                        return

                    if event["type"] == "sources":
                        sources = event["sources"]
                        low_evidence = event.get("low_evidence", False)
                        _attach_filenames(sources, db)
                        yield _sse_event({"type": "sources", "sources": sources, "low_evidence": low_evidence})

                    elif event["type"] == "chunk":
                        answer_text += event["text"]
                        yield _sse_event({"type": "chunk", "text": event["text"]})

                    elif event["type"] == "error":
                        logger.error("stream error user_id=%s: %s", current_user.id, event.get("message"))
                        yield _sse_event({"type": "error", "message": "Unable to answer the question."})
                        return

                    elif event["type"] == "done":
                        follow_ups = []
                        if not low_evidence:
                            try:
                                follow_ups = research.generate_follow_up_questions(question, event["answer"], sources)
                            except Exception as error:
                                logger.warning("follow-up generation failed: %s", error)

                        mode_out = "rag"
                        _persist_turn(db, conversation, question, event["answer"], sources, mode_out)
                        used, remaining = _increment_daily_usage(current_user.id)

                        yield _sse_event({
                            "type": "done",
                            "answer": event["answer"],
                            "sources": sources,
                            "low_evidence": low_evidence,
                            "mode": mode_out,
                            "calculation": None,
                            "follow_up_questions": follow_ups,
                            "conversation_id": conversation.id if conversation else None,
                            "questions_used": used,
                            "questions_remaining": remaining,
                        })

            if calculation_result:
                _persist_turn(db, conversation, question, answer_text, [], mode)
                _increment_daily_usage(current_user.id)

        except Exception as error:
            logger.error("ask/stream failed user_id=%s: %s", current_user.id, error)
            yield _sse_event({"type": "error", "message": "Unable to answer the question."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ========================================
# Serve Frontend
# ========================================

from fastapi.responses import FileResponse
import os

REACT_DIST_DIR = PROJECT_DIR / "frontend-react" / "dist"

@app.api_route("/{path_name:path}", methods=["GET"])
async def catch_all(path_name: str):
    if path_name.startswith("api/") or path_name == "ask" or path_name == "ask/stream":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
        
    file_path = REACT_DIST_DIR / path_name
    if path_name and file_path.is_file():
        return FileResponse(file_path)
        
    index_path = REACT_DIST_DIR / "index.html"
    if index_path.is_file():
        return FileResponse(index_path)
        
    return JSONResponse(status_code=404, content={"detail": "Frontend build not found. Run 'npm run build' in frontend-react."})

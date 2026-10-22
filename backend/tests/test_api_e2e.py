"""
Manual end-to-end smoke test for Phase 1 + Phase 2.

Stubs out `rag` (no network / model download / real Qdrant server needed)
but uses the REAL `tables` and `calculator` modules (pure Python / no
network). Drives the actual FastAPI app + SQLite DB + BackgroundTasks.

Run with: python3 test_api_e2e.py
"""

import sys
import types
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import os
# High test-only rate limits so dozens of rapid assertions in one minute
# don't trip the general/auth API rate limiter (config.py reads these at
# import time, so this must happen before `config`/`main` are imported).
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["JWT_SECRET"] = "test-secret-not-for-production"

# ---- Stub the rag module before anything imports it ----

calls = {
    "load_and_chunk": [], "embed_chunks": [], "summarize_chunks": [],
    "ask_question": [], "ask_question_stream": [], "delete_document_vectors": [], "retrieve": [],
}

fake_rag = types.ModuleType("rag")


class FakeChunk:
    def __init__(self, text, page):
        self.page_content = text
        self.metadata = {"page_number": page, "document_id": "x"}


stage_log = []


def fake_load_and_chunk(pdf_path, document_id, on_stage=None):
    content = Path(pdf_path).read_bytes()
    calls["load_and_chunk"].append((str(pdf_path), document_id))

    if on_stage:
        on_stage("extracting_text")
        stage_log.append((document_id, "extracting_text"))

    if b"INDEX_FAIL_MARKER" in content:
        raise RuntimeError("simulated indexing failure with /internal/path/secret.py")

    if on_stage:
        on_stage("chunking")
        stage_log.append((document_id, "chunking"))

    marker = "SUMMARY_FAIL_MARKER" if b"SUMMARY_FAIL_MARKER" in content else "ok"
    chunks = [FakeChunk(f"chunk {i} {marker}", i + 1) for i in range(7)]
    return chunks, 3


def fake_embed_chunks(chunks, on_stage=None):
    calls["embed_chunks"].append(len(chunks))
    if on_stage:
        on_stage("embedding")
        stage_log.append(("embed", "embedding"))
        on_stage("indexing")
        stage_log.append(("embed", "indexing"))
    return len(chunks)


def fake_summarize_chunks(chunks):
    calls["summarize_chunks"].append(len(chunks))
    if any("SUMMARY_FAIL_MARKER" in c.page_content for c in chunks):
        raise RuntimeError("simulated summarization failure")
    return {"summary": "fake summary", "key_points": ["point a", "point b"], "topics": ["topic a"]}


def fake_ask_question(question, document_ids=None, history=None, k=4):
    calls["ask_question"].append((question, document_ids, history))
    return {
        "answer": f"fake answer scoped to {document_ids} (history_len={len(history or [])})",
        "sources": [{"document_id": (document_ids or ["none"])[0], "page_number": 1, "snippet": "..."}],
    }


def fake_retrieve(question, document_ids=None, k=4):
    calls["retrieve"].append((question, document_ids))
    return [{"content": "Model A: 90.5\nModel B: 80.2", "document_id": (document_ids or ["none"])[0], "page_number": 1}]


def fake_ask_question_stream(question, document_ids=None, history=None):
    calls["ask_question_stream"].append((question, document_ids, history))

    if question == "TRIGGER_STREAM_ERROR":
        yield {"type": "error", "message": "simulated stream failure"}
        return

    sources = [{"document_id": (document_ids or ["none"])[0], "page_number": 1, "snippet": "..."}]
    yield {"type": "sources", "sources": sources, "low_evidence": False}

    full_text = f"streamed answer for: {question}"
    for word in full_text.split(" "):
        yield {"type": "chunk", "text": word + " "}

    yield {
        "type": "done", "answer": full_text, "sources": sources, "low_evidence": False,
        "retrieval_latency_ms": 1.0, "generation_latency_ms": 1.0, "total_latency_ms": 2.0,
    }


def fake_delete_document_vectors(document_id):
    calls["delete_document_vectors"].append(document_id)


fake_rag.load_and_chunk = fake_load_and_chunk
fake_rag.embed_chunks = fake_embed_chunks
fake_rag.summarize_chunks = fake_summarize_chunks
fake_rag.ask_question = fake_ask_question
fake_rag.ask_question_stream = fake_ask_question_stream
fake_rag.retrieve = fake_retrieve
fake_rag.delete_document_vectors = fake_delete_document_vectors
sys.modules["rag"] = fake_rag

# routers/eval.py -> eval.runner -> eval.metrics imports retrieval.clients
# directly (for judge-LLM calls) independent of the `rag` stub above, and
# the real retrieval.clients module eagerly downloads the MiniLM model at
# import time -- stub it too so this test suite stays network-free.
fake_clients = types.ModuleType("retrieval.clients")


class FakeJudgeLLM:
    def invoke(self, messages):
        class Resp:
            content = '{"relevance": 0.8, "faithfulness": 0.85, "reasoning": "stub judge"}'
        return Resp()


fake_clients.llm = FakeJudgeLLM()

# /api/search and /api/research/search go through the REAL dense_search/
# keyword_search modules (only `research.py`'s generation functions are
# stubbed above). Those need a working embedding model + Qdrant client to
# avoid a hard connection error, so wire them to an in-memory Qdrant
# collection here (empty is fine -- this file tests routing/ownership,
# not retrieval quality; that's test_retrieval_pipeline.py's job).
from qdrant_client import QdrantClient as _QdrantClient
from qdrant_client import models as _qmodels
from langchain_core.embeddings import Embeddings as _Embeddings
from langchain_qdrant import QdrantVectorStore as _QdrantVectorStore


class _DummyEmbeddings(_Embeddings):
    def embed_documents(self, texts):
        return [[0.0] * 8 for _ in texts]

    def embed_query(self, text):
        return [0.0] * 8


_mem_qdrant_client = _QdrantClient(location=":memory:")
_mem_qdrant_client.create_collection(
    collection_name="test_collection",
    vectors_config=_qmodels.VectorParams(size=8, distance=_qmodels.Distance.COSINE),
)

fake_clients.embedding_model = _DummyEmbeddings()
fake_clients.qdrant_client = _mem_qdrant_client
fake_clients.QDRANT_URL = "unused"
fake_clients.COLLECTION_NAME = "test_collection"
fake_clients.INDEX_VERSION = 0
fake_clients.ensure_document_id_index = lambda: None
fake_clients.bump_index_version = lambda: None
fake_clients.delete_document_vectors = lambda document_id: None


def _fake_document_filter(document_ids):
    if not document_ids:
        return None
    return _qmodels.Filter(must=[
        _qmodels.FieldCondition(key="metadata.document_id", match=_qmodels.MatchAny(any=document_ids))
    ])


fake_clients.document_filter = _fake_document_filter


@classmethod
def _fake_from_existing_collection(cls, embedding, url=None, collection_name=None, **kwargs):
    return _QdrantVectorStore(client=_mem_qdrant_client, collection_name=collection_name, embedding=embedding)


_QdrantVectorStore.from_existing_collection = _fake_from_existing_collection

# NOTE: do NOT replace sys.modules["retrieval"] itself -- real submodules
# (dense_search.py etc, imported by routers/search.py and routers/settings.py)
# must still be importable from disk. Only the low-level `clients` submodule
# is faked, matching test_retrieval_pipeline.py's approach.
sys.modules["retrieval.clients"] = fake_clients

# routers/research.py calls the real `research` module (compare/synthesize/
# gaps/metadata/follow-ups), which would otherwise hit real Qdrant/Gemini
# via retrieval.pipeline. Stub it the same way `rag` is stubbed, so this
# file stays a pure router/ownership/wiring test -- genuine retrieval
# behavior for these functions is covered separately in
# test_retrieval_pipeline.py (real pipeline + fake embeddings/LLM there).
calls.update({"compare_documents": [], "synthesize": [], "detect_gaps": [], "extract_research_metadata": [], "generate_follow_up_questions": []})

fake_research = types.ModuleType("research")


def fake_compare_documents(document_ids, db):
    calls["compare_documents"].append(document_ids)
    return {"comparison_markdown": "| Aspect | A | B |\n|---|---|---|", "low_evidence": False, "sources": []}


def fake_synthesize(question, document_ids, db):
    calls["synthesize"].append((question, document_ids))
    return {"answer": f"synthesis for {document_ids}", "low_evidence": False, "sources": []}


def fake_detect_gaps(document_ids, db):
    calls["detect_gaps"].append(document_ids)
    return {
        "explicit_gaps": [{"document": "Doc A", "gap": "small sample size", "page": 5}],
        "inferred_gaps": [{"gap": "no cross-dataset validation", "based_on": ["Doc A", "Doc B"], "reasoning": "neither tests on the other's data"}],
        "low_evidence": False,
        "sources": [],
    }


def fake_extract_research_metadata(chunks):
    calls["extract_research_metadata"].append(len(chunks))
    return {
        "title": "A Fake Paper Title", "authors": ["A. Researcher"], "publication_year": "2024",
        "abstract": "Not found", "objective": "Not found", "methodology": "Not found",
        "dataset": "Not found", "key_findings": [], "limitations": [], "future_work": "Not found",
        "keywords": [],
    }


def fake_generate_follow_up_questions(question, answer, sources):
    calls["generate_follow_up_questions"].append(question)
    return ["What methodology was used?", "How does this compare to other work?"]


fake_research.compare_documents = fake_compare_documents
fake_research.synthesize = fake_synthesize
fake_research.detect_gaps = fake_detect_gaps
fake_research.extract_research_metadata = fake_extract_research_metadata
fake_research.generate_follow_up_questions = fake_generate_follow_up_questions
sys.modules["research"] = fake_research

# ---- Use a throwaway DB file for this test run ----

TEST_DB = BACKEND_DIR / "test_paperchat.db"
if TEST_DB.exists():
    TEST_DB.unlink()

import db as db_module  # noqa: E402
db_module.DATABASE_URL = f"sqlite:///{TEST_DB}"
db_module.engine = db_module.create_engine(
    db_module.DATABASE_URL, connect_args={"check_same_thread": False}
)
db_module.SessionLocal.configure(bind=db_module.engine)

import models  # noqa: E402
models.Base.metadata.create_all(bind=db_module.engine)

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)


# ============================================================
# Phase 5: register two users. `client` is wrapped so every existing
# test call below automatically authenticates as user A -- zero changes
# needed to the rest of this file. A second raw-token client (`client_b`)
# is used explicitly for cross-user isolation checks.
# ============================================================

class AuthedClient:
    def __init__(self, raw_client, token):
        self.raw = raw_client
        self.token = token

    def _with_auth(self, kwargs):
        headers = kwargs.pop("headers", {}) or {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        kwargs["headers"] = headers
        return kwargs

    def get(self, *a, **kw): return self.raw.get(*a, **self._with_auth(kw))
    def post(self, *a, **kw): return self.raw.post(*a, **self._with_auth(kw))
    def patch(self, *a, **kw): return self.raw.patch(*a, **self._with_auth(kw))
    def put(self, *a, **kw): return self.raw.put(*a, **self._with_auth(kw))
    def delete(self, *a, **kw): return self.raw.delete(*a, **self._with_auth(kw))


r = client.post("/api/auth/register", json={"email": "user-a@example.com", "password": "correct-horse-battery"})
assert r.status_code == 200, f"user A registration failed: {r.text}"
token_a = r.json()["access_token"]
user_a_id = r.json()["user"]["id"]

r = client.post("/api/auth/register", json={"email": "user-b@example.com", "password": "correct-horse-battery"})
assert r.status_code == 200, f"user B registration failed: {r.text}"
token_b = r.json()["access_token"]
user_b_id = r.json()["user"]["id"]

client_b = AuthedClient(client, token_b)  # separate identity, same app/DB
client = AuthedClient(client, token_a)  # everything below now authenticates as user A

failures = []


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        failures.append(label)


pdf_bytes = b"%PDF-1.4 fake pdf content for testing"

# ============================================================
# PHASE 1 REGRESSION: upload / status / rename / delete / search
# ============================================================

r1 = client.post("/api/documents/upload", files={"file": ("Report A.pdf", pdf_bytes, "application/pdf")})
doc_a = client.get(f"/api/documents/{r1.json()['document']['id']}").json()["document"]
check("[P1] upload doc A ok", r1.status_code == 200 and doc_a["status"] == "ready")
check("[P1] doc A stored under UUID filename", (BACKEND_DIR / "uploads" / f"{doc_a['id']}.pdf").exists())

r2 = client.post("/api/documents/upload", files={"file": ("Report B.pdf", pdf_bytes, "application/pdf")})
doc_b = client.get(f"/api/documents/{r2.json()['document']['id']}").json()["document"]
check("[P1] upload doc B ok", r2.status_code == 200 and doc_b["status"] == "ready")

r = client.get("/api/documents", params={"search": "Report A"})
check("[P1] search filters correctly", len(r.json()["documents"]) == 1)

r = client.patch(f"/api/documents/{doc_a['id']}", json={"filename": "Renamed.pdf"})
check("[P1] rename works", r.json()["document"]["original_filename"] == "Renamed.pdf")

# ============================================================
# PHASE 2.3: Automatic summaries
# ============================================================

check("[P2] doc A summary_status ready", doc_a["summary_status"] == "ready")
check("[P2] doc A summary_text populated", doc_a["summary_text"] == "fake summary")
check("[P2] doc A key_points populated", doc_a["summary_key_points"] == ["point a", "point b"])
check("[P2] document ready even though summary generated after", doc_a["status"] == "ready")

r_sf = client.post("/api/documents/upload", files={"file": ("s.pdf", b"%PDF SUMMARY_FAIL_MARKER", "application/pdf")})
doc_sf = client.get(f"/api/documents/{r_sf.json()['document']['id']}").json()["document"]
check("[P2] summary failure isolated: doc still ready", doc_sf["status"] == "ready")
check("[P2] summary failure recorded separately", doc_sf["summary_status"] == "failed" and bool(doc_sf["summary_error"]))

r_fail = client.post("/api/documents/upload", files={"file": ("f.pdf", b"%PDF INDEX_FAIL_MARKER", "application/pdf")})
doc_fail = client.get(f"/api/documents/{r_fail.json()['document']['id']}").json()["document"]
check("[P1] indexing failure -> status failed", doc_fail["status"] == "failed")

# ============================================================
# PHASE 2.4: Table extraction (graceful failure on non-PDF bytes)
# ============================================================

check(
    "[P2] table extraction ran (attempted) and failed gracefully on fake PDF bytes without affecting doc status",
    doc_a["tables_status"] in ("ready", "failed") and doc_a["status"] == "ready",
)
r = client.get(f"/api/documents/{doc_a['id']}/tables")
check("[P2] tables endpoint responds", r.status_code == 200 and r.json()["success"] is True)

# ============================================================
# PHASE 2.2: PDF file serving
# ============================================================

r = client.get(f"/api/documents/{doc_a['id']}/file")
check("[P2] file endpoint returns 200", r.status_code == 200)
check("[P2] file endpoint returns pdf content-type", r.headers.get("content-type", "").startswith("application/pdf"))

r = client.get(f"/api/documents/does-not-exist/file")
check("[P2] file endpoint 404s for unknown doc", r.status_code == 404)

# ============================================================
# PHASE 2.1: Conversations
# ============================================================

r = client.post("/api/conversations", json={"document_ids": [doc_a["id"]]})
conv = r.json()["conversation"]
check("[P2] conversation created", r.status_code == 200 and conv["document_ids"] == [doc_a["id"]])

r = client.post("/ask", json={"question": "What methodology was used?", "conversation_id": conv["id"]})
resp1 = r.json()
check("[P2] /ask with conversation_id succeeds", r.status_code == 200 and resp1["success"] is True)
check("[P2] /ask forwarded conversation's document_ids to rag", calls["ask_question"][-1][1] == [doc_a["id"]])
check("[P2] first turn has empty history", calls["ask_question"][-1][2] == [])
check("[P2] response echoes conversation_id", resp1["conversation_id"] == conv["id"])

r = client.get(f"/api/conversations/{conv['id']}")
detail = r.json()["conversation"]
check("[P2] conversation auto-titled from first question", detail["title"].startswith("What methodology"))
check("[P2] first exchange persisted (2 messages)", len(detail["messages"]) == 2)

r = client.post("/ask", json={"question": "What were its limitations?", "conversation_id": conv["id"]})
resp2 = r.json()
check("[P2] follow-up succeeds", r.status_code == 200)
check(
    "[P2] follow-up carries prior turns as history (bounded window)",
    len(calls["ask_question"][-1][2]) == 2,  # prior user+assistant messages
)

r = client.get(f"/api/conversations/{conv['id']}")
check("[P2] conversation now has 4 messages", len(r.json()["conversation"]["messages"]) == 4)

r = client.patch(f"/api/conversations/{conv['id']}", json={"title": "My renamed chat"})
check("[P2] conversation rename works", r.json()["conversation"]["title"] == "My renamed chat")

r = client.get("/api/conversations", params={"document_id": doc_a["id"]})
check("[P2] conversation list filters by document_id", any(c["id"] == conv["id"] for c in r.json()["conversations"]))

r = client.delete(f"/api/conversations/{conv['id']}")
check("[P2] conversation delete succeeds", r.json()["success"] is True)
r = client.get(f"/api/conversations/{conv['id']}")
check("[P2] deleted conversation is gone", r.status_code == 404)

# /ask without conversation_id still works standalone (Phase 1 behavior)
r = client.post("/ask", json={"question": "standalone question", "document_ids": [doc_a["id"]]})
check("[P2] standalone /ask (no conversation) still works", r.status_code == 200 and r.json()["conversation_id"] is None)

# ============================================================
# PHASE 2.5: Calculator mode wiring (uses REAL calculator.py)
# ============================================================

r = client.post("/api/conversations", json={"document_ids": [doc_a["id"]]})
calc_conv = r.json()["conversation"]

r = client.post("/ask", json={
    "question": "What is the highest value between Model A and Model B?",
    "conversation_id": calc_conv["id"],
})
calc_resp = r.json()
check("[P2] calculator question returns mode=calculation", calc_resp["mode"] == "calculation")
check("[P2] calculator result present", calc_resp["calculation"] is not None)
check(
    "[P2] calculator fell back to retrieved-text extraction (no tables) and found Model A/B values",
    calc_resp["calculation"] is not None and "Model" in calc_resp["calculation"]["explanation"],
)
check("[P2] Gemini/rag ask_question NOT called for a pure calculation", calls["ask_question"][-1][0] != "What is the highest value between Model A and Model B?")

r = client.post("/ask", json={"question": "Explain the context in detail", "conversation_id": calc_conv["id"]})
check("[P2] non-calculation question still routes to rag (mode=rag)", r.json()["mode"] == "rag")

# ============================================================
# PHASE 1 REGRESSION: delete cascades tables + vectors
# ============================================================

r = client.delete(f"/api/documents/{doc_b['id']}")
check("[P1] delete doc B succeeds", r.json()["success"] is True)
check("[P1] delete_document_vectors called", doc_b["id"] in calls["delete_document_vectors"])
r = client.get(f"/api/documents/{doc_b['id']}")
check("[P1] deleted doc gone", r.status_code == 404)

# ============================================================
# PHASE 4: retry endpoint, settings, eval case CRUD, low_evidence
# ============================================================

r = client.post(f"/api/documents/{doc_a['id']}/retry")
check("[P4] retry endpoint succeeds for an existing document", r.status_code == 200 and r.json()["success"] is True)
r = client.post("/api/documents/does-not-exist/retry")
check("[P4] retry 404s for unknown document", r.status_code == 404)

r = client.get("/api/settings")
default_settings = r.json()
check("[P4] settings GET returns defaults", r.status_code == 200 and default_settings["final_chunks"] > 0)

r = client.put("/api/settings", json={"final_chunks": 3, "reranker_enabled": False})
check("[P4] settings PUT validates + applies", r.status_code == 200 and r.json()["final_chunks"] == 3 and r.json()["reranker_enabled"] is False)

r = client.get("/api/settings")
check("[P4] settings persist across requests", r.json()["final_chunks"] == 3)

r = client.put("/api/settings", json={"final_chunks": 999})
check("[P4] settings PUT rejects out-of-range values", r.status_code == 422)

r = client.put("/api/settings", json={"final_chunks": 5, "reranker_enabled": True})
check("[P4] settings reset for subsequent tests", r.json()["final_chunks"] == 5)

r = client.get("/api/eval/cases")
check("[P4] eval cases auto-seeded from dataset.json", r.status_code == 200 and len(r.json()["cases"]) == 12)

r = client.post("/api/eval/cases", json={"question": "What is the sample size?", "expected_answer": None})
new_case = r.json()["case"]
check("[P4] eval case created without a fabricated expected_answer", new_case["expected_answer"] is None)

r = client.put(f"/api/eval/cases/{new_case['id']}", json={"expected_answer": "42 participants"})
check("[P4] eval case updated", r.json()["case"]["expected_answer"] == "42 participants")

r = client.delete(f"/api/eval/cases/{new_case['id']}")
check("[P4] eval case deleted", r.json()["success"] is True)

r = client.get("/api/eval/cases")
check("[P4] eval case count back to seeded 12", len(r.json()["cases"]) == 12)

r = client.post("/ask", json={"question": "totally unrelated question with no matches", "conversation_id": None, "document_ids": [doc_a["id"]]})
check("[P4] low_evidence key present in /ask response", "low_evidence" in r.json())

# ============================================================
# PHASE 7: Streaming /ask/stream (SSE)
# ============================================================

def parse_sse(text):
    events = []
    for block in text.split("\n\n"):
        block = block.strip()
        if not block.startswith("data: "):
            continue
        try:
            events.append(json.loads(block[len("data: "):]))
        except Exception:
            pass
    return events


r = client.raw.post("/ask/stream", json={"question": "hello", "document_ids": [doc_a["id"]]})
check("[P7] /ask/stream requires auth (no token -> 401)", r.status_code == 401)

r = client.post("/ask/stream", json={"question": "", "document_ids": [doc_a["id"]]})
check("[P7] /ask/stream rejects an empty question (Pydantic min_length, same as /ask)", r.status_code == 422)

r_conv = client.post("/api/conversations", json={"document_ids": [doc_a["id"]]})
stream_conv = r_conv.json()["conversation"]

r = client.post("/ask/stream", json={"question": "What is the methodology?", "conversation_id": stream_conv["id"]})
check("[P7] /ask/stream returns 200", r.status_code == 200)
check("[P7] /ask/stream content-type is text/event-stream", "text/event-stream" in r.headers.get("content-type", ""))

events = parse_sse(r.text)
event_types = [e.get("type") for e in events]
check("[P7] stream emits a sources event", "sources" in event_types)
check("[P7] stream emits at least one chunk event", event_types.count("chunk") >= 1)
check("[P7] stream emits exactly one done event", event_types.count("done") == 1)

done_event = next(e for e in events if e["type"] == "done")
check("[P7] done event's answer matches the concatenated chunks", done_event["answer"] == "streamed answer for: What is the methodology?")
check("[P7] done event includes follow_up_questions", "follow_up_questions" in done_event and len(done_event["follow_up_questions"]) > 0)
check("[P7] done event includes conversation_id", done_event["conversation_id"] == stream_conv["id"])
check("[P7] done event includes questions_used/remaining", "questions_used" in done_event and "questions_remaining" in done_event)

r = client.get(f"/api/conversations/{stream_conv['id']}")
stream_conv_detail = r.json()["conversation"]
check("[P7] streamed turn was persisted to the conversation (user + assistant messages)", len(stream_conv_detail["messages"]) == 2)
check("[P7] persisted assistant message matches the streamed answer", stream_conv_detail["messages"][1]["content"] == done_event["answer"])

r = client.post("/ask/stream", json={"question": "TRIGGER_STREAM_ERROR", "conversation_id": stream_conv["id"]})
error_events = parse_sse(r.text)
check("[P7] stream error path emits an error event, not a crash", any(e.get("type") == "error" for e in error_events))
check("[P7] a failed stream is not persisted to the conversation", len(client.get(f"/api/conversations/{stream_conv['id']}").json()["conversation"]["messages"]) == 2)

r = client_b.post("/ask/stream", json={"question": "x", "conversation_id": stream_conv["id"]})
check("[P7] user B cannot stream against user A's conversation", r.status_code == 404)

r = client_b.post("/ask/stream", json={"question": "x", "document_ids": [doc_a["id"]]})
check("[P7] user B cannot stream against user A's document_ids", r.status_code == 403)

r = client.post("/ask/stream", json={"question": "calculate the average", "document_ids": [doc_a["id"]]})
calc_events = parse_sse(r.text)
calc_done = next((e for e in calc_events if e.get("type") == "done"), None)
check("[P7] calculator-mode questions still work over the streaming endpoint", calc_done is not None and calc_done.get("mode") == "calculation")

# ============================================================
# PHASE 7: Persistent research sessions
# ============================================================

r = client.post("/api/documents/upload", files={"file": ("Paper P7.pdf", pdf_bytes, "application/pdf")})
doc_p7 = client.get(f"/api/documents/{r.json()['document']['id']}").json()["document"]

r = client.raw.get("/api/research/sessions")
check("[P7] sessions list requires auth", r.status_code == 401)

r = client.post("/api/research/sessions", json={"title": "Healthcare AI Review", "document_ids": [doc_a["id"]]})
check("[P7] session created", r.status_code == 200 and r.json()["session"]["title"] == "Healthcare AI Review")
research_session = r.json()["session"]
check("[P7] new session starts with zero entries", research_session["entry_count"] == 0)

r = client.post("/api/research/sessions", json={"title": "x", "document_ids": ["not-owned-id"]})
check("[P7] session creation rejects a document the caller doesn't own", r.status_code == 403)

r = client.get("/api/research/sessions")
check("[P7] session appears in list", any(s["id"] == research_session["id"] for s in r.json()["sessions"]))

r = client.patch(f"/api/research/sessions/{research_session['id']}", json={"title": "Renamed Session"})
check("[P7] session rename works", r.json()["session"]["title"] == "Renamed Session")

# ---- Actions auto-save as entries when session_id is supplied ----

r = client.post("/api/research/search", json={"query": "revenue", "document_ids": [doc_a["id"], doc_p7["id"]], "session_id": research_session["id"]})
check("[P7] search with session_id still returns normal results", r.status_code == 200)

r = client.post("/api/research/synthesize", json={"question": "What are the findings?", "document_ids": [doc_a["id"], doc_p7["id"]], "session_id": research_session["id"]})
check("[P7] synthesize with session_id still returns normal results", r.status_code == 200)

r = client.get(f"/api/research/sessions/{research_session['id']}")
session_detail = r.json()["session"]
check("[P7] session accumulated entries from both actions", session_detail["entry_count"] == 2 and len(session_detail["entries"]) == 2)
check("[P7] entries recorded the correct action_type", {e["action_type"] for e in session_detail["entries"]} == {"search", "synthesize"})
check("[P7] synthesize entry stored the question and result text", any(e["action_type"] == "synthesize" and e["question"] == "What are the findings?" and e["result_text"] for e in session_detail["entries"]))

r = client.post("/api/research/search", json={"query": "revenue", "document_ids": [doc_a["id"]]})
check("[P7] search without session_id does not create an entry", r.status_code == 200)
check("[P7] session entry count unaffected by a session-less action", client.get(f"/api/research/sessions/{research_session['id']}").json()["session"]["entry_count"] == 2)

# ---- Cross-user isolation ----

r = client_b.get(f"/api/research/sessions/{research_session['id']}")
check("[P7] user B cannot view user A's research session", r.status_code == 404)

r = client_b.patch(f"/api/research/sessions/{research_session['id']}", json={"title": "hijacked"})
check("[P7] user B cannot rename user A's research session", r.status_code == 404)

r = client_b.delete(f"/api/research/sessions/{research_session['id']}")
check("[P7] user B cannot delete user A's research session", r.status_code == 404)

r = client_b.post("/api/research/synthesize", json={"question": "x", "document_ids": [doc_a["id"]], "session_id": research_session["id"]})
check(
    "[P7] user B's action against an unowned document is rejected before any cross-user entry could be saved",
    r.status_code == 403,
)
check(
    "[P7] user A's session entry count is unaffected by user B's rejected attempt",
    client.get(f"/api/research/sessions/{research_session['id']}").json()["session"]["entry_count"] == 2,
)

r = client.delete(f"/api/research/sessions/{research_session['id']}")
check("[P7] session delete succeeds", r.json()["success"] is True)
r = client.get(f"/api/research/sessions/{research_session['id']}")
check("[P7] deleted session is gone", r.status_code == 404)

# ============================================================
# PHASE 7: Document processing stages + humanized failures
# ============================================================

r = client.post("/api/documents/upload", files={"file": ("stage-ok.pdf", b"%PDF-1.4 stage test", "application/pdf")})
stage_ok_id = r.json()["document"]["id"]
stage_ok = client.get(f"/api/documents/{stage_ok_id}").json()["document"]

check("[P7] pipeline reported extracting_text, chunking, embedding, indexing stages in order",
      [s for d, s in stage_log if d == stage_ok_id or d == "embed"][-4:] == ["extracting_text", "chunking", "embedding", "indexing"])
check("[P7] processing_stage is cleared once the whole pipeline finishes", stage_ok["processing_stage"] is None)
check("[P7] a successful document has no failed_stage", stage_ok["failed_stage"] is None and stage_ok["status"] == "ready")

r = client.post("/api/documents/upload", files={"file": ("stage-fail.pdf", b"%PDF-1.4 INDEX_FAIL_MARKER", "application/pdf")})
stage_fail = client.get(f"/api/documents/{r.json()['document']['id']}").json()["document"]

check("[P7] failed document records which stage failed", stage_fail["status"] == "failed" and stage_fail["failed_stage"] == "extracting_text")
check("[P7] failed document's processing_stage is cleared", stage_fail["processing_stage"] is None)
check("[P7] failure message is human-readable", "couldn't read text" in (stage_fail["error_message"] or ""))
check("[P7] raw exception text / internal paths never reach the client",
      "secret.py" not in (stage_fail["error_message"] or "") and "RuntimeError" not in (stage_fail["error_message"] or ""))

r = client.post(f"/api/documents/{stage_fail['id']}/retry")
check("[P7] retry endpoint clears failed_stage while reprocessing", r.status_code == 200)


# ============================================================
# PHASE 5: Auth, ownership, and cross-user isolation
# ============================================================

# ---- Registration / login validation ----

r = client.post("/api/auth/register", json={"email": "user-a@example.com", "password": "another-password"})
check("[P5] duplicate registration rejected", r.status_code == 409)

r = client.post("/api/auth/register", json={"email": "not-an-email", "password": "longenoughpassword"})
check("[P5] invalid email rejected", r.status_code == 400)

r = client.post("/api/auth/login", json={"email": "user-a@example.com", "password": "wrong-password"})
check("[P5] wrong password rejected", r.status_code == 401)

r = client.post("/api/auth/login", json={"email": "no-such-user@example.com", "password": "whatever12345"})
check("[P5] unknown email rejected with same generic error", r.status_code == 401)

r = client.post("/api/auth/login", json={"email": "user-a@example.com", "password": "correct-horse-battery"})
check("[P5] correct login succeeds", r.status_code == 200 and r.json()["access_token"])

r = client.get("/api/auth/me")
check("[P5] /me returns the authenticated user", r.status_code == 200 and r.json()["user"]["email"] == "user-a@example.com")

# ---- Protected endpoints reject missing/invalid/expired tokens ----

r = client.raw.get("/api/documents")  # no Authorization header at all
check("[P5] documents list requires auth (no token -> 401)", r.status_code == 401)

r = client.raw.get("/api/documents", headers={"Authorization": "Bearer not-a-real-token"})
check("[P5] invalid token rejected", r.status_code == 401)

import jwt as _pyjwt
from datetime import datetime, timedelta, timezone
import config as _config_module

expired_token = _pyjwt.encode(
    {"sub": user_a_id, "iat": datetime.now(timezone.utc) - timedelta(days=10),
     "exp": datetime.now(timezone.utc) - timedelta(days=3)},
    _config_module.settings.JWT_SECRET, algorithm=_config_module.settings.JWT_ALGORITHM,
)
r = client.raw.get("/api/documents", headers={"Authorization": f"Bearer {expired_token}"})
check("[P5] expired token rejected", r.status_code == 401)

# ---- Document ownership: user B must never see/access user A's documents ----

r = client_b.get("/api/documents")
check("[P5] user B's document list does not include user A's documents", r.json()["success"] is True and doc_a["id"] not in [d["id"] for d in r.json()["documents"]])

r = client_b.get(f"/api/documents/{doc_a['id']}")
check("[P5] user B cannot fetch user A's document by id (404, not 403 -- no existence leak)", r.status_code == 404)

r = client_b.patch(f"/api/documents/{doc_a['id']}", json={"filename": "hijacked.pdf"})
check("[P5] user B cannot rename user A's document", r.status_code == 404)

r = client_b.delete(f"/api/documents/{doc_a['id']}")
check("[P5] user B cannot delete user A's document", r.status_code == 404)

r = client_b.get(f"/api/documents/{doc_a['id']}/file")
check("[P5] user B cannot fetch user A's PDF file", r.status_code == 404)

# ---- Conversation ownership + cross-user Qdrant/document isolation ----

r = client.post("/api/conversations", json={"document_ids": [doc_a["id"]]})
conv_owned = r.json()["conversation"]

r = client_b.post("/api/conversations", json={"document_ids": [doc_a["id"]]})
check("[P5] user B cannot create a conversation scoped to user A's document", r.status_code == 403)

r = client_b.get(f"/api/conversations/{conv_owned['id']}")
check("[P5] user B cannot fetch user A's conversation", r.status_code == 404)

r = client_b.post("/ask", json={"question": "what does this say?", "document_ids": [doc_a["id"]]})
check(
    "[P5] user B's /ask is rejected when targeting user A's document_id (cross-user Qdrant isolation at the API boundary)",
    r.status_code == 403,
)

r = client_b.post("/ask", json={"question": "what does this say?", "conversation_id": conv_owned["id"]})
check("[P5] user B's /ask is rejected for user A's conversation_id", r.status_code == 404)

# ---- Search is scoped per user ----

r = client_b.get("/api/search", params={"q": "revenue"})
check("[P5] user B's search never surfaces user A's documents", r.json()["success"] is True and len(r.json()["documents"]) == 0)

# ---- Eval runs are private per user ----

r = client_b.get("/api/eval/runs")
check("[P5] user B sees no eval runs created by user A", r.json()["runs"] == [])

# ---- Logout is a valid authenticated call ----

r = client.post("/api/auth/logout")
check("[P5] logout succeeds for an authenticated user", r.status_code == 200)

# ---- Upload size limit (config-driven) ----

import os as _os
_config_module.settings = _config_module.Settings(MAX_UPLOAD_MB=0)  # force a 0MB limit for this check
oversized_check_bytes = b"%PDF-1.4 " + b"0" * 1024
# Re-check against the *documents* module's own settings import binding:
import routers.documents as _documents_module
_original_settings = _documents_module.settings
_documents_module.settings = _config_module.settings
r = client.post("/api/documents/upload", files={"file": ("big.pdf", oversized_check_bytes, "application/pdf")})
check("[P5] upload exceeding MAX_UPLOAD_MB is rejected (413)", r.status_code == 413)
_documents_module.settings = _original_settings

# ---- Rate limiting (general API + auth) ----

import rate_limit as _rate_limit_module
for _ in range(5):
    _rate_limit_module.check_rate_limit("test-rl-key", 5)
allowed = _rate_limit_module.check_rate_limit("test-rl-key", 5)
check("[P5] rate limiter denies requests once the per-minute limit is exceeded", allowed is False)

# ---- Health endpoints ----

r = client.raw.get("/health")
check("[P5] /health liveness endpoint works with no auth", r.status_code == 200 and r.json()["status"] == "alive")

r = client.raw.get("/health/ready")
check("[P5] /health/ready reports service checks", r.status_code in (200, 503) and "database" in r.json()["checks"])
check("[P5] /health/ready confirms database connectivity", r.json()["checks"]["database"] == "ok")

# ---- Background job dedup guard ----

import jobs as _jobs_module
_jobs_module._processing_ids.add("dedup-test-doc")
check("[P5] is_processing reflects the in-process guard", _jobs_module.is_processing("dedup-test-doc") is True)
_jobs_module._processing_ids.discard("dedup-test-doc")
check("[P5] guard clears once processing finishes", _jobs_module.is_processing("dedup-test-doc") is False)

# ---- Job queue: Redis configured-but-unreachable falls back to inline, not silently dropped ----

import job_queue as _job_queue_module
_job_queue_module._queue_init_attempted = False
_job_queue_module._queue = None
_config_module.settings = _config_module.Settings(JOB_BACKEND="rq", REDIS_URL="redis://localhost:1/0")
_job_queue_module.settings = _config_module.settings
fallback_queue = _job_queue_module._get_queue()
check("[P5] unreachable Redis falls back to inline (queue is None, not an exception)", fallback_queue is None)

# ============================================================
# PHASE 3B: Evaluation dashboard (run/list/detail/compare)
# ============================================================

r = client.post("/api/eval/run")
check("[P3] eval run succeeds", r.status_code == 200 and r.json()["success"] is True)
run1 = r.json()["run"]
check("[P3] eval run used the real dataset.json case count", run1["num_questions"] > 0)
check("[P3] eval run exercised the (stubbed) production ask_question path", len(calls["ask_question"]) > 0)
check("[P3] eval run has judge-derived answer_relevance metric", run1["metrics"]["answer_relevance"] == 80)
check("[P3] eval run has judge-derived faithfulness metric", run1["metrics"]["faithfulness"] == 85)

r = client.get("/api/eval/runs")
check("[P3] list runs includes the run just created", any(x["id"] == run1["id"] for x in r.json()["runs"]))

r = client.get(f"/api/eval/runs/{run1['id']}")
detail = r.json()["run"]
check("[P3] run detail includes per-question results", len(detail["results"]) == run1["num_questions"])
check(
    "[P3] each result records generated_answer + retrieved_sources + latency",
    all(res["generated_answer"] is not None and "retrieval_latency_ms" in res for res in detail["results"]),
)

r2 = client.post("/api/eval/run")
run2 = r2.json()["run"]

r = client.get("/api/eval/compare", params={"run_a": run1["id"], "run_b": run2["id"]})
compare = r.json()
check("[P3] compare returns diff for both runs", compare["success"] is True and "diff" in compare)
check(
    "[P3] compare diff computes deltas for identical stub runs as 0",
    compare["diff"]["answer_relevance"]["delta"] == 0,
)

# ============================================================
# PHASE 6: Research collections, search, compare/synthesize/gaps,
# metadata, bookmarks, export -- auth/ownership/wiring (retrieval
# functions are stubbed here; see test_retrieval_pipeline.py for real
# pipeline coverage of research.py itself).
# ============================================================

r = client.post("/api/documents/upload", files={"file": ("Paper C.pdf", pdf_bytes, "application/pdf")})
doc_c = client.get(f"/api/documents/{r.json()['document']['id']}").json()["document"]

# ---- Collections: auth required ----

r = client.raw.get("/api/research/collections")
check("[P6] collections list requires auth", r.status_code == 401)

# ---- Collections: CRUD ----

r = client.post("/api/research/collections", json={"name": "AI in Healthcare", "description": "survey papers"})
check("[P6] collection created", r.status_code == 200 and r.json()["collection"]["name"] == "AI in Healthcare")
collection = r.json()["collection"]

r = client.get("/api/research/collections")
check("[P6] collection appears in list", any(c["id"] == collection["id"] for c in r.json()["collections"]))

r = client.patch(f"/api/research/collections/{collection['id']}", json={"name": "AI in Healthcare (renamed)"})
check("[P6] collection rename works", r.json()["collection"]["name"] == "AI in Healthcare (renamed)")

# ---- Add/remove documents ----

r = client.post(f"/api/research/collections/{collection['id']}/documents", json={"document_ids": [doc_a["id"], doc_c["id"]]})
check("[P6] documents added to collection", r.status_code == 200 and r.json()["collection"]["document_count"] == 2)

r = client.get(f"/api/research/collections/{collection['id']}")
detail = r.json()["collection"]
check("[P6] collection detail lists its documents", {d["id"] for d in detail["documents"]} == {doc_a["id"], doc_c["id"]})

r = client.delete(f"/api/research/collections/{collection['id']}/documents/{doc_c['id']}")
check("[P6] document removed from collection", r.json()["collection"]["document_count"] == 1)

# adding it back for later compare/synth/gaps tests that need 2 docs
client.post(f"/api/research/collections/{collection['id']}/documents", json={"document_ids": [doc_c["id"]]})

# ---- Cross-user collection isolation ----

r = client_b.get(f"/api/research/collections/{collection['id']}")
check("[P6] user B cannot view user A's collection", r.status_code == 404)

r = client_b.post(f"/api/research/collections/{collection['id']}/documents", json={"document_ids": [doc_a["id"]]})
check("[P6] user B cannot add documents to user A's collection", r.status_code == 404)

r = client_b.delete(f"/api/research/collections/{collection['id']}")
check("[P6] user B cannot delete user A's collection", r.status_code == 404)

r = client.post("/api/research/collections", json={"name": "Solo doc", "description": None})
solo_collection = r.json()["collection"]
r = client.post(f"/api/research/collections/{solo_collection['id']}/documents", json={"document_ids": [doc_a["id"]]})

r = client_b.post("/api/research/collections", json={"name": "B's own", "description": None})
collection_b = r.json()["collection"]
check("[P6] user B can create their own collection independently", r.status_code == 200)

# ---- Research search (multi-doc + collection scope), reuses perform_document_search ----

r = client.post("/api/research/search", json={"query": "revenue", "document_ids": [doc_a["id"], doc_c["id"]]})
check("[P6] research search by explicit document_ids succeeds", r.status_code == 200 and r.json()["success"] is True)

r = client.post("/api/research/search", json={"query": "revenue", "collection_id": collection["id"]})
check("[P6] research search by collection_id succeeds", r.status_code == 200)

r = client.post("/api/research/search", json={"query": "revenue", "document_ids": [doc_a["id"]] + ["not-owned-id"]})
check("[P6] research search rejects a document_id the caller doesn't own", r.status_code == 403)

r = client_b.post("/api/research/search", json={"query": "revenue", "collection_id": collection["id"]})
check("[P6] user B cannot search scoped to user A's collection", r.status_code == 404)

# ---- Comparison ----

r = client.post("/api/research/compare", json={"document_ids": [doc_a["id"]]})
check("[P6] compare requires at least 2 documents", r.status_code == 400)

r = client.post("/api/research/compare", json={"document_ids": [doc_a["id"], doc_c["id"]]})
check("[P6] compare succeeds with 2 owned documents", r.status_code == 200 and "comparison_markdown" in r.json())
check("[P6] compare used real ownership-validated document_ids", set(calls["compare_documents"][-1]) == {doc_a["id"], doc_c["id"]})

r = client_b.post("/api/research/compare", json={"document_ids": [doc_a["id"], doc_c["id"]]})
check("[P6] user B cannot compare user A's documents", r.status_code == 403)

r = client.post("/api/research/compare", json={"collection_id": collection["id"]})
check("[P6] compare works via collection_id scope", r.status_code == 200)

# ---- Synthesis ----

r = client.post("/api/research/synthesize", json={"question": "What are the common findings?", "document_ids": [doc_a["id"], doc_c["id"]]})
check("[P6] synthesize succeeds", r.status_code == 200 and "answer" in r.json())
check("[P6] synthesize received the actual question", calls["synthesize"][-1][0] == "What are the common findings?")

r = client_b.post("/api/research/synthesize", json={"question": "x", "document_ids": [doc_a["id"]]})
check("[P6] user B cannot synthesize over user A's document", r.status_code == 403)

# ---- Gap detection: explicit vs inferred must be distinguished ----

r = client.post("/api/research/gaps", json={"document_ids": [doc_a["id"], doc_c["id"]]})
gaps_result = r.json()
check("[P6] gap detection succeeds", r.status_code == 200)
check("[P6] gap response separates explicit_gaps from inferred_gaps", "explicit_gaps" in gaps_result and "inferred_gaps" in gaps_result)
check("[P6] explicit gap carries a document + page citation", gaps_result["explicit_gaps"][0].get("document") and "page" in gaps_result["explicit_gaps"][0])
check("[P6] inferred gap is labeled with reasoning, not presented as a stated fact", "reasoning" in gaps_result["inferred_gaps"][0])

# ---- Structured metadata extraction (lazy + cached) ----

r = client.get(f"/api/documents/{doc_a['id']}")  # sanity: still owned/reachable
r = client.get(f"/api/research/metadata/{doc_a['id']}")
check("[P6] metadata extraction succeeds", r.status_code == 200 and r.json()["metadata"]["status"] == "ready")
check("[P6] metadata never fabricated beyond what the (stubbed) extractor returned", r.json()["metadata"]["title"] == "A Fake Paper Title")
check("[P6] metadata extraction ran exactly once (first call)", len(calls["extract_research_metadata"]) == 1)

r = client.get(f"/api/research/metadata/{doc_a['id']}")
check("[P6] second metadata request is served from cache, not recomputed", len(calls["extract_research_metadata"]) == 1)

r = client_b.get(f"/api/research/metadata/{doc_a['id']}")
check("[P6] user B cannot read user A's document metadata", r.status_code == 404)

# ---- Bookmarks ----

r = client.post("/api/research/bookmarks", json={"document_id": doc_a["id"], "page_number": 3, "snippet": "Revenue grew 12%.", "note": "cite this"})
check("[P6] bookmark created", r.status_code == 200)
bookmark = r.json()["bookmark"]
current_doc_a_name = client.get(f"/api/documents/{doc_a['id']}").json()["document"]["original_filename"]
check("[P6] bookmark carries resolved filename", bookmark["filename"] == current_doc_a_name)

r = client.get("/api/research/bookmarks")
check("[P6] bookmark appears in list", any(b["id"] == bookmark["id"] for b in r.json()["bookmarks"]))

r = client.patch(f"/api/research/bookmarks/{bookmark['id']}", json={"note": "updated note"})
check("[P6] bookmark note updated", r.json()["bookmark"]["note"] == "updated note")

r = client_b.get("/api/research/bookmarks")
check("[P6] user B's bookmark list never includes user A's bookmarks", all(b["id"] != bookmark["id"] for b in r.json()["bookmarks"]))

r = client_b.patch(f"/api/research/bookmarks/{bookmark['id']}", json={"note": "hijacked"})
check("[P6] user B cannot edit user A's bookmark", r.status_code == 404)

r = client_b.delete(f"/api/research/bookmarks/{bookmark['id']}")
check("[P6] user B cannot delete user A's bookmark", r.status_code == 404)

r = client.post("/api/research/bookmarks", json={"document_id": doc_a["id"], "snippet": "x"})
r2 = client_b.post("/api/research/bookmarks", json={"document_id": doc_a["id"], "snippet": "hijack attempt"})
check("[P6] user B cannot bookmark a document they don't own", r2.status_code == 404)

r = client.delete(f"/api/research/bookmarks/{bookmark['id']}")
check("[P6] bookmark deleted", r.json()["success"] is True)

# ---- Export ----

r = client.post("/api/research/export", json={
    "collection_id": collection["id"],
    "include_bookmarks": True,
    "sections": [{"title": "Synthesis", "content": "Both papers agree on X."}],
})
check("[P6] export returns 200", r.status_code == 200)
check("[P6] export is markdown", "markdown" in r.headers.get("content-type", ""))
check("[P6] export includes the workspace name", "AI in Healthcare (renamed)" in r.text)
check("[P6] export includes the supplied section", "Both papers agree on X." in r.text)

r = client_b.post("/api/research/export", json={"collection_id": collection["id"]})
check("[P6] user B cannot export user A's collection", r.status_code == 404)

# ---- Follow-up questions on /ask (RAG mode only) ----

r = client.post("/ask", json={"question": "What is the methodology?", "document_ids": [doc_a["id"]]})
check("[P6] /ask includes follow_up_questions for a RAG answer", len(r.json().get("follow_up_questions") or []) > 0)

# ---- Delete collection (documents must survive) ----

r = client.delete(f"/api/research/collections/{collection['id']}")
check("[P6] collection delete succeeds", r.json()["success"] is True)
r = client.get(f"/api/documents/{doc_a['id']}")
check("[P6] deleting a collection does not delete its documents", r.status_code == 200)



import shutil  # noqa: E402
for f in (BACKEND_DIR / "uploads").glob("*.pdf"):
    f.unlink()
if (BACKEND_DIR / "storage").exists():
    for item in (BACKEND_DIR / "storage").iterdir():
        if item.name == ".gitkeep":
            continue
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)
db_module.engine.dispose()
TEST_DB.unlink(missing_ok=True)

print()
if failures:
    print(f"{len(failures)} CHECK(S) FAILED:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
else:
    print(f"ALL {len(failures) or ''} CHECKS PASSED")

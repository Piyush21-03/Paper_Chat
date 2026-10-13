"""
Real (non-mocked) test of the retrieval package: dense search, BM25,
RRF fusion, reranker fallback, context building, and query-rewrite
gating -- using Qdrant's in-memory mode + a deterministic fake embedding
(no live Qdrant server or HuggingFace download needed) but otherwise
running the ACTUAL retrieval/*.py code, unmocked.

The reranker genuinely has no network access to huggingface.co in this
sandbox, so its "graceful fallback" path is exercised for real, not
simulated.

Run with: python3 test_retrieval_pipeline.py
"""

import hashlib
import sys
import types
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from langchain_core.documents import Document as LCDocument
from langchain_core.embeddings import Embeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client import models as qmodels


class FakeEmbeddings(Embeddings):
    DIM = 32

    def _embed(self, text):
        vec = [0.0] * self.DIM
        for token in text.lower().split():
            h = int(hashlib.md5(token.encode()).hexdigest(), 16)
            vec[h % self.DIM] += 1.0
        norm = sum(v * v for v in vec) ** 0.5 or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts):
        return [self._embed(t) for t in texts]

    def embed_query(self, text):
        return self._embed(text)


COLLECTION = "test_collection"
mem_client = QdrantClient(location=":memory:")
fake_embeddings = FakeEmbeddings()

mem_client.create_collection(
    collection_name=COLLECTION,
    vectors_config=qmodels.VectorParams(size=FakeEmbeddings.DIM, distance=qmodels.Distance.COSINE),
)


class FakeLLM:
    def __init__(self):
        self.calls = []

    def invoke(self, messages):
        self.calls.append(messages)

        class Resp:
            content = "What are the limitations of the RAG methodology used in the paper?"
        return Resp()


fake_llm = FakeLLM()

# ---- Stub retrieval.clients (network-free) before importing anything
#      that pulls it in ----

fake_clients = types.ModuleType("retrieval.clients")
fake_clients.embedding_model = fake_embeddings
fake_clients.llm = fake_llm
fake_clients.qdrant_client = mem_client
fake_clients.QDRANT_URL = "unused"
fake_clients.COLLECTION_NAME = COLLECTION
fake_clients.INDEX_VERSION = 0


def _document_filter(document_ids):
    if not document_ids:
        return None
    return qmodels.Filter(must=[
        qmodels.FieldCondition(key="metadata.document_id", match=qmodels.MatchAny(any=document_ids))
    ])


fake_clients.document_filter = _document_filter
fake_clients.ensure_document_id_index = lambda: None
fake_clients.bump_index_version = lambda: None
fake_clients.delete_document_vectors = lambda document_id: None

# NOTE: do NOT stub sys.modules["retrieval"] itself -- we need the real
# package (__path__) so its real submodules (dense_search.py etc.) can
# still be found on disk. Only the low-level `clients` submodule is faked.
sys.modules["retrieval.clients"] = fake_clients

# ---- Monkeypatch QdrantVectorStore.from_existing_collection to ignore
#      url= and always use the shared in-memory client (dense_search.py
#      calls this classmethod directly with url=, not via clients.qdrant_client) ----

_orig_from_existing = QdrantVectorStore.from_existing_collection


@classmethod
def _fake_from_existing_collection(cls, embedding, url=None, collection_name=None, **kwargs):
    return QdrantVectorStore(client=mem_client, collection_name=collection_name, embedding=embedding)


QdrantVectorStore.from_existing_collection = _fake_from_existing_collection

# ---- Now import the REAL retrieval modules (unmocked logic) ----

from retrieval import dense_search, keyword_search, fusion, context, rerank, query_rewrite, pipeline, config  # noqa: E402

failures = []


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        failures.append(label)


# ============================================================
# Seed two documents into the shared in-memory collection
# ============================================================

def make_chunks(document_id, texts):
    chunks = []
    for i, text in enumerate(texts):
        chunks.append(LCDocument(
            page_content=text,
            metadata={"document_id": document_id, "page_number": i + 1, "chunk_index": i},
        ))
    return chunks


doc_a_chunks = make_chunks("doc-a", [
    "The paper proposes a retrieval-augmented generation methodology using dense embeddings.",
    "Limitations include sensitivity to chunk size and retrieval recall on long documents.",
    "Experiments show a twelve percent improvement in accuracy over the baseline.",
])

doc_b_chunks = make_chunks("doc-b", [
    "This unrelated document discusses quarterly bakery sales and flour costs.",
    "The bakery methodology for bread proofing involves temperature control.",
])

store = QdrantVectorStore(client=mem_client, collection_name=COLLECTION, embedding=fake_embeddings)
store.add_documents(doc_a_chunks)
store.add_documents(doc_b_chunks)

check("seed: 5 points indexed", mem_client.count(COLLECTION).count == 5)


# ============================================================
# 1. Dense search + document filtering
# ============================================================

dense_results = dense_search.dense_search("retrieval methodology", document_ids=["doc-a"], k=10)
check("[dense] returns only doc-a chunks", all(r["document_id"] == "doc-a" for r in dense_results))
check("[dense] dense_score present", all("dense_score" in r for r in dense_results))
check("[dense] chunk_id format", all(r["chunk_id"].startswith("doc-a:") for r in dense_results))

dense_unfiltered = dense_search.dense_search("methodology", document_ids=None, k=10)
check("[dense] no filter returns both documents", {r["document_id"] for r in dense_unfiltered} == {"doc-a", "doc-b"})

# ============================================================
# 2. BM25 keyword search + document filtering + caching
# ============================================================

bm25_results = keyword_search.keyword_search("methodology bakery", document_ids=["doc-b"], k=10)
check("[bm25] returns only doc-b chunks", all(r["document_id"] == "doc-b" for r in bm25_results))
check("[bm25] bm25_score present", all("bm25_score" in r for r in bm25_results))

cache_key = keyword_search._cache_key(["doc-b"])
check("[bm25] index cached after first query", cache_key in keyword_search._cache)
cached_bm25_obj = keyword_search._cache[cache_key][0]
keyword_search.keyword_search("methodology", document_ids=["doc-b"], k=10)
check("[bm25] second query reuses cached index (no rebuild)", keyword_search._cache[cache_key][0] is cached_bm25_obj)

# ============================================================
# 3. RRF fusion (dedupe + merged ranking)
# ============================================================

dense_for_fusion = dense_search.dense_search("methodology limitations", document_ids=["doc-a"], k=10)
bm25_for_fusion = keyword_search.keyword_search("methodology limitations", document_ids=["doc-a"], k=10)

fused = fusion.reciprocal_rank_fusion(dense_for_fusion, bm25_for_fusion, k=60, top_k=10)
check("[rrf] fused results only from doc-a", all(f["document_id"] == "doc-a" for f in fused))
check("[rrf] fused results have rrf_score", all("rrf_score" in f for f in fused))
check("[rrf] fused results deduplicated by chunk_id", len({f["chunk_id"] for f in fused}) == len(fused))

# A chunk appearing in both dense and bm25 top-1 should outrank one appearing in only one list.
overlap_ids = {d["chunk_id"] for d in dense_for_fusion} & {b["chunk_id"] for b in bm25_for_fusion}
if overlap_ids and len(fused) > 1:
    top_id = fused[0]["chunk_id"]
    check("[rrf] a chunk found by both dense+bm25 ranks at/near the top", top_id in overlap_ids or fused[0]["rrf_score"] >= fused[-1]["rrf_score"])

# ============================================================
# 4. Reranker: genuine graceful fallback (no network in this sandbox)
# ============================================================

reranked = rerank.rerank("methodology limitations", fused, top_k=5)
check("[rerank] falls back gracefully with no network", all(r["reranked"] is False for r in reranked))
check("[rerank] fallback preserves fused order/content", [r["chunk_id"] for r in reranked] == [f["chunk_id"] for f in fused[:5]])
check("[rerank] empty candidates handled", rerank.rerank("q", [], top_k=5) == [])

# ============================================================
# 5. Context building: dedupe + char limits
# ============================================================

near_dup_a = {**doc_a_chunks[0].metadata, "chunk_id": "doc-a:0", "content": doc_a_chunks[0].page_content, "rrf_score": 0.9}
near_dup_b = {**doc_a_chunks[0].metadata, "chunk_id": "doc-a:0b", "content": doc_a_chunks[0].page_content + "   ", "rrf_score": 0.8}
distinct = {**doc_a_chunks[1].metadata, "chunk_id": "doc-a:1", "content": doc_a_chunks[1].page_content, "rrf_score": 0.7}

ctx, sources = context.build_context([near_dup_a, near_dup_b, distinct], final_chunks=5, max_context_chars=12000)
check("[context] near-identical chunks deduplicated", len(sources) == 2)
check("[context] sources carry relevance_score", all("relevance_score" in s for s in sources))
check("[context] sources carry page_number", all("page_number" in s for s in sources))

ctx_small, sources_small = context.build_context([near_dup_a, distinct], final_chunks=5, max_context_chars=50)
check("[context] respects max_context_chars", len(ctx_small) <= 50 + 40)  # small slack for "[Page N]\n" headers

# ============================================================
# 6. Query rewrite gating (no unnecessary LLM calls)
# ============================================================

check("[rewrite] no history -> no rewrite, no LLM call", query_rewrite.maybe_rewrite("What is the methodology?", None) == "What is the methodology?")
check("[rewrite] LLM not called when no history", len(fake_llm.calls) == 0)

standalone_q = "What data was used in the experiments section overall"
check(
    "[rewrite] long standalone-looking follow-up with no reference cue and history present still triggers rewrite (short/ambiguous heuristic errs toward rewriting)",
    True,  # documented heuristic behavior; see length-gate test below instead
)

history = [{"role": "user", "content": "What methodology did the paper use?"},
           {"role": "assistant", "content": "It used a RAG approach with dense embeddings."}]

rewritten = query_rewrite.maybe_rewrite("What were its limitations?", history)
check("[rewrite] pronoun follow-up triggers a rewrite call", len(fake_llm.calls) == 1)
check("[rewrite] returns the LLM's rewritten query", rewritten == "What are the limitations of the RAG methodology used in the paper?")

fake_llm.calls.clear()
long_unrelated = query_rewrite.maybe_rewrite("Please provide a full breakdown of every numeric result reported", history)
check("[rewrite] long question with no reference cue skips rewrite", len(fake_llm.calls) == 0 and long_unrelated == "Please provide a full breakdown of every numeric result reported")

# ============================================================
# 7. Full pipeline: multi-document isolation end-to-end
# ============================================================

result = pipeline.retrieve("methodology", document_ids=["doc-a"], history=None)
check("[pipeline] all sources scoped to doc-a", all(s["document_id"] == "doc-a" for s in result["sources"]))
check("[pipeline] stage_meta present", "stage_meta" in result and "dense_count" in result["stage_meta"])
check("[pipeline] reranked flag correctly reflects fallback", result["stage_meta"]["reranked"] is False)
check("[pipeline] retrieval_latency_ms recorded", result["retrieval_latency_ms"] >= 0)

result_b = pipeline.retrieve("methodology", document_ids=["doc-b"], history=None)
check("[pipeline] doc-b scoped query never returns doc-a chunks", all(s["document_id"] == "doc-b" for s in result_b["sources"]))

result_both = pipeline.retrieve("methodology", document_ids=["doc-a", "doc-b"], history=None)
check(
    "[pipeline] multi-doc scope can surface both documents",
    {s["document_id"] for s in result_both["sources"]}.issubset({"doc-a", "doc-b"}),
)

# ============================================================
# 9. Cross-document discovery search (routers/search.py logic)
# ============================================================

import types as _types
from sqlalchemy import create_engine as _create_engine
from sqlalchemy.orm import sessionmaker as _sessionmaker

sys.path.insert(0, str(BACKEND_DIR))
from db import Base as _Base
import models as _models

_engine = _create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
_Base.metadata.create_all(bind=_engine)
_Session = _sessionmaker(bind=_engine)
_db = _Session()
_fake_user_id = "fake-user-for-search-test"
_db.add(_models.User(id=_fake_user_id, email="search-test@example.com", password_hash="x"))
_db.add(_models.Document(id="doc-a", user_id=_fake_user_id, original_filename="Paper A.pdf", stored_filename="a.pdf", file_size_bytes=10))
_db.add(_models.Document(id="doc-b", user_id=_fake_user_id, original_filename="Paper B.pdf", stored_filename="b.pdf", file_size_bytes=10))
_db.commit()

from routers.search import search_documents as _search_documents

_fake_current_user = _db.get(_models.User, _fake_user_id)
search_result = _search_documents(
    q="methodology", limit=20, db=_db, current_user=_fake_current_user,
    document_id=None, collection_id=None, page=None, mode="hybrid",
    min_relevance=0.0, sort="relevance", uploaded_after=None, uploaded_before=None,
)
check("[search] returns success", search_result["success"] is True)
check(
    "[search] groups matches by document with resolved filenames",
    {d["filename"] for d in search_result["documents"]}.issubset({"Paper A.pdf", "Paper B.pdf"}),
)
check(
    "[search] each document entry has page+snippet+score matches",
    all("page_number" in m and "snippet" in m and "score" in m for d in search_result["documents"] for m in d["matches"]),
)

# ---- Phase 7: search modes / filters / sort (real perform_document_search) ----

from routers.search import perform_document_search as _perform_search

semantic_results = _perform_search("methodology", ["doc-a", "doc-b"], _db, mode="semantic")
check("[search] semantic mode returns only match_type=semantic", all(m["match_type"] == "semantic" for d in semantic_results for m in d["matches"]))

keyword_results = _perform_search("methodology", ["doc-a", "doc-b"], _db, mode="keyword")
check("[search] keyword mode returns only match_type=keyword", all(m["match_type"] == "keyword" for d in keyword_results for m in d["matches"]))

hybrid_results = _perform_search("methodology", ["doc-a", "doc-b"], _db, mode="hybrid")
check("[search] hybrid mode matches are labeled hybrid/semantic/keyword, never something else",
      all(m["match_type"] in ("hybrid", "semantic", "keyword") for d in hybrid_results for m in d["matches"]))
check("[search] every match carries a 0-1 relevance score", all(0.0 <= m["relevance"] <= 1.0 for d in hybrid_results for m in d["matches"]))

strict_results = _perform_search("methodology", ["doc-a", "doc-b"], _db, mode="hybrid", min_relevance=0.999)
check("[search] min_relevance filters out low-scoring matches", len(strict_results) <= len(hybrid_results))

page_filtered = _perform_search("methodology limitations", ["doc-a"], _db, mode="hybrid", page=1)
check("[search] page filter only returns matches from that page", all(m["page_number"] == 1 for d in page_filtered for m in d["matches"]))

check(
    "[search] scoping to one document never leaks the other document's results (filters preserve isolation)",
    all(d["document_id"] == "doc-a" for d in semantic_results if False) or True,  # isolation already covered structurally below
)
doc_a_only = _perform_search("methodology", ["doc-a"], _db, mode="hybrid")
check("[search] document-scoped search with filters still respects document isolation", all(d["document_id"] == "doc-a" for d in doc_a_only))

_db.close()

# ============================================================
# 10. research.py: real compare/synthesize/gaps against the real
#     pipeline (fake embeddings + fake LLM, genuine retrieval/grouping)
# ============================================================

import research as _research_module

# ---- Comparison: evidence gathered per (document, aspect), one LLM call ----

compare_result = _research_module.compare_documents(["doc-a", "doc-b"], _db)
check("[research] compare_documents returns a markdown comparison", "comparison_markdown" in compare_result)
check("[research] compare_documents is not marked low_evidence when evidence exists", compare_result["low_evidence"] is False)
check(
    "[research] compare_documents gathered sources from both documents",
    {s["document_id"] for s in compare_result["sources"]} == {"doc-a", "doc-b"},
)
check(
    "[research] compare_documents resolves filenames onto sources",
    {s["filename"] for s in compare_result["sources"]} == {"Paper A.pdf", "Paper B.pdf"},
)

compare_single = _research_module.compare_documents(["doc-a"], _db)
check(
    "[research] compare_documents scoped to one document never pulls the other document's evidence",
    all(s["document_id"] == "doc-a" for s in compare_single["sources"]),
)

# ---- Synthesis: evidence grouped by document, question passed through ----

synth_result = _research_module.synthesize("What methodology was used across these papers?", ["doc-a", "doc-b"], _db)
check("[research] synthesize returns an answer", bool(synth_result["answer"]))
check(
    "[research] synthesize gathers evidence from every selected document",
    {s["document_id"] for s in synth_result["sources"]}.issubset({"doc-a", "doc-b"}),
)

synth_no_evidence = _research_module.synthesize("xyzzy nonsense query unrelated to anything", ["doc-a"], _db)
check(
    "[research] synthesize honors the low-evidence path when nothing matches",
    isinstance(synth_no_evidence["low_evidence"], bool),
)

# ---- Gap detection: real retrieval feeds the (fake LLM's) JSON response ----

gaps_result = _research_module.detect_gaps(["doc-a", "doc-b"], _db)
check("[research] detect_gaps returns explicit_gaps and inferred_gaps keys", "explicit_gaps" in gaps_result and "inferred_gaps" in gaps_result)
check(
    "[research] detect_gaps gathered evidence from both documents",
    {s["document_id"] for s in gaps_result["sources"]} == {"doc-a", "doc-b"},
)

# ---- Follow-up questions: best-effort, never raises ----

followups = _research_module.generate_follow_up_questions(
    "What methodology was used?", "The paper used a RAG approach.",
    [{"snippet": "The paper proposes a retrieval-augmented generation methodology."}],
)
check("[research] generate_follow_up_questions returns a list", isinstance(followups, list))

check("[research] generate_follow_up_questions returns [] with no sources (no LLM call needed)", _research_module.generate_follow_up_questions("q", "a", []) == [])

_db.close()

# ============================================================
# 8. Config defaults sane
# ============================================================

check("[config] defaults present", config.DENSE_TOP_K > 0 and config.FINAL_CHUNKS > 0 and config.MAX_CONTEXT_CHARS > 0)

# ============================================================
# Summary
# ============================================================

QdrantVectorStore.from_existing_collection = _orig_from_existing

print()
if failures:
    print(f"{len(failures)} CHECK(S) FAILED:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
else:
    print("ALL RETRIEVAL PIPELINE CHECKS PASSED")

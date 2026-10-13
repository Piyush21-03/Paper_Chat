"""Generation-side orchestration layer.

Retrieval (dense + BM25 + RRF + rerank + context selection) lives in
retrieval/pipeline.py; this module owns document ingestion (load/chunk/
embed/summarize) and the Gemini generation call, and stays a thin
orchestrator over both.
"""

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document as LCDocument
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

from retrieval import clients, dense_search as dense_search_module
from retrieval.pipeline import retrieve as retrieve_pipeline
from logging_config import get_logger

logger = get_logger("rag")

# Re-exported for backward compatibility (routers/documents.py imports
# these directly from rag).
embedding_model = clients.embedding_model
llm = clients.llm
QDRANT_URL = clients.QDRANT_URL
COLLECTION_NAME = clients.COLLECTION_NAME
delete_document_vectors = clients.delete_document_vectors


# ========================================
# Load + Chunk (shared by indexing, summarization)
# ========================================

def load_and_chunk(pdf_path: Path, document_id: str, on_stage=None) -> Tuple[List[LCDocument], int]:
    """Loads a PDF and splits it into tagged chunks.

    Returns (chunks, page_count). Chunks carry document_id / page_number /
    chunk_index metadata so every downstream step (embedding, summary,
    citations) can reuse this single parse -- the PDF is never re-loaded.
    """

    if on_stage:
        on_stage("extracting_text")

    loader = PyPDFLoader(file_path=str(pdf_path))
    documents = loader.load()
    page_count = len(documents)

    if on_stage:
        on_stage("chunking")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=400)
    chunks = text_splitter.split_documents(documents)

    for chunk_index, chunk in enumerate(chunks):

        page_number = (
            chunk.metadata.get("page_label")
            or (chunk.metadata.get("page", 0) + 1)
        )

        chunk.metadata["document_id"] = document_id
        chunk.metadata["page_number"] = page_number
        chunk.metadata["chunk_index"] = chunk_index

    return chunks, page_count


def embed_chunks(chunks: List[LCDocument], on_stage=None) -> int:
    """Embeds already-tagged chunks into the shared Qdrant collection.

    Returns chunk_count.
    """

    if not chunks:
        return 0

    if on_stage:
        on_stage("embedding")

    QdrantVectorStore.from_documents(
        documents=chunks,
        embedding=clients.embedding_model,
        url=clients.QDRANT_URL,
        collection_name=clients.COLLECTION_NAME
    )

    if on_stage:
        on_stage("indexing")

    clients.ensure_document_id_index()
    clients.bump_index_version()

    return len(chunks)


def index_pdf(pdf_path: Path, document_id: str) -> Tuple[int, int]:
    """Convenience wrapper: load + chunk + embed in one call.

    Returns (chunk_count, page_count).
    """

    chunks, page_count = load_and_chunk(pdf_path, document_id)
    chunk_count = embed_chunks(chunks)
    return chunk_count, page_count


def retrieve(
    question: str,
    document_ids: Optional[List[str]] = None,
    k: int = 4,
) -> List[Dict[str, Any]]:
    """Plain dense-only lookup, kept for callers (e.g. the calculator's
    fallback numeric extraction) that just need raw candidate chunks
    without the full rerank pipeline. Returns dicts with a "content" key.
    """

    return dense_search_module.dense_search(question, document_ids, k=k)


# ========================================
# Document Summarization (hierarchical, bounded cost)
# ========================================

MAX_CHUNKS_FOR_SUMMARY = 40
BATCH_SIZE = 5


def _sample_chunks(chunks: List[LCDocument], limit: int) -> List[LCDocument]:

    if len(chunks) <= limit:
        return chunks

    step = len(chunks) / limit
    indices = sorted({int(i * step) for i in range(limit)})
    return [chunks[i] for i in indices]


def summarize_chunks(chunks: List[LCDocument]) -> Dict[str, Any]:
    """Hierarchical map-reduce summary: chunks -> mini-summaries -> final
    summary + key points + topics. Raises on failure (caller marks
    summary_status="failed" without touching document usability).
    """

    if not chunks:
        raise ValueError("No text extracted from this document.")

    sampled = _sample_chunks(chunks, MAX_CHUNKS_FOR_SUMMARY)

    mini_summaries = []

    for i in range(0, len(sampled), BATCH_SIZE):

        batch = sampled[i:i + BATCH_SIZE]
        batch_text = "\n\n".join(c.page_content for c in batch)[:4000]

        response = clients.llm.invoke([
            SystemMessage(content=(
                "Summarize the following excerpt from a document in 2-3 "
                "concise sentences. Focus on concrete facts, not filler."
            )),
            HumanMessage(content=batch_text)
        ])

        mini_summaries.append(response.content.strip())

    combined = "\n".join(f"- {s}" for s in mini_summaries)[:6000]

    reduce_prompt = f"""
You are summarizing a document from partial section summaries below.

Return ONLY valid JSON (no markdown fences, no extra text) with this
exact shape:

{{
  "summary": "3-5 sentence overall summary",
  "key_points": ["short point", "short point", "..."],
  "topics": ["topic", "topic", "..."]
}}

Provide at most 6 key_points and at most 6 topics.

Section summaries:
{combined}
"""

    response = clients.llm.invoke([HumanMessage(content=reduce_prompt)])
    raw = response.content.strip()
    raw = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()

    try:
        parsed = json.loads(raw)
    except Exception:
        return {
            "summary": raw[:2000] if raw else " ".join(mini_summaries)[:2000],
            "key_points": [],
            "topics": [],
        }

    return {
        "summary": str(parsed.get("summary", "")).strip(),
        "key_points": [str(p) for p in parsed.get("key_points", [])][:6],
        "topics": [str(t) for t in parsed.get("topics", [])][:6],
    }


# ========================================
# Ask Question (generation; retrieval delegated to retrieval.pipeline)
# ========================================

SYSTEM_PROMPT_TEMPLATE = """
You are PaperChat, a helpful document
question-answering assistant.

Answer the user's question using ONLY
the retrieved document context provided below.
If prior conversation turns are provided, use them
only to understand what the user is referring to
(e.g. pronouns like "it" or "that") -- never as a
source of facts not present in the retrieved context.

Rules:

1. Use the retrieved context as your primary
   and only source of information.

2. Do not invent or hallucinate information.

3. If the answer is present in the context,
   answer clearly and directly.

4. Cite the page a fact came from inline using
   the exact format [Page N], e.g. "Revenue grew
   12% [Page 4]." Use the page numbers shown in
   the retrieved context below.

5. If the answer cannot be found in the
   provided context, respond with:

   "I couldn't find this information in
   the uploaded document."

6. Do not use outside knowledge to fill
   missing information.

7. Keep answers concise but sufficiently
   detailed.

8. Use Markdown formatting when it improves
   readability.

Retrieved document context:

{context}
"""


def ask_question(
    question: str,
    document_ids: Optional[List[str]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Returns {"answer", "sources", "rewritten_query",
    "retrieval_latency_ms", "generation_latency_ms", "total_latency_ms",
    "stage_meta"}.

    `history` is an already-trimmed list of {"role": "user"|"assistant",
    "content": str} turns (caller is responsible for windowing).
    """

    total_start = time.perf_counter()

    retrieval_result = retrieve_pipeline(question, document_ids, history)

    if not retrieval_result["sources"]:
        return {
            "answer": "I couldn't find enough evidence in the selected documents to answer this reliably.",
            "sources": [],
            "low_evidence": True,
            "rewritten_query": retrieval_result["rewritten_query"],
            "retrieval_latency_ms": retrieval_result["retrieval_latency_ms"],
            "generation_latency_ms": 0.0,
            "total_latency_ms": round((time.perf_counter() - total_start) * 1000, 1),
            "stage_meta": retrieval_result["stage_meta"],
        }

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context=retrieval_result["context"])

    messages = [SystemMessage(content=system_prompt)]

    for turn in (history or []):
        if turn.get("role") == "user":
            messages.append(HumanMessage(content=turn["content"]))
        elif turn.get("role") == "assistant":
            messages.append(AIMessage(content=turn["content"]))

    messages.append(HumanMessage(content=question))

    gen_start = time.perf_counter()
    response = clients.llm.invoke(messages)
    generation_latency_ms = round((time.perf_counter() - gen_start) * 1000, 1)

    return {
        "answer": response.content,
        "sources": retrieval_result["sources"],
        "low_evidence": False,
        "rewritten_query": retrieval_result["rewritten_query"],
        "retrieval_latency_ms": retrieval_result["retrieval_latency_ms"],
        "generation_latency_ms": generation_latency_ms,
        "total_latency_ms": round((time.perf_counter() - total_start) * 1000, 1),
        "stage_meta": retrieval_result["stage_meta"],
    }


def ask_question_stream(
    question: str,
    document_ids: Optional[List[str]] = None,
    history: Optional[List[Dict[str, str]]] = None,
):
    """Generator version of ask_question. Retrieval is identical (same
    retrieve_pipeline() call, same grounded system prompt) -- only the
    generation call differs (clients.llm.stream instead of .invoke).

    Yields dicts:
      {"type": "sources", "sources": [...], "low_evidence": bool}
      {"type": "chunk", "text": str}                      (repeated)
      {"type": "done", "answer": str, "sources": [...], "low_evidence": bool,
       "retrieval_latency_ms":..., "generation_latency_ms":..., "total_latency_ms":...}
      {"type": "error", "message": str}                   (on failure)
    """

    total_start = time.perf_counter()

    try:
        retrieval_result = retrieve_pipeline(question, document_ids, history)
    except Exception as error:
        yield {"type": "error", "message": "Retrieval failed."}
        return

    if not retrieval_result["sources"]:
        answer = "I couldn't find enough evidence in the selected documents to answer this reliably."
        yield {"type": "sources", "sources": [], "low_evidence": True}
        yield {"type": "chunk", "text": answer}
        yield {
            "type": "done",
            "answer": answer,
            "sources": [],
            "low_evidence": True,
            "retrieval_latency_ms": retrieval_result["retrieval_latency_ms"],
            "generation_latency_ms": 0.0,
            "total_latency_ms": round((time.perf_counter() - total_start) * 1000, 1),
        }
        return

    yield {"type": "sources", "sources": retrieval_result["sources"], "low_evidence": False}

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context=retrieval_result["context"])
    messages = [SystemMessage(content=system_prompt)]

    for turn in (history or []):
        if turn.get("role") == "user":
            messages.append(HumanMessage(content=turn["content"]))
        elif turn.get("role") == "assistant":
            messages.append(AIMessage(content=turn["content"]))

    messages.append(HumanMessage(content=question))

    gen_start = time.perf_counter()
    full_text = ""

    try:
        for chunk in clients.llm.stream(messages):
            piece = getattr(chunk, "content", "") or ""
            if piece:
                full_text += piece
                yield {"type": "chunk", "text": piece}
    except Exception as error:
        logger.error("streaming generation failed: %s", error)
        yield {"type": "error", "message": "Generation failed."}
        return

    generation_latency_ms = round((time.perf_counter() - gen_start) * 1000, 1)

    yield {
        "type": "done",
        "answer": full_text,
        "sources": retrieval_result["sources"],
        "low_evidence": False,
        "retrieval_latency_ms": retrieval_result["retrieval_latency_ms"],
        "generation_latency_ms": generation_latency_ms,
        "total_latency_ms": round((time.perf_counter() - total_start) * 1000, 1),
    }

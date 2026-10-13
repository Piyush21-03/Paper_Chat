"""Research-intelligence generation logic (comparison, synthesis, gap
analysis, structured metadata extraction, follow-up suggestions).

Retrieval always goes through retrieval.pipeline.retrieve() -- the same
dense+BM25+RRF+rerank+context-control pipeline /ask uses. This module
only adds generation prompts on top of that evidence; it never invents
a second retrieval path and never dumps whole documents into Gemini.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from retrieval import clients
from retrieval.pipeline import retrieve as pipeline_retrieve
from logging_config import get_logger

logger = get_logger("research")

ASPECTS = ["Objective", "Methodology", "Dataset", "Results", "Limitations", "Conclusion"]

ASPECT_QUERIES = {
    "Objective": "What is the objective, aim, or purpose of this work?",
    "Methodology": "What methodology, approach, or method was used?",
    "Dataset": "What dataset, data source, or materials were used?",
    "Results": "What were the main results or findings?",
    "Limitations": "What limitations does this work acknowledge?",
    "Conclusion": "What conclusion does this work reach?",
}

GAP_QUERIES = [
    "What limitations does this study acknowledge?",
    "What future work or future research directions are suggested?",
    "What unresolved problems or open challenges are mentioned?",
    "What research gap does this work identify?",
]


def _strip_json_fences(raw: str) -> str:
    return re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()


def _safe_json(raw: str) -> Optional[dict]:
    try:
        return json.loads(_strip_json_fences(raw))
    except Exception:
        return None


def _evidence_per_document(
    query: str,
    document_ids: List[str],
    k_note: str = "",
) -> Dict[str, Dict[str, Any]]:
    """Runs the real retrieval pipeline once per document (guarantees
    every selected document gets a chance to contribute evidence,
    rather than one pooled query where a single document could crowd
    out the others). Returns {document_id: {"context":..., "sources":...}}.
    """

    evidence = {}
    for document_id in document_ids:
        result = pipeline_retrieve(query, document_ids=[document_id], history=None)
        evidence[document_id] = result
    return evidence


def _filenames(document_ids: List[str], db) -> Dict[str, str]:
    from models import Document
    rows = db.query(Document).filter(Document.id.in_(document_ids)).all()
    return {r.id: r.original_filename for r in rows}


# ========================================
# Comparison
# ========================================

def compare_documents(document_ids: List[str], db) -> Dict[str, Any]:

    names = _filenames(document_ids, db)

    # Gather grounded evidence per (document, aspect) -- retrieval only,
    # no generation yet.
    evidence_blocks = []
    all_sources = []

    for aspect in ASPECTS:
        per_doc = _evidence_per_document(ASPECT_QUERIES[aspect], document_ids)
        for doc_id, result in per_doc.items():
            if not result["sources"]:
                continue
            evidence_blocks.append(
                f"### {aspect} — {names.get(doc_id, doc_id)}\n{result['context'][:1500]}"
            )
            for s in result["sources"]:
                all_sources.append({**s, "filename": names.get(doc_id, doc_id)})

    if not evidence_blocks:
        return {
            "comparison_markdown": "Not found in the provided documents.",
            "low_evidence": True,
            "sources": [],
        }

    evidence_text = "\n\n".join(evidence_blocks)[:14000]
    doc_list = ", ".join(names.get(d, d) for d in document_ids)

    prompt = f"""You are comparing {len(document_ids)} research documents:
{doc_list}

Using ONLY the retrieved evidence below, produce a Markdown comparison
table with rows: Objective, Methodology, Dataset, Results, Limitations,
Conclusion, and one column per document.

Rules:
- Use ONLY the evidence given. Never invent facts.
- If evidence for a cell is missing, write "Not found in the provided documents."
- Keep each cell concise (1-3 sentences).
- Do not fabricate citations; the evidence below is already retrieved.

Evidence:
{evidence_text}
"""

    response = clients.llm.invoke([HumanMessage(content=prompt)])

    return {
        "comparison_markdown": response.content,
        "low_evidence": False,
        "sources": all_sources,
    }


# ========================================
# Synthesis
# ========================================

def synthesize(question: str, document_ids: List[str], db) -> Dict[str, Any]:

    names = _filenames(document_ids, db)
    per_doc = _evidence_per_document(question, document_ids)

    grouped = []
    all_sources = []

    for doc_id, result in per_doc.items():
        if not result["sources"]:
            continue
        grouped.append(f"### {names.get(doc_id, doc_id)}\n{result['context'][:2000]}")
        for s in result["sources"]:
            all_sources.append({**s, "filename": names.get(doc_id, doc_id)})

    if not grouped:
        return {
            "answer": "I couldn't find enough evidence in the selected documents to answer this reliably.",
            "low_evidence": True,
            "sources": [],
        }

    evidence_text = "\n\n".join(grouped)[:14000]

    prompt = f"""You are synthesizing findings across multiple research
documents to answer a research question.

Question: {question}

Using ONLY the evidence below (grouped by document), write a grounded
synthesis. Rules:

1. Cite the source document by name and page (format: [DocName, Page N])
   for every specific claim.
2. Explicitly note where documents agree and where they differ.
3. If you are inferring something by comparing documents rather than
   reading it directly, say so explicitly, e.g. "Based on a comparison
   of the provided documents, ..."
4. If the evidence is insufficient to answer, say so plainly instead of
   guessing.
5. Never invent facts not present in the evidence.

Evidence by document:
{evidence_text}
"""

    response = clients.llm.invoke([HumanMessage(content=prompt)])

    return {
        "answer": response.content,
        "low_evidence": False,
        "sources": all_sources,
    }


# ========================================
# Research Gap Detection
# ========================================

def detect_gaps(document_ids: List[str], db) -> Dict[str, Any]:

    names = _filenames(document_ids, db)

    evidence_blocks = []
    all_sources = []

    for query in GAP_QUERIES:
        per_doc = _evidence_per_document(query, document_ids)
        for doc_id, result in per_doc.items():
            if not result["sources"]:
                continue
            evidence_blocks.append(f"### {names.get(doc_id, doc_id)} (re: \"{query}\")\n{result['context'][:1200]}")
            for s in result["sources"]:
                all_sources.append({**s, "filename": names.get(doc_id, doc_id)})

    if not evidence_blocks:
        return {"explicit_gaps": [], "inferred_gaps": [], "low_evidence": True, "sources": []}

    evidence_text = "\n\n".join(evidence_blocks)[:14000]
    doc_list = ", ".join(names.get(d, d) for d in document_ids)

    prompt = f"""You are analyzing research gaps across these documents:
{doc_list}

Using ONLY the evidence below, return JSON with EXACTLY this shape (no
markdown fences, no extra text):

{{
  "explicit_gaps": [
    {{"document": "filename", "gap": "gap/limitation as explicitly stated in the paper", "page": <page number or null>}}
  ],
  "inferred_gaps": [
    {{"gap": "a gap you infer only by comparing the documents", "based_on": ["filename1", "filename2"], "reasoning": "one sentence"}}
  ]
}}

Critical rules:
- "explicit_gaps" = ONLY gaps/limitations the papers themselves state directly. Cite the specific document and page.
- "inferred_gaps" = ONLY gaps you deduce by comparing multiple documents (contradictions, unexplored combinations, etc). These are your analysis, not stated facts -- label them as such via the "reasoning" field.
- Never present an inferred gap as if the paper stated it.
- If there is nothing to report in a category, return an empty list for it.

Evidence:
{evidence_text}
"""

    response = clients.llm.invoke([HumanMessage(content=prompt)])
    parsed = _safe_json(response.content)

    if parsed is None:
        return {
            "explicit_gaps": [],
            "inferred_gaps": [],
            "low_evidence": False,
            "sources": all_sources,
            "raw": response.content[:2000],
        }

    return {
        "explicit_gaps": parsed.get("explicit_gaps", []),
        "inferred_gaps": parsed.get("inferred_gaps", []),
        "low_evidence": False,
        "sources": all_sources,
    }


# ========================================
# Structured Research Metadata Extraction
# ========================================

MAX_CHUNKS_FOR_METADATA = 30


def extract_research_metadata(chunks) -> Dict[str, Any]:
    """chunks: list of langchain Documents from rag.load_and_chunk (no
    embedding needed -- this never touches Qdrant)."""

    if not chunks:
        raise ValueError("No text extracted from this document.")

    # Bias toward the beginning of the document (title/authors/abstract
    # usually live there) while still sampling later chunks for
    # findings/limitations/future work.
    head = chunks[:8]
    rest = chunks[8:]
    step = max(1, len(rest) // max(1, MAX_CHUNKS_FOR_METADATA - len(head)))
    sampled = head + rest[::step][: max(0, MAX_CHUNKS_FOR_METADATA - len(head))]

    text = "\n\n".join(c.page_content for c in sampled)[:16000]

    prompt = f"""Extract structured research information from the
document excerpt below. Return ONLY valid JSON (no markdown fences) in
exactly this shape:

{{
  "title": "...",
  "authors": ["..."],
  "publication_year": "...",
  "abstract": "...",
  "objective": "...",
  "methodology": "...",
  "dataset": "...",
  "key_findings": ["..."],
  "limitations": ["..."],
  "future_work": "...",
  "keywords": ["..."]
}}

CRITICAL RULES:
- This document may NOT be an academic paper. Do not assume it is.
- If a field cannot be confidently determined from the text, use the
  exact string "Not found" (for single values) or "Not clearly stated"
  (when something is partially implied but not explicit).
- NEVER invent authors, dates, datasets, or findings not present in the text.
- authors/key_findings/limitations/keywords must be JSON arrays (use [] if none found).

Document excerpt:
{text}
"""

    response = clients.llm.invoke([HumanMessage(content=prompt)])
    parsed = _safe_json(response.content)

    if parsed is None:
        raise ValueError("Could not parse structured metadata from the model response.")

    def _list(v):
        return v if isinstance(v, list) else ([] if v is None else [str(v)])

    return {
        "title": parsed.get("title") or "Not found",
        "authors": _list(parsed.get("authors")),
        "publication_year": parsed.get("publication_year") or "Not found",
        "abstract": parsed.get("abstract") or "Not found",
        "objective": parsed.get("objective") or "Not found",
        "methodology": parsed.get("methodology") or "Not found",
        "dataset": parsed.get("dataset") or "Not found",
        "key_findings": _list(parsed.get("key_findings")),
        "limitations": _list(parsed.get("limitations")),
        "future_work": parsed.get("future_work") or "Not found",
        "keywords": _list(parsed.get("keywords")),
    }


# ========================================
# Follow-up Question Suggestions
# ========================================

def generate_follow_up_questions(
    question: str,
    answer: str,
    sources: List[Dict[str, Any]],
) -> List[str]:
    """One small, best-effort Gemini call. Never blocks the main answer
    -- caller should catch exceptions and fall back to an empty list."""

    if not sources:
        return []

    snippet_text = "\n".join(f"- {s.get('snippet', '')[:200]}" for s in sources[:5])

    prompt = f"""Based on this question, answer, and retrieved evidence,
suggest 3 to 5 specific, useful follow-up questions a researcher might
ask next. Base them on the actual content below -- do not write generic
questions unrelated to this material.

Return ONLY a JSON array of strings, no markdown fences, e.g.:
["question 1", "question 2", "question 3"]

Question: {question}

Answer: {answer[:1000]}

Evidence snippets:
{snippet_text}
"""

    try:
        response = clients.llm.invoke([HumanMessage(content=prompt)])
        parsed = _safe_json(response.content)
        if isinstance(parsed, list):
            return [str(q) for q in parsed if str(q).strip()][:5]
    except Exception as error:
        logger.warning("follow-up question generation failed: %s", error)

    return []

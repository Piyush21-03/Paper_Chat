"""Evaluation metrics.

Retrieval precision/recall are computed exactly from retrieved sources
vs. dataset ground truth. Answer relevance and faithfulness are LLM-
judge scores -- explicitly labeled as such, never presented as exact
measurements, and computed with a single combined Gemini call per
question (not two) to keep judge-call volume controlled.
"""

import json
import re
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from retrieval import clients
from logging_config import get_logger

logger = get_logger("eval.metrics")


def retrieval_precision_recall(
    retrieved_sources: List[Dict[str, Any]],
    relevant_document_id: Optional[str],
    relevant_pages: Optional[List[int]],
):
    """Returns (precision, recall) in [0, 1], or (None, None) when no
    ground-truth relevant pages are specified for this case (exact
    metrics require ground truth -- we don't fabricate them)."""

    if not relevant_pages:
        return None, None

    relevant_set = {int(p) for p in relevant_pages}

    retrieved_pages = set()
    for s in retrieved_sources:
        if relevant_document_id and s.get("document_id") != relevant_document_id:
            continue
        try:
            retrieved_pages.add(int(s.get("page_number")))
        except (TypeError, ValueError):
            continue

    if not retrieved_sources:
        return 0.0, 0.0

    hits = retrieved_pages & relevant_set

    precision = len(hits) / len(retrieved_pages) if retrieved_pages else 0.0
    recall = len(hits) / len(relevant_set) if relevant_set else None

    return round(precision, 4), (round(recall, 4) if recall is not None else None)


JUDGE_PROMPT = """You are grading a RAG (retrieval-augmented generation)
system's answer. Score two things on a 0.0-1.0 scale:

- "relevance": does the generated answer actually address the question?
- "faithfulness": is the generated answer fully supported by the
  retrieved context below (no unsupported/hallucinated claims)? If a
  reference answer is given, also consider whether the generated answer
  is consistent with it.

Return ONLY valid JSON, no markdown fences, in this exact shape:
{{"relevance": 0.0, "faithfulness": 0.0, "reasoning": "one sentence"}}

Question: {question}

Reference answer (may be absent): {expected_answer}

Retrieved context:
{context}

Generated answer:
{generated_answer}
"""


def judge_answer(
    question: str,
    expected_answer: Optional[str],
    generated_answer: str,
    context: str,
) -> Optional[Dict[str, Any]]:
    """Single Gemini call producing both relevance and faithfulness.
    Returns None (metric simply omitted) if the judge call fails --
    never a fabricated score."""

    prompt = JUDGE_PROMPT.format(
        question=question,
        expected_answer=expected_answer or "(none provided)",
        context=context[:6000],
        generated_answer=generated_answer,
    )

    try:
        response = clients.llm.invoke([HumanMessage(content=prompt)])
        raw = re.sub(r"^```(json)?|```$", "", response.content.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(raw)

        return {
            "answer_relevance": max(0.0, min(1.0, float(parsed.get("relevance", 0.0)))),
            "faithfulness": max(0.0, min(1.0, float(parsed.get("faithfulness", 0.0)))),
            "reasoning": str(parsed.get("reasoning", ""))[:500],
        }
    except Exception as error:
        logger.warning("judge scoring failed, metric omitted (not fabricated): %s", error)
        return None


def classify_pass(answer_relevance: Optional[float], faithfulness: Optional[float]) -> Optional[str]:

    if answer_relevance is None or faithfulness is None:
        return None

    combined = (answer_relevance + faithfulness) / 2

    if combined >= 0.75:
        return "pass"
    if combined >= 0.5:
        return "weak"
    return "fail"

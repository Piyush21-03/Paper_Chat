"""Evaluation runner: exercises the REAL production RAG pipeline
(rag.ask_question -> retrieval.pipeline.retrieve -> Gemini) for every
dataset question, then scores and stores the results. Never uses a
separate/mock retrieval path.
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

import rag
from eval import metrics
from models import EvalCase, EvalResult, EvalRun
from logging_config import get_logger

logger = get_logger("eval.runner")

DATASET_PATH = Path(__file__).resolve().parent / "dataset.json"


def load_dataset(path: Optional[Path] = None) -> List[Dict[str, Any]]:
    with open(path or DATASET_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("cases", [])


def ensure_seeded(db: Session) -> None:
    """One-time seed of eval_cases from dataset.json, so the DB-managed
    dataset (Phase 4) starts non-empty. No-op once cases exist -- editing
    or adding cases afterward happens via the /api/eval/cases API."""

    if db.query(EvalCase).count() > 0:
        return

    try:
        cases = load_dataset()
    except FileNotFoundError:
        return

    for case in cases:
        db.add(EvalCase(
            question=case["question"],
            expected_answer=case.get("expected_answer"),
            document_id=case.get("document_id"),
            relevant_pages=case.get("relevant_pages"),
            note=case.get("note"),
        ))

    db.commit()
    logger.info("seeded %d eval cases from dataset.json", len(cases))


def _pct(value: Optional[float]) -> Optional[int]:
    return None if value is None else round(value * 100)


def _avg(values: List[Optional[int]]) -> Optional[int]:
    present = [v for v in values if v is not None]
    return round(sum(present) / len(present)) if present else None


def run_evaluation(db: Session, user_id: Optional[str] = None, owned_document_ids: Optional[set] = None) -> EvalRun:

    ensure_seeded(db)

    db_cases = db.query(EvalCase).order_by(EvalCase.created_at.asc()).all()

    cases = []
    for c in db_cases:
        # SECURITY: a case scoped to a specific document must never be
        # run against another user's document/vectors -- skip it for
        # this run if the caller doesn't own that document.
        if c.document_id and owned_document_ids is not None and c.document_id not in owned_document_ids:
            continue
        cases.append({
            "question": c.question,
            "expected_answer": c.expected_answer,
            "document_id": c.document_id,
            "relevant_pages": c.relevant_pages,
        })

    run_start = time.perf_counter()

    run = EvalRun(user_id=user_id, num_questions=len(cases), duration_ms=0)
    db.add(run)
    db.flush()  # obtain run.id without committing yet

    precisions, recalls, relevances, faithfulnesses = [], [], [], []
    retrieval_lat, generation_lat, total_lat = [], [], []

    for case in cases:

        question = case["question"]
        expected_answer = case.get("expected_answer")
        relevant_document_id = case.get("document_id")
        relevant_pages = case.get("relevant_pages")
        document_ids = [relevant_document_id] if relevant_document_id else None

        try:
            result = rag.ask_question(question, document_ids, history=None)
        except Exception as error:
            logger.error("eval case failed question=%r error=%s", question, error)
            result = {
                "answer": f"[evaluation error: {error}]",
                "sources": [],
                "retrieval_latency_ms": None,
                "generation_latency_ms": None,
                "total_latency_ms": None,
            }

        precision, recall = metrics.retrieval_precision_recall(
            result["sources"], relevant_document_id, relevant_pages
        )

        judge = None
        if not str(result["answer"]).startswith("[evaluation error"):
            judge = metrics.judge_answer(
                question, expected_answer, result["answer"],
                "\n".join(s.get("snippet", "") for s in result["sources"]),
            )

        answer_relevance = judge["answer_relevance"] if judge else None
        faithfulness = judge["faithfulness"] if judge else None

        eval_result = EvalResult(
            run_id=run.id,
            question=question,
            expected_answer=expected_answer,
            generated_answer=result["answer"],
            retrieved_sources=result["sources"],
            retrieval_precision=_pct(precision),
            retrieval_recall=_pct(recall),
            answer_relevance=_pct(answer_relevance),
            faithfulness=_pct(faithfulness),
            judge_reasoning=judge["reasoning"] if judge else None,
            retrieval_latency_ms=(
                round(result["retrieval_latency_ms"]) if result.get("retrieval_latency_ms") is not None else None
            ),
            generation_latency_ms=(
                round(result["generation_latency_ms"]) if result.get("generation_latency_ms") is not None else None
            ),
            total_latency_ms=(
                round(result["total_latency_ms"]) if result.get("total_latency_ms") is not None else None
            ),
            passed=metrics.classify_pass(answer_relevance, faithfulness),
        )
        db.add(eval_result)

        precisions.append(_pct(precision))
        recalls.append(_pct(recall))
        relevances.append(_pct(answer_relevance))
        faithfulnesses.append(_pct(faithfulness))
        retrieval_lat.append(eval_result.retrieval_latency_ms)
        generation_lat.append(eval_result.generation_latency_ms)
        total_lat.append(eval_result.total_latency_ms)

    run.duration_ms = round((time.perf_counter() - run_start) * 1000)
    run.avg_retrieval_precision = _avg(precisions)
    run.avg_retrieval_recall = _avg(recalls)
    run.avg_answer_relevance = _avg(relevances)
    run.avg_faithfulness = _avg(faithfulnesses)
    run.avg_retrieval_latency_ms = _avg(retrieval_lat)
    run.avg_generation_latency_ms = _avg(generation_lat)
    run.avg_total_latency_ms = _avg(total_lat)

    db.commit()
    db.refresh(run)

    logger.info(
        "eval run complete run_id=%s questions=%d duration_ms=%d relevance=%s faithfulness=%s",
        run.id, run.num_questions, run.duration_ms, run.avg_answer_relevance, run.avg_faithfulness,
    )

    return run

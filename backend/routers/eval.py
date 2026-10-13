from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import Document, EvalCase, EvalResult, EvalRun, User
from schemas import EvalCaseCreate, EvalCaseOut, EvalCaseUpdate
from eval.runner import run_evaluation, ensure_seeded
from logging_config import get_logger

logger = get_logger("eval_router")

router = APIRouter(prefix="/api/eval", tags=["eval"])


def _run_summary(run: EvalRun) -> dict:
    return {
        "id": run.id,
        "created_at": run.created_at,
        "num_questions": run.num_questions,
        "duration_ms": run.duration_ms,
        "metrics": {
            "retrieval_precision": run.avg_retrieval_precision,
            "retrieval_recall": run.avg_retrieval_recall,
            "answer_relevance": run.avg_answer_relevance,
            "faithfulness": run.avg_faithfulness,
            "retrieval_latency_ms": run.avg_retrieval_latency_ms,
            "generation_latency_ms": run.avg_generation_latency_ms,
            "total_latency_ms": run.avg_total_latency_ms,
        },
    }


def _result_detail(result: EvalResult) -> dict:
    return {
        "id": result.id,
        "question": result.question,
        "expected_answer": result.expected_answer,
        "generated_answer": result.generated_answer,
        "retrieved_sources": result.retrieved_sources,
        "retrieval_precision": result.retrieval_precision,
        "retrieval_recall": result.retrieval_recall,
        "answer_relevance": result.answer_relevance,
        "faithfulness": result.faithfulness,
        "judge_reasoning": result.judge_reasoning,
        "retrieval_latency_ms": result.retrieval_latency_ms,
        "generation_latency_ms": result.generation_latency_ms,
        "total_latency_ms": result.total_latency_ms,
        "passed": result.passed,
    }


@router.post("/run")
def trigger_eval_run(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Runs the full evaluation dataset through the real production RAG
    pipeline. Only runs when explicitly requested (never automatically)."""

    owned_document_ids = {
        row.id for row in db.query(Document.id).filter(Document.user_id == current_user.id).all()
    }

    try:
        run = run_evaluation(db, user_id=current_user.id, owned_document_ids=owned_document_ids)
    except FileNotFoundError:
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "eval/dataset.json not found."},
        )
    except Exception as error:
        logger.error("eval run failed: %s", error)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Evaluation run failed: {error}"},
        )

    return {"success": True, "run": _run_summary(run)}


@router.get("/runs")
def list_runs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    runs = db.query(EvalRun).filter(EvalRun.user_id == current_user.id).order_by(EvalRun.created_at.desc()).all()
    return {"success": True, "runs": [_run_summary(r) for r in runs]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    run = db.get(EvalRun, run_id)

    if run is None or run.user_id != current_user.id:
        return JSONResponse(status_code=404, content={"success": False, "message": "Run not found."})

    results = (
        db.query(EvalResult)
        .filter(EvalResult.run_id == run_id)
        .order_by(EvalResult.created_at.asc())
        .all()
    )

    summary = _run_summary(run)
    summary["results"] = [_result_detail(r) for r in results]

    return {"success": True, "run": summary}


@router.get("/compare")
def compare_runs(run_a: str, run_b: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    a = db.get(EvalRun, run_a)
    b = db.get(EvalRun, run_b)

    if a is None or b is None or a.user_id != current_user.id or b.user_id != current_user.id:
        return JSONResponse(status_code=404, content={"success": False, "message": "One or both runs not found."})

    def diff(key):
        va, vb = getattr(a, key), getattr(b, key)
        delta = (vb - va) if (va is not None and vb is not None) else None
        return {"from": va, "to": vb, "delta": delta}

    return {
        "success": True,
        "run_a": _run_summary(a),
        "run_b": _run_summary(b),
        "diff": {
            "retrieval_precision": diff("avg_retrieval_precision"),
            "retrieval_recall": diff("avg_retrieval_recall"),
            "answer_relevance": diff("avg_answer_relevance"),
            "faithfulness": diff("avg_faithfulness"),
            "retrieval_latency_ms": diff("avg_retrieval_latency_ms"),
            "generation_latency_ms": diff("avg_generation_latency_ms"),
            "total_latency_ms": diff("avg_total_latency_ms"),
        },
    }


# ========================================
# Dataset management (Phase 4): user-editable eval cases.
# Reference answers are entered by the user, never auto-generated.
# ========================================

@router.get("/cases")
def list_cases(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ensure_seeded(db)
    cases = db.query(EvalCase).order_by(EvalCase.created_at.asc()).all()
    return {"success": True, "cases": [EvalCaseOut.model_validate(c) for c in cases]}


@router.post("/cases")
def create_case(payload: EvalCaseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = EvalCase(**payload.model_dump())
    db.add(case)
    db.commit()
    db.refresh(case)
    return {"success": True, "case": EvalCaseOut.model_validate(case)}


@router.put("/cases/{case_id}")
def update_case(case_id: str, payload: EvalCaseUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    case = db.get(EvalCase, case_id)
    if case is None:
        return JSONResponse(status_code=404, content={"success": False, "message": "Case not found."})

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(case, field, value)

    db.commit()
    db.refresh(case)
    return {"success": True, "case": EvalCaseOut.model_validate(case)}


@router.delete("/cases/{case_id}")
def delete_case(case_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    case = db.get(EvalCase, case_id)
    if case is None:
        return JSONResponse(status_code=404, content={"success": False, "message": "Case not found."})

    db.delete(case)
    db.commit()
    return {"success": True, "message": "Case deleted."}

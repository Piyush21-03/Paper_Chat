"""Background processing for uploaded documents.

Currently invoked via FastAPI's BackgroundTasks. The function below is
intentionally self-contained (opens its own DB session, takes only plain
arguments) so it can later be handed to Celery/RQ with minimal changes --
just swap the caller (`background_tasks.add_task(...)`) for
`process_document_task.delay(...)` or similar.

Pipeline: load+chunk -> embed (document becomes usable for chat as soon
as this succeeds) -> summarize (best-effort) -> extract tables
(best-effort). Summary/table failures are recorded separately and never
revert the document's main `status`, so chat keeps working even if one
of those steps fails.
"""

from pathlib import Path
import threading
import time

from db import SessionLocal
from models import Document, ExtractedTable
from logging_config import get_logger
import rag
import tables as tables_module

logger = get_logger("jobs")

# In-process dedup guard: prevents the same document being processed by
# two overlapping background tasks (e.g. a double-click retry, or a
# retry request arriving while the original upload's job is still
# running). Per-process only -- with the "rq" backend, RQ's own job
# tracking additionally prevents duplicate enqueues at the queue level.
_processing_ids = set()
_processing_lock = threading.Lock()


# Human-readable failure messages keyed by the stage that was running.
# Raw exception text never reaches the client (it stays in the logs).
_STAGE_ERROR_MESSAGES = {
    "extracting_text": "We couldn't read text from this PDF. It may be scanned, encrypted, or corrupted.",
    "chunking": "We couldn't split this document into searchable sections.",
    "embedding": "The embedding step failed. Please retry in a moment.",
    "indexing": "We couldn't save this document to the search index. Please retry.",
}
_DEFAULT_ERROR_MESSAGE = "Processing failed. Please retry."


def is_processing(document_id: str) -> bool:
    with _processing_lock:
        return document_id in _processing_ids


def process_document(document_id: str, file_path: Path) -> None:

    with _processing_lock:
        if document_id in _processing_ids:
            logger.info("skipping duplicate processing request document_id=%s", document_id)
            return
        _processing_ids.add(document_id)

    db = SessionLocal()

    try:

        document = db.get(Document, document_id)

        if document is None:
            return

        document.status = "processing"
        db.commit()
        logger.info("processing started document_id=%s", document_id)
        stage_start = time.perf_counter()

        # ---- Load + chunk once, reused for embedding and summarization ----

        def set_stage(name):
            document.processing_stage = name
            db.commit()

        try:
            chunks, page_count = rag.load_and_chunk(file_path, document_id, on_stage=set_stage)
            chunk_count = rag.embed_chunks(chunks, on_stage=set_stage)
        except Exception as error:
            failed_stage = document.processing_stage
            logger.error("indexing failed document_id=%s stage=%s error=%s", document_id, failed_stage, error)
            document.status = "failed"
            document.failed_stage = failed_stage
            document.processing_stage = None
            document.error_message = _STAGE_ERROR_MESSAGES.get(failed_stage, _DEFAULT_ERROR_MESSAGE)
            db.commit()
            return

        logger.info(
            "indexing complete document_id=%s chunks=%d pages=%d elapsed_ms=%.0f",
            document_id, chunk_count, page_count, (time.perf_counter() - stage_start) * 1000,
        )
        document.status = "ready"
        document.chunk_count = chunk_count
        document.page_count = page_count
        document.error_message = None
        document.failed_stage = None
        document.processing_stage = "summarizing"
        db.commit()

        # ---- Summary (best-effort; failure doesn't block chat) ----

        try:
            summary = rag.summarize_chunks(chunks)
            document.summary_status = "ready"
            document.summary_text = summary["summary"]
            document.summary_key_points = summary["key_points"]
            document.summary_topics = summary["topics"]
            document.summary_error = None
        except Exception as error:
            logger.warning("summary generation failed document_id=%s error=%s", document_id, error)
            document.summary_status = "failed"
            document.summary_error = str(error)

        document.processing_stage = "extracting_tables"
        db.commit()

        # ---- Table extraction (best-effort; failure doesn't block chat) ----

        try:
            extracted = tables_module.extract_tables(file_path, document_id)

            for table in extracted:
                db.add(ExtractedTable(
                    document_id=document_id,
                    page_number=table["page_number"],
                    row_count=table["row_count"],
                    col_count=table["col_count"],
                    preview=table["preview"],
                    csv_path=str(table["csv_path"]),
                    xlsx_path=str(table["xlsx_path"]) if table["xlsx_path"] else None,
                ))

            document.tables_status = "ready"
            document.table_count = len(extracted)
            document.tables_error = None

        except Exception as error:
            logger.warning("table extraction failed document_id=%s error=%s", document_id, error)
            document.tables_status = "failed"
            document.tables_error = str(error)

        document.processing_stage = None
        db.commit()

        logger.info("processing finished document_id=%s status=%s", document_id, document.status)

    finally:

        db.close()
        with _processing_lock:
            _processing_ids.discard(document_id)

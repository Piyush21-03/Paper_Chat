"""Thin job-service layer isolating the Redis/RQ specifics from the
rest of the app. Defaults to FastAPI's in-process BackgroundTasks
(JOB_BACKEND=inline, the existing Phase 1-4 behavior) so local dev and
tests need nothing extra running. Set JOB_BACKEND=rq + REDIS_URL to
dispatch through Redis Queue instead -- requires a separate
`rq worker paperchat` process consuming the queue (see DEPLOYMENT.md).

If Redis is configured but unreachable, this falls back to inline
processing rather than silently dropping the job.
"""

from pathlib import Path

from config import settings
from logging_config import get_logger

logger = get_logger("job_queue")

_queue = None
_queue_init_attempted = False


def _get_queue():
    global _queue, _queue_init_attempted

    if _queue_init_attempted:
        return _queue

    _queue_init_attempted = True

    if settings.JOB_BACKEND != "rq" or not settings.REDIS_URL:
        return None

    try:
        import redis
        import rq

        connection = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        connection.ping()
        _queue = rq.Queue("paperchat", connection=connection)
        logger.info("job queue backend=rq redis_url=%s", settings.REDIS_URL)
    except Exception as error:
        logger.warning("Redis/RQ unavailable, falling back to inline job execution: %s", error)
        _queue = None

    return _queue


def enqueue_document_processing(background_tasks, document_id: str, file_path: Path) -> None:
    """Dispatches document processing via the configured backend.
    `background_tasks` is a FastAPI BackgroundTasks instance, used for
    the inline fallback path."""

    from jobs import process_document

    queue = _get_queue()

    if queue is not None:
        try:
            queue.enqueue(process_document, document_id, str(file_path))
            logger.info("enqueued via rq document_id=%s", document_id)
            return
        except Exception as error:
            logger.warning("rq enqueue failed, falling back to inline for document_id=%s: %s", document_id, error)

    background_tasks.add_task(process_document, document_id, file_path)

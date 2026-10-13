"""Structured logging setup. Replaces scattered print() calls.

Never log: API keys/secrets, full document/chunk text, full
conversation contents. Log identifiers (document_id, run_id) and
timings/errors instead.
"""

import logging
import sys

_CONFIGURED = False


def configure_logging(level=logging.INFO) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s", "%Y-%m-%d %H:%M:%S"
    ))

    root = logging.getLogger("paperchat")
    root.setLevel(level)
    root.addHandler(handler)
    root.propagate = False

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(f"paperchat.{name}")

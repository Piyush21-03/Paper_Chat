"""Conversation-aware query rewriting for retrieval -- gated so a Gemini
call only happens when the question actually looks like a follow-up
that needs prior context to search well.
"""

import re
from typing import Dict, List, Optional

from langchain_core.messages import HumanMessage

from retrieval import clients
from logging_config import get_logger

logger = get_logger("retrieval.query_rewrite")

_REFERENCE_CUES = re.compile(
    r"\b(it|its|it's|this|that|these|those|they|their|them|"
    r"the (above|previous|prior|same|latter|former)|"
    r"such|so|again|also|too)\b",
    re.IGNORECASE,
)

SHORT_QUESTION_WORDS = 6


def _needs_rewrite(question: str, history: Optional[List[Dict[str, str]]]) -> bool:

    if not history:
        return False

    word_count = len(question.split())

    if _REFERENCE_CUES.search(question):
        return True

    if word_count <= SHORT_QUESTION_WORDS:
        return True

    return False


def maybe_rewrite(question: str, history: Optional[List[Dict[str, str]]]) -> str:
    """Returns a retrieval-friendly standalone query. Falls back to the
    original question, unchanged, whenever rewriting isn't warranted or
    the rewrite call fails."""

    if not _needs_rewrite(question, history):
        return question

    # Keep it cheap: only the last exchange, not the full window.
    recent = history[-2:]
    context_lines = "\n".join(
        f"{turn.get('role', 'user')}: {turn.get('content', '')}" for turn in recent
    )

    prompt = f"""Rewrite the follow-up question as a standalone search
query, using the recent conversation only to resolve references (e.g.
"it", "that"). Return ONLY the rewritten query text, nothing else.

Recent conversation:
{context_lines}

Follow-up question: {question}

Standalone query:"""

    try:
        response = clients.llm.invoke([HumanMessage(content=prompt)])
        rewritten = response.content.strip().strip('"')
        return rewritten if rewritten else question
    except Exception as error:
        logger.warning("query rewrite failed, using original question: %s", error)
        return question

"""Shared low-level clients (embeddings, LLM, Qdrant) used across the
retrieval package and rag.py. Centralized here so retrieval/* modules
never need to import rag.py (avoids circular imports).
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
from qdrant_client import QdrantClient
from qdrant_client import models as qmodels

# Locate root .env explicitly to ensure environment variables are always loaded
_root_env = Path(__file__).resolve().parent.parent.parent / ".env"
_backend_env = Path(__file__).resolve().parent.parent / ".env"
if _root_env.exists():
    load_dotenv(_root_env)
elif _backend_env.exists():
    load_dotenv(_backend_env)
else:
    load_dotenv()

from logging_config import get_logger

logger = get_logger("retrieval.clients")


# ========================================
# Local Embedding Model
# ========================================

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

embedding_model = HuggingFaceEmbeddings(
    model_name=EMBEDDING_MODEL,
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True}
)


# ========================================
# LLM — provider selected by LLM_PROVIDER env var
# Supported: "groq" | "google"
# With automatic cross-provider fallback for resilience
# ========================================

_provider = os.environ.get("LLM_PROVIDER", "google").strip().lower()

_groq_key = os.environ.get("GROQ_API_KEY", "").strip()
_groq_model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
if not _groq_model or "openai" in _groq_model.lower() or "gpt-oss" in _groq_model.lower():
    _groq_model = "llama-3.3-70b-versatile"

_google_key = os.environ.get("GOOGLE_API_KEY", "").strip()

groq_llm = None
google_llm = None

if _groq_key:
    try:
        from langchain_groq import ChatGroq
        groq_llm = ChatGroq(
            model=_groq_model,
            temperature=0,
            groq_api_key=_groq_key,
        )
    except Exception as exc:
        logger.warning("Could not initialize Groq client: %s", exc)

if _google_key:
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        google_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0,
            google_api_key=_google_key,
        )
    except Exception as exc:
        logger.warning("Could not initialize Google Gemini client: %s", exc)

if _provider == "groq":
    if groq_llm is not None and google_llm is not None:
        llm = groq_llm.with_fallbacks([google_llm])
        logger.info("LLM provider: Groq (%s) with Google Gemini fallback", _groq_model)
    elif groq_llm is not None:
        llm = groq_llm
        logger.info("LLM provider: Groq (%s)", _groq_model)
    elif google_llm is not None:
        llm = google_llm
        logger.info("LLM provider: Falling back to Google Gemini (gemini-2.5-flash) - Groq key not available")
    else:
        from langchain_groq import ChatGroq
        llm = ChatGroq(model=_groq_model, temperature=0, groq_api_key=_groq_key)
        logger.warning("No API key configured for Groq or Gemini")
else:
    if google_llm is not None and groq_llm is not None:
        llm = google_llm.with_fallbacks([groq_llm])
        logger.info("LLM provider: Google Gemini (gemini-2.5-flash) with Groq fallback")
    elif google_llm is not None:
        llm = google_llm
        logger.info("LLM provider: Google Gemini (gemini-2.5-flash)")
    elif groq_llm is not None:
        llm = groq_llm
        logger.info("LLM provider: Falling back to Groq (%s) - Google Gemini key not available", _groq_model)
    else:
        from langchain_google_genai import ChatGoogleGenerativeAI
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        logger.warning("No API key configured for Google Gemini or Groq")


# ========================================
# Qdrant
# ========================================

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")

# IMPORTANT:
# This is a NEW collection because the old
# collection was created using OpenAI embeddings.
COLLECTION_NAME = "learning_rag_local"

qdrant_client = QdrantClient(url=QDRANT_URL)

# Bumped whenever the collection's contents change (new document embedded
# or a document's vectors deleted) so cached structures like the BM25
# index know when they're stale. Simple in-process version counter --
# sufficient for a single-process deployment.
INDEX_VERSION = 0


def bump_index_version() -> None:
    global INDEX_VERSION
    INDEX_VERSION += 1


def ensure_document_id_index() -> None:
    """Create a payload index on metadata.document_id so filtering by
    document scales; a no-op if the collection/index already exists."""

    try:
        qdrant_client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="metadata.document_id",
            field_schema=qmodels.PayloadSchemaType.KEYWORD,
        )
    except Exception:
        pass


def delete_document_vectors(document_id: str) -> None:
    """Removes all Qdrant points belonging to a document. Safe to call
    even if the collection or the document has no points."""

    try:
        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="metadata.document_id",
                            match=qmodels.MatchValue(value=document_id),
                        )
                    ]
                )
            ),
        )
    except Exception as error:
        logger.error("qdrant delete error: %s", error)
    finally:
        bump_index_version()


def document_filter(document_ids):
    """Builds a Qdrant Filter restricting to metadata.document_id in
    document_ids, or None if document_ids is falsy (no restriction)."""

    if not document_ids:
        return None

    return qmodels.Filter(
        must=[
            qmodels.FieldCondition(
                key="metadata.document_id",
                match=qmodels.MatchAny(any=document_ids),
            )
        ]
    )

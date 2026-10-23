"""Shared low-level clients (embeddings, LLM, Qdrant) used across the
retrieval package and rag.py. Centralized here so retrieval/* modules
never need to import rag.py (avoids circular imports).
"""

import os

from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
from qdrant_client import QdrantClient
from qdrant_client import models as qmodels

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
# Supported: "groq" (default, free tier) | "google"
# ========================================

_provider = os.environ.get("LLM_PROVIDER", "groq").strip().lower()

if _provider == "groq":
    from langchain_groq import ChatGroq
    _groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    _groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()
    llm = ChatGroq(
        model=_groq_model,
        temperature=0,
        groq_api_key=_groq_key,
    )
    logger.info("LLM provider: Groq (%s)", _groq_model)

else:
    from langchain_google_genai import ChatGoogleGenerativeAI
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
    )
    logger.info("LLM provider: Google Gemini (gemini-2.5-flash)")


# ========================================
# Qdrant
# ========================================

QDRANT_URL = "http://localhost:6333"

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

"""Dense (vector) retrieval via the existing MiniLM + Qdrant setup."""

from typing import Any, Dict, List, Optional

from langchain_qdrant import QdrantVectorStore

from retrieval import clients
from logging_config import get_logger

logger = get_logger("retrieval.dense")


def dense_search(
    query: str,
    document_ids: Optional[List[str]] = None,
    k: int = 20,
) -> List[Dict[str, Any]]:
    """Returns a list of chunk records:
    {chunk_id, document_id, page_number, chunk_index, content, dense_score}

    chunk_id is a stable string ("<document_id>:<chunk_index>") used to
    de-duplicate/match the same chunk across dense and BM25 results.
    """

    vector_db = QdrantVectorStore.from_existing_collection(
        embedding=clients.embedding_model,
        url=clients.QDRANT_URL,
        collection_name=clients.COLLECTION_NAME,
    )

    try:
        results = vector_db.similarity_search_with_score(
            query=query,
            k=k,
            filter=clients.document_filter(document_ids),
        )
    except Exception as error:
        logger.error("dense search error: %s", error)
        return []

    records = []

    for doc, score in results:
        document_id = doc.metadata.get("document_id")
        chunk_index = doc.metadata.get("chunk_index")
        page_number = doc.metadata.get("page_number") or (
            doc.metadata.get("page_label") or doc.metadata.get("page", 0) + 1
        )

        records.append({
            "chunk_id": f"{document_id}:{chunk_index}",
            "document_id": document_id,
            "page_number": page_number,
            "chunk_index": chunk_index,
            "content": doc.page_content,
            "dense_score": float(score),
        })

    return records

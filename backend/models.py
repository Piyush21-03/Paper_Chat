import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, JSON, Index

from db import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(320), nullable=False, unique=True, index=True)
    password_hash = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# Status values: "uploaded" -> "processing" -> "ready" | "failed"
# summary_status / tables_status: "pending" -> "ready" | "failed"
# (independent of the main `status` -- a summary/table failure never
# flips the document back to unusable)
class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    # User-facing name (editable via rename). Never used as a disk path.
    original_filename = Column(String(500), nullable=False)

    # UUID-based name actually used on disk, e.g. "<uuid>.pdf".
    stored_filename = Column(String(300), nullable=False, unique=True)

    file_size_bytes = Column(Integer, nullable=False)

    status = Column(String(20), nullable=False, default="uploaded", index=True)
    error_message = Column(Text, nullable=True)

    # Fine-grained pipeline progress for the UI. `processing_stage` is the
    # stage currently running (None once finished); `failed_stage` is the
    # stage that was running when processing failed.
    processing_stage = Column(String(30), nullable=True)
    failed_stage = Column(String(30), nullable=True)

    page_count = Column(Integer, nullable=True)
    chunk_count = Column(Integer, nullable=True)

    summary_status = Column(String(20), nullable=False, default="pending")
    summary_error = Column(Text, nullable=True)
    summary_text = Column(Text, nullable=True)
    summary_key_points = Column(JSON, nullable=True)  # list[str]
    summary_topics = Column(JSON, nullable=True)  # list[str]

    tables_status = Column(String(20), nullable=False, default="pending")
    tables_error = Column(Text, nullable=True)
    table_count = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String(300), nullable=False, default="New chat")

    # List of document_id strings this conversation is scoped to.
    document_ids = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    conversation_id = Column(
        String(36), ForeignKey("conversations.id"), nullable=False, index=True
    )

    role = Column(String(10), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)

    # For assistant messages: list[{document_id, page_number, snippet}]
    sources = Column(JSON, nullable=True)
    mode = Column(String(20), nullable=True)  # "rag" | "calculation"

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ExtractedTable(Base):
    __tablename__ = "extracted_tables"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    document_id = Column(
        String(36), ForeignKey("documents.id"), nullable=False, index=True
    )

    page_number = Column(Integer, nullable=False)
    row_count = Column(Integer, nullable=False)
    col_count = Column(Integer, nullable=False)

    # Small preview (first few rows) for quick display without reading the file.
    preview = Column(JSON, nullable=True)  # list[list[str]]

    csv_path = Column(String(500), nullable=False)
    xlsx_path = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ResearchCollection(Base):
    """A user-owned grouping of existing documents (no PDF/vector
    duplication -- just relationships onto Document rows the user
    already owns)."""

    __tablename__ = "research_collections"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class CollectionDocument(Base):
    """Many-to-many join between a collection and a document."""

    __tablename__ = "collection_documents"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    collection_id = Column(String(36), ForeignKey("research_collections.id"), nullable=False, index=True)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)

    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ResearchBookmark(Base):
    """A user-saved piece of evidence (a specific chunk/page) with an
    optional personal note."""

    __tablename__ = "research_bookmarks"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)

    page_number = Column(Integer, nullable=True)
    chunk_index = Column(Integer, nullable=True)
    snippet = Column(Text, nullable=False)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ResearchMetadata(Base):
    """Cached structured research extraction for a document -- computed
    lazily on first request, never regenerated automatically."""

    __tablename__ = "research_metadata"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, unique=True, index=True)

    status = Column(String(20), nullable=False, default="pending")  # pending -> ready | failed
    error = Column(Text, nullable=True)

    title = Column(String(500), nullable=True)
    authors = Column(JSON, nullable=True)  # list[str]
    publication_year = Column(String(20), nullable=True)
    abstract = Column(Text, nullable=True)
    objective = Column(Text, nullable=True)
    methodology = Column(Text, nullable=True)
    dataset = Column(Text, nullable=True)
    key_findings = Column(JSON, nullable=True)  # list[str]
    limitations = Column(JSON, nullable=True)  # list[str]
    future_work = Column(Text, nullable=True)
    keywords = Column(JSON, nullable=True)  # list[str]

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ResearchSession(Base):
    """A persistent, reopenable research session -- groups the research
    actions (search/compare/synthesize/gaps/metadata) a user ran against
    a workspace or document set, so results don't vanish after the
    browser tab closes."""

    __tablename__ = "research_sessions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    collection_id = Column(String(36), ForeignKey("research_collections.id"), nullable=True, index=True)

    title = Column(String(300), nullable=False, default="New research session")
    document_ids = Column(JSON, nullable=True)  # list[str], used when not tied to a collection

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ResearchSessionEntry(Base):
    """One research action's result within a session (a search, a
    compare, a synthesis, a gap analysis, or a metadata extraction).
    Stores the generated result + citations, not raw document data."""

    __tablename__ = "research_session_entries"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    session_id = Column(String(36), ForeignKey("research_sessions.id"), nullable=False, index=True)

    action_type = Column(String(20), nullable=False)  # search | compare | synthesize | gaps | metadata
    question = Column(Text, nullable=True)  # the user's query/question, where applicable
    result_text = Column(Text, nullable=True)  # markdown/plain-text result
    result_json = Column(JSON, nullable=True)  # structured result (gaps, search hits, metadata fields)
    sources = Column(JSON, nullable=True)  # list[{document_id, filename, page_number, ...}]

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    num_questions = Column(Integer, nullable=False)
    duration_ms = Column(Integer, nullable=False)

    # Aggregate metrics (averaged across results where computable).
    avg_retrieval_precision = Column(Integer, nullable=True)  # stored *100 (int %)
    avg_retrieval_recall = Column(Integer, nullable=True)
    avg_answer_relevance = Column(Integer, nullable=True)
    avg_faithfulness = Column(Integer, nullable=True)
    avg_retrieval_latency_ms = Column(Integer, nullable=True)
    avg_generation_latency_ms = Column(Integer, nullable=True)
    avg_total_latency_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AppSettings(Base):
    """Singleton row (id="default") holding user-adjustable, non-sensitive
    retrieval knobs. Falls back to retrieval/config.py env defaults when
    no row exists yet or a field is null. Never holds secrets."""

    __tablename__ = "app_settings"

    id = Column(String(20), primary_key=True, default="default")

    dense_top_k = Column(Integer, nullable=True)
    bm25_top_k = Column(Integer, nullable=True)
    rerank_top_k = Column(Integer, nullable=True)
    final_chunks = Column(Integer, nullable=True)
    reranker_enabled = Column(String(5), nullable=True)  # "true"/"false"

    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class EvalCase(Base):
    """User-managed evaluation questions (dataset management, Phase 4).
    Seeded once from eval/dataset.json; editable afterward via the API.
    Reference answers are never auto-generated."""

    __tablename__ = "eval_cases"

    id = Column(String(36), primary_key=True, default=gen_uuid)

    question = Column(Text, nullable=False)
    expected_answer = Column(Text, nullable=True)
    document_id = Column(String(36), nullable=True)
    relevant_pages = Column(JSON, nullable=True)  # list[int]
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class EvalResult(Base):
    __tablename__ = "eval_results"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    run_id = Column(String(36), ForeignKey("eval_runs.id"), nullable=False, index=True)

    question = Column(Text, nullable=False)
    expected_answer = Column(Text, nullable=True)
    generated_answer = Column(Text, nullable=True)

    retrieved_sources = Column(JSON, nullable=True)  # list[{document_id,page_number,relevance_score,...}]

    retrieval_precision = Column(Integer, nullable=True)  # *100 int %, None if not computable
    retrieval_recall = Column(Integer, nullable=True)
    answer_relevance = Column(Integer, nullable=True)  # judge score *100
    faithfulness = Column(Integer, nullable=True)  # judge score *100
    judge_reasoning = Column(Text, nullable=True)

    retrieval_latency_ms = Column(Integer, nullable=True)
    generation_latency_ms = Column(Integer, nullable=True)
    total_latency_ms = Column(Integer, nullable=True)

    passed = Column(String(10), nullable=True)  # "pass" | "weak" | "fail" | None

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

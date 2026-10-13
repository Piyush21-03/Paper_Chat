from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    status: str
    error_message: Optional[str] = None
    processing_stage: Optional[str] = None
    failed_stage: Optional[str] = None
    page_count: Optional[int] = None
    chunk_count: Optional[int] = None
    file_size_bytes: int

    summary_status: str = "pending"
    summary_error: Optional[str] = None
    summary_text: Optional[str] = None
    summary_key_points: Optional[List[str]] = None
    summary_topics: Optional[List[str]] = None

    tables_status: str = "pending"
    tables_error: Optional[str] = None
    table_count: Optional[int] = None

    created_at: datetime
    updated_at: datetime


class UploadResponse(BaseModel):
    success: bool
    message: str
    document: Optional[DocumentOut] = None


class DocumentListResponse(BaseModel):
    success: bool
    documents: List[DocumentOut]


class RenameRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=500)


# ---------------- Chat / RAG ----------------

class SourceOut(BaseModel):
    document_id: str
    filename: Optional[str] = None
    page_number: Any = None
    snippet: str
    relevance_score: Optional[float] = None


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    document_ids: Optional[List[str]] = None
    conversation_id: Optional[str] = None


class CalculationOut(BaseModel):
    operation: str
    inputs: List[Dict[str, Any]]
    result: Any
    explanation: str


class AskResponse(BaseModel):
    success: bool
    answer: Optional[str] = None
    sources: Optional[List[SourceOut]] = None
    mode: Optional[str] = None  # "rag" | "calculation"
    low_evidence: Optional[bool] = None
    calculation: Optional[CalculationOut] = None
    follow_up_questions: Optional[List[str]] = None
    conversation_id: Optional[str] = None
    questions_used: Optional[int] = None
    questions_remaining: Optional[int] = None
    message: Optional[str] = None


# ---------------- Conversations ----------------

class ConversationCreate(BaseModel):
    document_ids: List[str] = Field(default_factory=list)
    title: Optional[str] = None


class ConversationRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    sources: Optional[List[Dict[str, Any]]] = None
    mode: Optional[str] = None
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    document_ids: List[str]
    created_at: datetime
    updated_at: datetime


class ConversationDetailOut(ConversationOut):
    messages: List[MessageOut] = Field(default_factory=list)


class ConversationListResponse(BaseModel):
    success: bool
    conversations: List[ConversationOut]


# ---------------- Tables ----------------

class TableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    page_number: int
    row_count: int
    col_count: int
    preview: Optional[List[List[Optional[str]]]] = None
    has_xlsx: bool = False


class TableListResponse(BaseModel):
    success: bool
    tables: List[TableOut]


# ---------------- Auth ----------------

class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    success: bool
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------- Research: Collections ----------------

class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None


class CollectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str] = None
    document_count: int = 0
    created_at: datetime
    updated_at: datetime


class CollectionDetailOut(CollectionOut):
    documents: List[DocumentOut] = Field(default_factory=list)


class AddDocumentsRequest(BaseModel):
    document_ids: List[str] = Field(min_length=1)


# ---------------- Research: Search / Compare / Synthesize / Gaps ----------------

class ResearchSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    document_ids: Optional[List[str]] = None
    collection_id: Optional[str] = None
    session_id: Optional[str] = None


class ResearchScopeRequest(BaseModel):
    document_ids: Optional[List[str]] = None
    collection_id: Optional[str] = None
    session_id: Optional[str] = None


class SynthesizeRequest(ResearchScopeRequest):
    question: str = Field(min_length=1)


# ---------------- Research: Bookmarks ----------------

class BookmarkCreate(BaseModel):
    document_id: str
    page_number: Optional[int] = None
    chunk_index: Optional[int] = None
    snippet: str = Field(min_length=1)
    note: Optional[str] = None


class BookmarkUpdate(BaseModel):
    note: Optional[str] = None


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    document_id: str
    filename: Optional[str] = None
    page_number: Optional[int] = None
    chunk_index: Optional[int] = None
    snippet: str
    note: Optional[str] = None
    created_at: datetime


# ---------------- Research: Metadata ----------------

class ResearchMetadataOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    document_id: str
    status: str
    error: Optional[str] = None
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    publication_year: Optional[str] = None
    abstract: Optional[str] = None
    objective: Optional[str] = None
    methodology: Optional[str] = None
    dataset: Optional[str] = None
    key_findings: Optional[List[str]] = None
    limitations: Optional[List[str]] = None
    future_work: Optional[str] = None
    keywords: Optional[List[str]] = None


# ---------------- Research: Export ----------------

class ExportSection(BaseModel):
    title: str
    content: str


class ExportRequest(BaseModel):
    collection_id: Optional[str] = None
    include_bookmarks: bool = True
    sections: List[ExportSection] = Field(default_factory=list)


# ---------------- Research Sessions ----------------

class SessionCreate(BaseModel):
    title: Optional[str] = None
    collection_id: Optional[str] = None
    document_ids: Optional[List[str]] = None


class SessionUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class SessionEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    action_type: str
    question: Optional[str] = None
    result_text: Optional[str] = None
    result_json: Optional[Any] = None
    sources: Optional[List[dict]] = None
    created_at: datetime


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    collection_id: Optional[str] = None
    document_ids: Optional[List[str]] = None
    entry_count: int = 0
    created_at: datetime
    updated_at: datetime


class SessionDetailOut(SessionOut):
    entries: List[SessionEntryOut] = Field(default_factory=list)


# ---------------- Settings ----------------

class SettingsOut(BaseModel):
    dense_top_k: int
    bm25_top_k: int
    rerank_top_k: int
    final_chunks: int
    reranker_enabled: bool
    max_context_chars: int  # read-only, shown for transparency


class SettingsUpdateRequest(BaseModel):
    dense_top_k: Optional[int] = Field(default=None, ge=1, le=50)
    bm25_top_k: Optional[int] = Field(default=None, ge=1, le=50)
    rerank_top_k: Optional[int] = Field(default=None, ge=1, le=30)
    final_chunks: Optional[int] = Field(default=None, ge=1, le=15)
    reranker_enabled: Optional[bool] = None


# ---------------- Eval cases (dataset management) ----------------

class EvalCaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question: str
    expected_answer: Optional[str] = None
    document_id: Optional[str] = None
    relevant_pages: Optional[List[int]] = None
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EvalCaseCreate(BaseModel):
    question: str = Field(min_length=1)
    expected_answer: Optional[str] = None
    document_id: Optional[str] = None
    relevant_pages: Optional[List[int]] = None
    note: Optional[str] = None


class EvalCaseUpdate(BaseModel):
    question: Optional[str] = Field(default=None, min_length=1)
    expected_answer: Optional[str] = None
    document_id: Optional[str] = None
    relevant_pages: Optional[List[int]] = None
    note: Optional[str] = None

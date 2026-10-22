# ⚙️ PaperChat — Backend Architecture

FastAPI-powered backend service orchestrating document ingestion, hybrid vector/keyword retrieval, LLM generation, and evaluation.

---

## 📂 Architecture & Directory Layout

```text
backend/
├── alembic/                # Database migrations
│   └── versions/           # Schema migration history
├── alembic.ini             # Alembic configuration
├── eval/                   # RAG evaluation suite
│   ├── dataset.json        # Ground-truth evaluation dataset
│   ├── metrics.py          # Relevance, faithfulness & hit-rate metrics
│   └── runner.py           # Evaluation runner
├── retrieval/              # Hybrid Retrieval Engine
│   ├── clients.py          # Qdrant client, Gemini embeddings & LLM setup
│   ├── config.py           # Retrieval hyperparameters & weights
│   ├── context.py          # Chunk deduplication & context compression
│   ├── dense_search.py     # Qdrant cosine similarity vector search
│   ├── fusion.py           # Reciprocal Rank Fusion (RRF)
│   ├── keyword_search.py   # In-memory BM25 lexical search with caching
│   ├── pipeline.py         # End-to-end multi-stage retrieval orchestration
│   ├── query_rewrite.py    # Conversational query expansion & disambiguation
│   ├── rerank.py           # Cross-encoder reranking with graceful fallback
│   └── runtime_settings.py # Dynamic settings override
├── routers/                # API Endpoints
│   ├── auth.py             # User registration & JWT authentication
│   ├── conversations.py    # Conversation threads & message history
│   ├── documents.py        # PDF upload, indexing, summaries & tables
│   ├── eval.py             # Retrieval evaluation triggers & reports
│   ├── research.py         # Multi-paper synthesis, comparisons, gaps & collections
│   ├── search.py           # Semantic, keyword & hybrid discovery search
│   └── settings.py         # Retrieval runtime configuration management
├── storage/                # Extracted document assets & table CSV/XLSX
├── uploads/                # Ingested PDF document storage
├── tests/                  # Automated test suites
│   ├── test_api_e2e.py            # End-to-end API router & DB isolation test
│   └── test_retrieval_pipeline.py # Retrieval engine & fusion test
├── main.py                 # FastAPI application entry point & static SPA serving
├── config.py               # Environment variables & application settings
├── db.py                   # SQLAlchemy engine, session factory & connection init
├── models.py               # SQLAlchemy ORM models
├── schemas.py              # Pydantic request/response schemas
├── auth.py                 # Password hashing & JWT token verification
├── rag.py                  # Document chunking, summarization & QA generation
├── research.py             # Paper analysis, cross-document comparison & gaps
├── jobs.py                 # Async background tasks (indexing, summary)
├── job_queue.py            # Redis / inline queue abstraction
├── rate_limit.py           # Sliding window rate limiter
├── calculator.py           # Deterministic calculation engine
└── tables.py               # PDF table extraction using pdfplumber
```

---

## 🚀 Running the Backend

### Local Development
```bash
# 1. Run migrations
alembic upgrade head

# 2. Start API server
uvicorn main:app --reload --port 8000
```

### Running Tests
You can run all tests using the project test runner:
```bash
python scripts/run_tests.py
```
Or run individual suites directly:
```bash
python backend/tests/test_api_e2e.py
python backend/tests/test_retrieval_pipeline.py
```
*(Compatibility wrappers at `backend/test_api_e2e.py` and `backend/test_retrieval_pipeline.py` are also provided).*

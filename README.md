# 📚 PaperChat

### AI-Powered Research Paper Assistant using Retrieval-Augmented Generation

PaperChat is a production-oriented **Retrieval-Augmented Generation (RAG)** application that allows users to upload research papers and documents, ask questions about them, and receive grounded AI-generated answers with page-level citations.

It combines semantic search, keyword search, reranking, document processing, conversation memory, authentication, evaluation, and a modern web interface into a complete AI research assistant.

---

## ✨ Features

### 📄 Document Management

- Upload multiple PDF documents
- Track document processing status
- Rename and delete documents
- Retry failed document processing
- Search across uploaded documents
- Automatic document summaries
- Extract tables from PDFs
- Export extracted tables as CSV/XLSX
- Document-level isolation for multi-user environments

### 🧠 Advanced RAG Pipeline

PaperChat uses a multi-stage retrieval pipeline:

```text
User Query
    ↓
Query Rewriting
    ↓
Dense Vector Search
    +
BM25 Keyword Search
    ↓
Reciprocal Rank Fusion (RRF)
    ↓
Cross-Encoder Reranking
    ↓
Context Selection
    ↓
Gemini LLM
    ↓
Grounded Answer + Citations
```

The system combines semantic and lexical retrieval to improve search quality and uses cross-encoder reranking to select the most relevant chunks before generation.

### 💬 Conversational AI

- Persistent conversations
- Conversation history
- Context-aware follow-up questions
- Multi-document conversations
- Source-aware answers
- Low-evidence warnings
- User-specific conversation isolation

### 📑 Citations & PDF Viewer

- Page-level source citations
- Source snippets
- Document and page references
- Click citations to navigate to the relevant PDF page
- Built-in PDF viewer using PDF.js
- Highlight relevant source locations

### 📊 Data & Analysis Tools

- Deterministic calculator mode
- Sum
- Average
- Minimum
- Maximum
- Percentage difference
- Count
- Comparison operations
- PDF table extraction
- CSV export
- XLSX export

### 📝 Automatic Document Summaries

PaperChat automatically generates document summaries during background processing.

The summarization pipeline uses hierarchical processing to handle larger documents while controlling context size.

### ⚙️ Background Processing

Document processing follows:

```text
Upload PDF
    ↓
Index Document
    ↓
Generate Summary
    ↓
Extract Tables
    ↓
Ready
```

The application supports:

- Inline processing for development
- Redis/RQ background workers for production
- Job deduplication
- Retry support
- Processing status tracking

### 📈 RAG Evaluation

PaperChat includes a dedicated evaluation dashboard for measuring retrieval and answer quality.

Metrics include:

- Retrieval Precision
- Retrieval Recall
- Relevance
- Faithfulness
- Latency
- Evaluation trends
- Run comparison
- Evaluation dataset management

### 🔐 Authentication & Security

PaperChat includes multi-user authentication and security features:

- User registration
- User login
- JWT authentication
- PBKDF2 password hashing
- User-level document isolation
- User-level conversation isolation
- Protected API routes
- Upload size validation
- PDF magic-byte validation
- CORS configuration
- Security headers
- Request IDs
- Latency logging
- Rate limiting

---

# 🏗️ System Architecture

```text
                         ┌─────────────────────┐
                         │    Web Frontend     │
                         │     HTML/CSS/JS     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │       FastAPI       │
                         │       Backend       │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
      ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
      │  PostgreSQL   │     │    Qdrant     │     │  Redis / RQ   │
      │    Database   │     │  Vector DB    │     │  Job Queue    │
      └───────────────┘     └───────┬───────┘     └───────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    RAG Pipeline     │
                         │                     │
                         │ Query Rewriting     │
                         │ Dense Retrieval     │
                         │ BM25 Retrieval      │
                         │ RRF Fusion          │
                         │ Cross-Encoder       │
                         │ Context Control     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Gemini LLM      │
                         └─────────────────────┘
```

---

# 🧠 RAG Pipeline

The core of PaperChat is an advanced hybrid RAG pipeline.

```text
                    User Question
                          │
                          ▼
                  Query Rewriting
                          │
                 ┌────────┴────────┐
                 │                 │
                 ▼                 ▼
          Dense Retrieval      BM25 Search
                 │                 │
                 └────────┬────────┘
                          ▼
                  RRF Rank Fusion
                          │
                          ▼
                 Cross-Encoder
                   Reranking
                          │
                          ▼
                  Context Control
                          │
                          ▼
                    Gemini LLM
                          │
                          ▼
              Answer + Source Citations
```

### Retrieval Components

#### Dense Retrieval

Uses vector embeddings to identify semantically similar document chunks.

#### BM25

Provides keyword-based retrieval, which is particularly useful for:

- Technical terms
- Names
- Numbers
- Exact phrases
- Acronyms

#### Reciprocal Rank Fusion

RRF combines the results from dense and lexical retrieval into a unified ranking.

#### Cross-Encoder Reranking

A cross-encoder evaluates query-document relevance more precisely after initial retrieval.

#### Context Control

Only the most relevant evidence is passed to the LLM to reduce unnecessary context and improve answer quality.

---

# 🛠️ Tech Stack

## Backend

- Python
- FastAPI
- SQLAlchemy
- Pydantic
- JWT
- PBKDF2 Password Hashing

## AI / RAG

- Google Gemini
- LangChain
- HuggingFace Embeddings
- Sentence Transformers
- Cross-Encoder Reranking
- BM25
- Reciprocal Rank Fusion (RRF)

## Vector Database

- Qdrant

## Database

- SQLite for local development
- PostgreSQL for production

## Background Jobs

- Redis
- RQ

## Document Processing

- PyPDF
- pdfplumber
- PDF.js

## Frontend

- HTML5
- CSS3
- JavaScript
- Marked.js
- DOMPurify

## Deployment

- Docker
- Docker Compose

---

# 📁 Project Structure

```text
Paperchat/
│
├── backend/                   # FastAPI application & business logic
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── models.py
│   ├── schemas.py
│   ├── auth.py
│   ├── rag.py
│   ├── research.py
│   ├── calculator.py
│   ├── tables.py
│   ├── jobs.py
│   ├── job_queue.py
│   ├── rate_limit.py
│   │
│   ├── retrieval/             # Hybrid RAG retrieval pipeline & search
│   │   ├── clients.py
│   │   ├── dense_search.py
│   │   ├── keyword_search.py
│   │   ├── fusion.py
│   │   ├── rerank.py
│   │   ├── context.py
│   │   └── pipeline.py
│   │
│   ├── routers/               # Modular API endpoint routers
│   │   ├── auth.py
│   │   ├── documents.py
│   │   ├── conversations.py
│   │   ├── research.py
│   │   ├── search.py
│   │   ├── eval.py
│   │   └── settings.py
│   │
│   ├── eval/                  # Retrieval evaluation suite
│   │   ├── dataset.json
│   │   ├── metrics.py
│   │   └── runner.py
│   │
│   ├── alembic/               # Schema migrations
│   │   └── versions/
│   │
│   └── tests/                 # Automated test suites
│       ├── test_api_e2e.py
│       └── test_retrieval_pipeline.py
│
├── frontend/                  # Modern React 19 + Vite Single-Page Application
│   ├── src/
│   │   ├── components/        # Shell, PdfViewer
│   │   ├── context/           # AuthContext
│   │   ├── pages/             # Dashboard, Chat, Document, Research, Eval, Settings
│   │   ├── utils/             # API client with JWT interceptors
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── scripts/                   # Operations & maintenance scripts
│   ├── run_tests.py
│   └── migrate_sqlite_to_postgres.py
│
├── requirements.txt
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── DEPLOYMENT.md
└── README.md
```

---

# 🚀 Getting Started

## Prerequisites

Make sure you have:

- Python 3.10+
- Git
- Qdrant
- Gemini API key

For production deployment:

- Docker
- Docker Compose
- PostgreSQL
- Redis

---

# 💻 Local Development

## 1. Clone the Repository

```bash
git clone https://github.com/Piyush21-03/Paperchat.git
cd Paperchat
```

---

## 2. Create a Virtual Environment

### Windows

```powershell
python -m venv .venv
.venv\Scripts\activate
```

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 4. Configure Environment Variables

Create `.env` from `.env.example`.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

Then open `.env` and configure your API key:

```env
GOOGLE_API_KEY=your_gemini_api_key
```

Other configuration values can be found in:

```text
.env.example
```

> ⚠️ Never commit `.env` to GitHub.

---

# ▶️ Run the Application

From the project root:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Then open:

```text
http://localhost:8000
```

Create an account and start uploading research papers.

---

# 🐳 Docker Deployment

PaperChat includes a production-oriented Docker Compose setup.

Start the production stack:

```bash
docker compose -f docker-compose.prod.yml up -d
```

The production architecture can include:

```text
┌─────────────────────┐
│       FastAPI       │
└──────────┬──────────┘
           │
     ┌─────┼─────┐
     │     │     │
     ▼     ▼     ▼
 Postgres Redis Qdrant
           │
           ▼
        RQ Worker
```

For detailed deployment instructions, see:

```text
DEPLOYMENT.md
```

---

# 🔐 Security & User Isolation

PaperChat is designed as a multi-user application.

Each authenticated user has isolated access to:

```text
User
 ├── Documents
 ├── Conversations
 ├── Search
 └── Evaluation Runs
```

The backend validates ownership before accessing protected resources.

Security mechanisms include:

- JWT authentication
- PBKDF2 password hashing
- CORS configuration
- Rate limiting
- Upload limits
- PDF validation
- Security headers
- Request tracing
- Structured logging
- User-level resource isolation

---

# 🧪 Testing

The project contains automated tests covering major backend and RAG functionality.

Run:

```bash
pytest
```

The test suite covers areas including:

- Authentication
- Authorization
- JWT validation
- User isolation
- Document APIs
- Conversation APIs
- Search
- Evaluation
- Rate limiting
- Health endpoints
- Job deduplication
- Redis fallback
- Retrieval pipeline
- Calculator functionality

---

# ❤️ Health Checks

PaperChat provides health endpoints for deployment monitoring.

```text
/health
```

Basic application health.

```text
/health/ready
```

Readiness check for required services.

These endpoints can be used by Docker, load balancers, or deployment platforms.

---

# 📊 RAG Evaluation

The evaluation dashboard helps measure the performance of the RAG pipeline.

```text
Evaluation
│
├── Retrieval
│   ├── Precision
│   └── Recall
│
├── Generation
│   ├── Relevance
│   └── Faithfulness
│
└── Performance
    └── Latency
```

Evaluation runs can be stored and compared to measure improvements to the retrieval pipeline over time.

---

# 🔬 Research Use Cases

PaperChat can be used for:

- Research paper analysis
- Literature review
- Academic document Q&A
- Technical documentation analysis
- Multi-paper comparison
- Information extraction
- Finding relevant sections
- Understanding complex research papers
- Table extraction
- Research data analysis
- Academic knowledge discovery

---

# 🧮 Calculator Mode

PaperChat supports deterministic calculation operations for numerical questions.

Supported operations include:

```text
SUM
AVERAGE
MIN
MAX
COUNT
PERCENTAGE DIFFERENCE
COMPARISON
```

These calculations are performed deterministically rather than relying on the LLM to perform arithmetic.

This helps improve reliability for numerical queries.

---

# 📑 Table Extraction

PaperChat can detect and extract tables from supported PDF documents.

```text
PDF
 │
 ▼
Table Detection
 │
 ▼
Structured Data
 │
 ├── CSV
 └── XLSX
```

This allows users to reuse research data outside the application.

---

# 🎨 User Interface

PaperChat provides a modern research-focused interface containing:

- Dashboard
- Document management
- Chat interface
- Multi-document selection
- PDF viewer
- Source cards
- Citation navigation
- Search interface
- Evaluation dashboard
- Settings
- Login/register pages
- Dark/light theme
- Responsive layouts

---

# 🗺️ Development Roadmap

## ✅ Completed

- [x] Multi-document support
- [x] Persistent conversations
- [x] Conversation history
- [x] Document summaries
- [x] Table extraction
- [x] CSV/XLSX export
- [x] Calculator mode
- [x] PDF viewer
- [x] Page-level citations
- [x] Hybrid retrieval
- [x] Dense vector search
- [x] BM25 retrieval
- [x] Reciprocal Rank Fusion
- [x] Cross-encoder reranking
- [x] Context control
- [x] RAG evaluation
- [x] Evaluation dashboard
- [x] User authentication
- [x] Multi-user isolation
- [x] Background processing
- [x] Redis/RQ support
- [x] PostgreSQL support
- [x] Docker deployment
- [x] Rate limiting
- [x] Security hardening
- [x] Health/readiness endpoints
- [x] Structured logging

## 🚧 Planned

- [ ] Streaming AI responses
- [ ] Literature review assistant
- [ ] Research knowledge graph
- [ ] PDF export (Markdown export shipped in Phase 6)
- [ ] Shareable research sessions
- [ ] Advanced analytics

---

# 📌 Current Project Status

**Phase 6 — Research Intelligence Platform**

PaperChat now goes beyond single-document Q&A into cross-document research workflows, built entirely on top of the existing dense+BM25+RRF+rerank retrieval pipeline (no second retrieval system):

- **Research workspaces/collections** — group existing documents (no PDF/vector duplication), full CRUD, user-isolated
- **Research search** — the same search infra scoped to a workspace or explicit document set
- **Document comparison** — grounded aspect-by-aspect comparison table (Objective/Methodology/Dataset/Results/Limitations/Conclusion) across 2+ documents, evidence gathered per document via the real pipeline
- **Research synthesis** — cross-document answers to questions like "what are the common findings", evidence grouped by document, citations required
- **Structured metadata extraction** — title/authors/year/abstract/objective/methodology/dataset/findings/limitations/future work/keywords, lazily extracted once per document and cached; missing fields are marked "Not found"/"Not clearly stated", never invented
- **Research gap detection** — explicitly-stated gaps (with document+page citations) kept strictly separate from gaps only inferred by comparing documents, labeled as such in both the API and UI
- **Follow-up question suggestions** — 3-5 clickable, content-grounded suggestions after each chat answer
- **Evidence bookmarks** — save a source snippet with an optional note straight from chat's source cards; user-isolated
- **Markdown research export** — workspace info, saved evidence, and any comparison/synthesis/gap results generated that session

**Phase 5 — Production-Ready Foundation**

PaperChat has evolved from a basic PDF question-answering application into a full-stack, multi-user RAG platform with:

```text
                         PaperChat
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
   Documents             RAG AI              Security
       │                    │                    │
       ▼                    ▼                    ▼
  PDF Processing      Hybrid Search       Authentication
  Summaries           RRF                 JWT
  Tables              Reranking           User Isolation
  Management          Evaluation          Rate Limiting
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                     Research Assistant
```

---

# 👨‍💻 Author

## Piyush Panigrahi

GitHub:

https://github.com/Piyush21-03

Project:

https://github.com/Piyush21-03/Paperchat

---

# 🤝 Contributing

Contributions, suggestions, bug reports, and improvements are welcome.

If you find PaperChat useful, consider giving the repository a ⭐.

---

# 📄 License

This project is currently intended for educational and research purposes.

---

## ⭐ PaperChat

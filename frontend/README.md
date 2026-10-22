# ⚛️ PaperChat — React Client

Modern Single-Page Application (SPA) frontend for PaperChat built with React 19, Vite, and Tailwind CSS.

---

## 🛠️ Tech Stack

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **Icons**: Lucide React
- **Document Rendering**: PDF.js (`pdfjs-dist`)
- **Markdown & Sanitization**: Marked + DOMPurify
- **Notifications**: React Hot Toast
- **HTTP Client**: Axios

---

## 📂 Project Structure

```text
src/
├── components/          # Reusable UI & layout components
│   ├── PdfViewer.jsx    # Split-view interactive PDF reader with page jumping
│   └── Shell.jsx        # Navigation sidebar, theme switcher & header layout
├── context/             # React Context providers
│   └── AuthContext.jsx  # Authentication state, login/logout, JWT token storage
├── pages/               # Application view routes
│   ├── Landing.jsx      # Marketing / landing page
│   ├── Login.jsx        # User login
│   ├── Register.jsx     # User registration
│   ├── Dashboard.jsx    # Document management & upload hub
│   ├── Chat.jsx         # Conversational RAG interface with citations
│   ├── Document.jsx     # Individual document details & table viewer
│   ├── Research.jsx     # Multi-document synthesis, comparison & gaps
│   ├── Eval.jsx         # Retrieval evaluation dashboard
│   └── Settings.jsx     # Retrieval pipeline runtime configurations
├── utils/
│   └── api.js           # Axios instance with auth interceptors
├── App.jsx              # Application router & protected routes
├── index.css            # Global CSS & Tailwind imports
└── main.jsx             # React entry point
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
```
Default API backend points to `http://localhost:8000`.

### 3. Start Development Server
```bash
npm run dev
```
The development server runs at `http://localhost:5173` with full Hot Module Replacement (HMR). API calls to `/api`, `/ask`, and `/health` are proxied to the backend.

### 4. Build for Production
```bash
npm run build
```
Builds the production bundle into `dist/`. The FastAPI backend automatically serves these files when running in production.

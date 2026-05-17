# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

```
.
├── backend/      # Flask + Python
│   ├── app.py
│   ├── requirements.txt
│   ├── .env           # gitignored — copy from .env.example
│   ├── .env.example
│   ├── chat.db        # SQLite (gitignored)
│   ├── db/            # ChromaDB (gitignored)
│   ├── export_users.py
│   └── scripts/
│       └── make_admin.py
└── frontend/     # Next.js 16 + React 19
    ├── app/
    ├── components/
    ├── lib/
    └── ...
```

## Setup

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# macOS only — required by WeasyPrint for /export-pdf:
brew install pango
cp .env.example .env   # fill in OPENAI_API_KEY (and optionally TAVILY_API_KEY)

# Frontend
cd frontend && npm install
```

## Running

```bash
# Flask backend  (terminal 1) — must run from backend/ so relative paths resolve
cd backend && source .venv/bin/activate && python app.py
# → http://localhost:5003

# Next.js frontend  (terminal 2)
cd frontend && npm run dev
# → http://localhost:3000
```

Node.js lives at `/usr/local/bin/node` (v24). If `npm`/`npx` are not found, prefix commands with `PATH="/usr/local/bin:$PATH"`.

## Frontend commands

```bash
cd frontend
npm run dev      # dev server with hot reload
npm run build    # production build
npm run lint     # ESLint (must pass before committing)
npx tsc --noEmit # type-check without emitting
```

## Environment variables

All secrets live in `backend/.env` (gitignored). `backend/.env.example` is the committed template.

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API — embeddings + chat completions | — |
| `TAVILY_API_KEY` | Web search (optional); feature silently disabled if absent | — |
| `PORT` | Flask server port | `5003` (macOS 5000 is taken by AirPlay) |
| `FLASK_ENV` | Set to `development` for Flask debug mode | — |

## Backend API surface

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness check; reports ChromaDB chunk count |
| `/upload-pdf` | POST | Upload PDF / PPTX / images (multipart `files`) |
| `/ask` | POST | RAG Q&A, SSE stream, session-aware |
| `/documents` | GET | List unique sources in the vector DB |
| `/sessions` | GET | List all chat sessions |
| `/sessions/<id>` | GET | Fetch all messages for a session |
| `/sessions/<id>` | DELETE | Delete a session and its messages |
| `/generate-paper` | POST | Write an academic paper from uploaded docs |
| `/export-pdf` | POST | Render Markdown → PDF (WeasyPrint, Hebrew RTL) |
| `/export-docx` | POST | Render Markdown+LaTeX → DOCX (python-docx) |
| `/test-ai` | POST | Legacy general-purpose chat (RAG when docs exist) |

## Architecture

Full-stack RAG app for Hebrew-speaking university students. Students upload study materials and ask questions in Hebrew or English, or generate full academic papers.

### Backend — `backend/app.py`

Single Flask file. All module-level singletons are instantiated once at startup:

| Singleton | Purpose |
|---|---|
| `client` | `openai.OpenAI` — chat completions (`gpt-4o-mini`) |
| `chroma_client` | `chromadb.PersistentClient` — writes to `./db/` |
| `collection` | ChromaDB collection `pdf_documents`, cosine similarity |
| `embeddings_model` | LangChain `OpenAIEmbeddings` (`text-embedding-3-small`) |
| `text_splitter` | `RecursiveCharacterTextSplitter` (chunk 1500, overlap 300) |
| `bm25_state` | In-memory BM25 index; rebuilt from ChromaDB on startup and after every upload |
| `uploaded_images` | `dict[filename → {base64, mime}]`; in-memory, cleared on server restart |

**File upload pipeline (`/upload-pdf`):**
Accepts PDF, PPTX, PNG/JPG/JPEG. PDFs use PyMuPDF (`fitz`) for in-memory text extraction (preserves Hebrew logical order). PPTX uses `python-pptx` via `extract_pptx_text()`, prefixing each slide as `[שקופית N]`. Images are base64-encoded and stored in `uploaded_images` (not in ChromaDB). Text files are chunked → embedded → upserted into ChromaDB; old chunks for the same filename are purged first. Chunk IDs: `{filename}_chunk_{i}`.

**Retrieval (`hybrid_search`):**
Combines cosine similarity (ChromaDB) and BM25 keyword search via Reciprocal Rank Fusion (RRF, constant 60). Hebrew tokenizer (`tokenize_hebrew`) strips niqqud/cantillation marks before BM25 indexing. Returns `TOP_K=8` chunks after merging.

**Q&A flow (`/ask`) — SSE stream:**
1. Create/resume `ChatSession` in SQLite; save user message.
2. Short queries (< 5 words) are enriched with the prior user question before embedding.
3. `hybrid_search` retrieves chunks.
4. LLM call with two OpenAI tools: `code_interpreter` and `search_web` (Tavily, optional).
5. Tool dispatch: `code_interpreter` runs `execute_python_code()` in a daemon thread (25 s timeout); captures stdout and matplotlib figures as base64 PNG. `search_web` calls Tavily.
6. Safety net: if the LLM writes `\`\`\`python` blocks instead of calling the tool, the backend extracts and executes them automatically.
7. If `uploaded_images` is non-empty, the current user message is built as an OpenAI multi-part content array (text + image_url entries), activating vision.
8. Stream events: `{type:"status", phase}` → `{type:"result", ...}` | `{type:"error"}`.

**Paper writer (`/generate-paper`):**
Uses `hybrid_search` over the top 20 chunks. System prompt instructs LaTeX for all equations (`$inline$` / `$$block$$`). Returns `{paper, sources, chunks_used}` (not streamed).

**Export routes:**
- `/export-pdf` — `markdown` lib → HTML → WeasyPrint (requires system `pango`). Full Hebrew RTL styling.
- `/export-docx` — custom Markdown+LaTeX → python-docx converter. Pre-processes `$$...$$` blocks into single-line sentinel markers before line-by-line parsing. Renders inline math in Cambria Math (blue), block equations centred. Sets `w:bidi` on all paragraphs for Hebrew RTL.

### Frontend — `frontend/`

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · `react-dropzone` v15

> **Warning:** This Next.js version has breaking changes from older releases. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

**Key conventions:**
- **Tailwind v4** — CSS-first config only. No `tailwind.config.ts`. All config lives in `app/globals.css` via `@import "tailwindcss"` and `@theme inline`. Dynamic class names (e.g. `bg-${color}-200`) are not purged — always write complete class strings.
- **RTL Hebrew** — `document.documentElement.dir` is toggled between `rtl`/`ltr` by the language toggle in `Home`. In RTL flex-row, `justify-start` aligns to the right. Chat message alignment uses `justify-start` for user and `justify-end` for AI in Hebrew (inverted in English).
- **KaTeX** — `katex/dist/katex.min.css` imported in `layout.tsx`. `PaperWriter` uses `remark-math` + `rehype-katex` to render `$...$` / `$$...$$` from the LLM.
- **All UI** is in `app/page.tsx` (`'use client'`). Components: `PdfUploader`, `ChatInterface`, `PaperWriter`, `Sidebar`, `Home`, `CodeExecutionBlock`.
- **Tab persistence** — both `ChatInterface` and `PaperWriter` are always mounted; the inactive tab is hidden with Tailwind `hidden` class to preserve state across tab switches.
- **`key={chatKey}`** on `ChatInterface` is intentional: changing `chatKey` (on new chat / load session) forces a full remount and resets all local state.
- **File upload** — `PdfUploader` accepts PDF, PPTX, PNG, JPG. Image files get `URL.createObjectURL()` previews before upload; these are revoked in `handleRemoveFile` (which must NOT call `onRemove` inside the `setUploadedFiles` updater — that causes a "Cannot update a component while rendering" error).
- **Backend URL** is hardcoded as `http://127.0.0.1:5003` in `page.tsx`.

### Data persistence

| Store | Location | Contents | Cleared by |
|---|---|---|---|
| ChromaDB | `backend/db/` | Text chunks + embeddings | Manual deletion or re-upload |
| SQLite | `backend/chat.db` | Chat sessions and messages | Manual deletion |
| BM25 index | Memory | Rebuilt from ChromaDB | Server restart |
| Images | Memory | Base64 of uploaded images | Server restart |

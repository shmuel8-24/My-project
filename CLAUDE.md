# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in OPENAI_API_KEY

# Frontend
cd frontend && npm install
```

## Running

```bash
# Flask backend  (terminal 1)
source .venv/bin/activate && python app.py
# → http://localhost:5003

# Next.js frontend  (terminal 2)
cd frontend && npm run dev
# → http://localhost:3000
```

Node.js lives at `/usr/local/bin/node` (v24). If `npm`/`npx` are not found, prefix commands with `PATH="/usr/local/bin:$PATH"`.

## Backend commands

```bash
# Liveness (also reports total chunk count)
curl http://localhost:5003/health

# Upload a PDF
curl -X POST http://localhost:5003/upload-pdf \
  -F "file=@path/to/doc.pdf"

# Ask a question with optional conversation history
curl -X POST http://localhost:5003/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "What is this document about?", "history": []}'

# List all documents currently in the vector database
curl http://localhost:5003/documents

# Legacy general-purpose chat (also context-aware when docs exist)
curl -X POST http://localhost:5003/test-ai \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

## Frontend commands

```bash
cd frontend
npm run dev      # dev server with hot reload
npm run build    # production build
npm run lint     # ESLint (must pass before committing)
npx tsc --noEmit # type-check without emitting
```

## Environment variables

All secrets live in `.env` (gitignored). `.env.example` is the committed template.

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API access | — |
| `PORT` | Flask server port | `5003` (macOS 5000 is taken by AirPlay) |
| `FLASK_ENV` | Set to `development` for Flask debug mode | — |

## Architecture

Full-stack RAG (Retrieval-Augmented Generation) app for Hebrew-speaking university students. Students upload PDF study materials and ask questions in Hebrew or English.

### Backend — `app.py`

Single Flask file. All module-level singletons are instantiated once at startup:

| Singleton | Purpose |
|---|---|
| `client` | `openai.OpenAI` — chat completions (`gpt-4o-mini`) |
| `chroma_client` | `chromadb.PersistentClient` — writes to `./db/` |
| `collection` | ChromaDB collection `pdf_documents` with cosine similarity |
| `embeddings_model` | LangChain `OpenAIEmbeddings` (`text-embedding-3-small`) |
| `text_splitter` | `RecursiveCharacterTextSplitter` (chunk 1500, overlap 300) |

**RAG pipeline (`/upload-pdf`):**
PDF bytes → PyMuPDF (`fitz`) text extraction in-memory (correct logical order for Hebrew/RTL) → split into chunks → embed → upsert into ChromaDB. Old chunks for the same filename are purged before upserting (delete by `source` metadata field). Chunk IDs follow `{filename}_chunk_{i}`.

**Q&A flow (`/ask`):**
Accepts `{message, history}`. Short follow-ups (< 5 words) are enriched with the last user question before embedding to avoid retrieval drift. Retrieves `TOP_K=8` chunks → injects context into GPT-4o-mini → returns `{answer, sources, chunks_used}`. History is trimmed to the last `MAX_HISTORY_MESSAGES=10` turns before being sent to the LLM, but is intentionally **not** mixed into the embedding query.

**`/documents`** returns all unique sources currently in the vector DB with chunk counts.

**`/test-ai`** is a legacy endpoint — does RAG when docs exist, plain chat otherwise.

### Frontend — `frontend/`

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · `react-dropzone` v15

> **Warning:** `frontend/AGENTS.md` (loaded via `frontend/CLAUDE.md`) notes that this Next.js version has breaking changes from older releases. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

**Key conventions:**
- **Tailwind v4** — CSS-first config only. No `tailwind.config.ts`. All config lives in `app/globals.css` via `@import "tailwindcss"` and `@theme inline`.
- **RTL Hebrew** — `<html lang="he" dir="rtl">` in `app/layout.tsx`. In RTL flex-row, the first DOM child appears on the **right**. Chat uses `justify-start` (→ right, user) and `justify-end` (→ left, AI).
- **Heebo font** — loaded via `next/font/google`, mapped to `--font-sans` in `@theme inline`.
- All UI is one client component: `app/page.tsx` (`'use client'`). Components: `PdfUploader`, `ChatInterface`, `Home`.
- `ChatInterface` is given `key={String(hasDoc)}` in `Home` so removing a document remounts it with clean state — no `useEffect` reset needed.
- Backend URL is hardcoded as `http://127.0.0.1:5003` in `page.tsx`. Both `/upload-pdf` and `/ask` (with history) are fully wired.

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
# Liveness
curl http://localhost:5003/health

# Upload a PDF
curl -X POST http://localhost:5003/upload-pdf \
  -F "file=@path/to/doc.pdf"

# Ask a question (requires at least one PDF uploaded)
curl -X POST http://localhost:5003/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "What is this document about?"}'

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

This is a full-stack RAG (Retrieval-Augmented Generation) application for Hebrew-speaking university students.

### Backend — `app.py`

Single Flask file. All module-level singletons are instantiated once at startup:

| Singleton | Purpose |
|---|---|
| `client` | `openai.OpenAI` — used for chat completions (`gpt-4o-mini`) |
| `chroma_client` | `chromadb.PersistentClient` — writes to `./chroma_storage/` |
| `collection` | ChromaDB collection named `pdf_documents` |
| `embeddings_model` | LangChain `OpenAIEmbeddings` with `text-embedding-3-small` |
| `text_splitter` | `RecursiveCharacterTextSplitter` (chunk 1000, overlap 200) |

**RAG pipeline (`/upload-pdf`):**
PDF bytes → `pdfplumber` text extraction (in-memory) → split into chunks → embed with `text-embedding-3-small` → upsert into ChromaDB. Chunk IDs are deterministic (`{filename}_chunk_{i}`), so re-uploading the same filename overwrites its chunks.

**Q&A flow (`/ask`):**
`message` string → embed → ChromaDB similarity search (top 5) → inject context into GPT-4o-mini system prompt → return `{answer, sources, chunks_used}`.

> **Note:** `/ask` reads the key `message` from the JSON body (not `question`). The frontend currently stubs this as a TODO.

**`/test-ai`** is a legacy endpoint that also does a ChromaDB context lookup (top 3) when documents exist, making it implicitly RAG-capable.

### Frontend — `frontend/`

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · `react-dropzone` v15

**Key conventions:**
- **Tailwind v4** uses a CSS-first config — there is no `tailwind.config.ts`. Configuration lives entirely in `app/globals.css` via `@import "tailwindcss"` and `@theme inline`.
- **RTL Hebrew** is set globally via `<html lang="he" dir="rtl">` in `app/layout.tsx`. In RTL `flex-row`, the first DOM child appears on the **right**. Chat message alignment uses `justify-start` (→ right, user) and `justify-end` (→ left, AI).
- **Heebo font** (Hebrew + Latin) is loaded via `next/font/google`, exposed as CSS variable `--font-heebo`, and mapped to `--font-sans` in `@theme inline` so it applies everywhere.
- All UI lives in a single client component: `app/page.tsx` (`'use client'`). Components: `PdfUploader`, `ChatInterface`, `Home`.
- API calls to the Flask backend are **stubbed** — look for `// TODO:` comments in `page.tsx` to wire them up. The backend URL is `http://127.0.0.1:5003`.

**Resetting `ChatInterface` state:** the component is given `key={String(hasDoc)}` in `Home`, so removing a document remounts it with clean state without needing a `useEffect` + `setState`.

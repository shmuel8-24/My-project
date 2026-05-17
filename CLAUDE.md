# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

```
.
├── backend/
│   ├── app.py              # Entry point: Flask app, CORS, limiter, blueprint registration
│   ├── extensions.py       # Shared singletons: OpenAI, ChromaDB, limiter, per-user caches
│   ├── models/
│   │   └── __init__.py     # SQLAlchemy models + DB engine + SessionLocal + migrations
│   ├── api/
│   │   ├── middleware.py   # token_required, admin_required, _get_user_refreshed
│   │   ├── auth.py         # Auth blueprint (login, OTP, register, profile, onboarding, etc.)
│   │   ├── documents.py    # Documents/RAG blueprint (upload, ask, sessions)
│   │   ├── admin.py        # Admin blueprint
│   │   └── export.py       # Export blueprint (paper, quiz, PDF, DOCX)
│   ├── services/
│   │   ├── rag.py          # hybrid_search, BM25, get_user_collection
│   │   ├── security.py     # DLP filter, PII redaction, HTML stripping
│   │   ├── email.py        # OTP + reset email (SMTP / Resend / terminal)
│   │   ├── pdf.py          # PPTX text/slide extraction
│   │   ├── code_runner.py  # Python sandbox (matplotlib Agg backend set here)
│   │   └── startup.py      # Background backfill threads
│   ├── data/               # gitignored persistent storage
│   │   ├── db/             # ChromaDB vector store
│   │   └── chat.db         # SQLite (users, sessions, messages)
│   ├── requirements.txt
│   ├── .env.example
│   ├── export_users.py
│   └── scripts/make_admin.py
└── frontend/
    ├── src/
    │   └── app/
    │       ├── page.tsx                        # Landing page + auth modal
    │       ├── onboarding/page.tsx             # Post-registration onboarding form
    │       ├── workspace/
    │       │   ├── page.tsx                    # Main RAG workspace (Sidebar, modals, chat)
    │       │   └── UserProfileModal.tsx        # User profile modal (extracted component)
    │       ├── admin/page.tsx                  # Admin dashboard
    │       ├── api/flask/[...path]/route.ts    # Server-side Flask proxy
    │       ├── providers/language.tsx          # Lang context (he/en)
    │       └── locales/landing.ts              # i18n strings
    ├── components/
    └── lib/
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
| `SECRET_KEY` | JWT signing secret | insecure dev default — must override in prod |
| `PORT` | Flask server port | `5003` (macOS 5000 is taken by AirPlay) |
| `FLASK_ENV` | Set to `development` for Flask debug mode | — |
| `ADMIN_EMAIL` | Automatically promoted to admin on every login | — |
| `FRONTEND_URL` | Base URL used in password-reset email links | `http://localhost:3000` |
| `MAIL_SERVER` | SMTP host; enables email delivery when set | — |
| `RESEND_API_KEY` | Alternative to SMTP (ignored if `MAIL_SERVER` is set) | — |

Frontend env lives in `frontend/.env.local`:

| Variable | Purpose |
|---|---|
| `API_URL` | Server-only Flask URL used by the Next.js proxy route |
| `NEXT_PUBLIC_API_URL` | Browser-visible Flask URL used by the admin page |

## Architecture

Full-stack RAG app branded **U-Note** for Hebrew-speaking university students. Students upload study materials and ask questions in Hebrew or English, or generate full academic papers.

### Backend — layered module structure

**Import dependency order (no cycles):**
`models/` ← `extensions.py` ← `services/*` ← `api/*` ← `app.py`

**`extensions.py`** — initialized once at startup, imported by all layers:
| Singleton | Purpose |
|---|---|
| `client` | `openai.OpenAI` — chat completions (`gpt-4o-mini`) |
| `chroma_client` | `chromadb.PersistentClient` — writes to `./data/db/` |
| `tavily_client` | `TavilyClient` or `None` when `TAVILY_API_KEY` absent |
| `embeddings_model` | LangChain `OpenAIEmbeddings` (`text-embedding-3-small`) |
| `text_splitter` | `RecursiveCharacterTextSplitter` (chunk 1500, overlap 300) |
| `limiter` | Flask-Limiter (lazy — bound to Flask app via `limiter.init_app(app)`) |

Per-user state is managed lazily via three `dict` caches in `extensions.py` (keyed by `user_id`):
- `_collection_map` → ChromaDB collection (`documents_u{user_id}`)
- `_bm25_map` → BM25 index (rebuilt from ChromaDB on first access or after upload)
- `_images_map` → `{filename: {base64, mime}}`; cleared on server restart

**User model fields** (`models/__init__.py`):
Core: `email`, `password_hash`, `first_name`, `last_name`, `role`, `plan_type`, `subscription_end_date`.
Usage counters: `uploads_this_month`, `upload_month_key`, `questions_this_month`, `question_month_key`.
Onboarding: `country`, `institution`, `degree_type`, `primary_major`, `secondary_major`.

**Schema migrations** are idempotent `ALTER TABLE` statements at the bottom of `models/__init__.py`. Every new column added to the `User` class must also get a corresponding migration statement there — the `try/except` silently skips columns that already exist.

**Document isolation model:**
Each user owns a separate ChromaDB collection (`documents_u{user_id}`). File IDs are MD5 hex of the filename. The `UserDocument` SQL table is the authoritative ownership registry — every vector query validates ownership there before touching ChromaDB (defence-in-depth).

**Auth (`@token_required` / `@admin_required`):**
JWT HS256, 24 h TTL, `SECRET_KEY` from env. Two decorators inject `user_id` as the first function argument. Dual login modes: 6-digit OTP magic link and password. Rate limiting via Flask-Limiter (bucketed by `user_id` for auth'd requests, IP otherwise; `storage_uri="memory://"` — not distributed).

**User / plan system:**
`role`: `'user'` | `'admin'`. `plan_type`: `'basic'` | `'pro'` | `'semester'`. Monthly counters (`uploads_this_month`, `questions_this_month`) reset automatically when the month key changes. `ADMIN_EMAIL` env var auto-promotes that account on every login.

**File upload pipeline (`/upload-pdf`):**
Accepts PDF, PPTX, PNG/JPG/JPEG. PDFs → PyMuPDF (`fitz`) in-memory (preserves Hebrew logical order). PPTX → `extract_pptx_text()`, slides prefixed `[שקופית N]`. Images → base64 in `_user_images_map` (not indexed). Text chunks → embedded → upserted into ChromaDB; old chunks for the same file purged first.

**Retrieval (`hybrid_search`):**
Combines ChromaDB cosine similarity and BM25 via Reciprocal Rank Fusion (RRF constant 60). `tokenize_hebrew()` strips niqqud/cantillation before BM25. Returns `TOP_K=8` chunks.

**Q&A flow (`/ask`) — SSE stream:**
1. Create/resume `ChatSession` in SQLite; save user message.
2. Short queries (< 5 words) enriched with prior user question before embedding.
3. `hybrid_search` retrieves chunks.
4. LLM call with two OpenAI tools: `code_interpreter` and `search_web` (Tavily).
5. `code_interpreter` → `execute_python_code()` in daemon thread (25 s timeout); captures stdout + matplotlib figures as base64 PNG. Safety net: extracts and runs bare ` ```python ` blocks if the LLM forgets to call the tool.
6. Non-empty `_user_images_map` → message sent as OpenAI multi-part array (text + image_url), activating vision.
7. Events: `{type:"status", phase}` → `{type:"result", ...}` | `{type:"error"}`.

**Export routes:**
- `/export-pdf` — `markdown` lib → HTML → WeasyPrint (requires system `pango`). Hebrew RTL styling.
- `/export-docx` — custom Markdown+LaTeX → python-docx. `$$...$$` blocks pre-processed to sentinel markers. Inline math in Cambria Math (blue), block equations centred. `w:bidi` on all paragraphs for RTL.

### Backend API surface

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | GET | — | Liveness; reports ChromaDB chunk count |
| `/api/check-email` | POST | — | Check if email is registered |
| `/api/send-otp` | POST | — | Send 6-digit OTP for magic-link login |
| `/api/verify-otp` | POST | — | Verify OTP → issue JWT |
| `/api/login` | POST | — | Password login → issue JWT |
| `/api/register` | POST | — | Create account |
| `/api/forgot-password` | POST | — | Send password-reset email |
| `/api/reset-password` | POST | — | Complete password reset |
| `/api/refresh-token` | GET | user | Issue fresh JWT |
| `/api/profile` | GET, PATCH | user | Get/update profile (returns onboarding fields) |
| `/api/user/onboarding` | POST | user | Save country, institution, degree_type, primary_major, secondary_major |
| `/api/usage` | GET | user | Monthly upload/question counters |
| `/api/stats` | GET | user | Aggregate usage stats |
| `/api/transcribe` | POST | user | Audio → text (Whisper) |
| `/upload-pdf` | POST | user | Upload PDF / PPTX / images |
| `/documents` | GET | user | List user's indexed files |
| `/documents/<file_id>` | DELETE | user | Delete a document |
| `/ask` | POST | user | RAG Q&A, SSE stream |
| `/sessions` | GET | user | List chat sessions |
| `/sessions/<id>` | GET | user | Fetch session messages |
| `/sessions/<id>` | DELETE | user | Delete session |
| `/generate-paper` | POST | user | Write academic paper from docs |
| `/api/generate-quiz` | POST | user | Generate quiz from docs |
| `/export-pdf` | POST | user | Markdown → PDF |
| `/export-docx` | POST | user | Markdown+LaTeX → DOCX |
| `/api/admin/users` | GET | admin | List all users |
| `/api/admin/users/<id>/gift-pro` | PATCH | admin | Grant pro plan |
| `/api/admin/users/<id>/gift-semester` | PATCH | admin | Grant semester plan |
| `/api/admin/users/<id>/reset-limits` | POST | admin | Reset usage counters |

### Frontend — `frontend/`

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · `react-dropzone` v15

> **Warning:** This Next.js version has breaking changes from older releases. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

**API call patterns — two distinct approaches exist:**

1. **Server-side proxy** (`app/api/flask/[...path]/route.ts`): catches `GET/POST/PATCH/PUT/DELETE /api/flask/*` and forwards to Flask using the server-only `API_URL` env var. Zero browser CORS. Currently used by some pages.

2. **Direct browser calls**: `app/workspace/page.tsx` calls Flask directly at the hardcoded `const API = 'http://127.0.0.1:5003'`. `app/admin/page.tsx` uses `NEXT_PUBLIC_API_URL`. Both attach `Authorization: Bearer <token>` from localStorage.

**Auth (client-side):**
JWT stored in `localStorage` key `levy_ai_token`. Helper `authFetch()` reads it, checks `exp` claim for proactive expiry, and redirects to `/?login=true` on 401. `_clearAuth()` in `workspace/page.tsx` clears all user keys and the session cookie. **`_AUTH_KEYS` must stay in sync** with every localStorage key the app writes — if you add a new key anywhere, add it to that array too:

```typescript
// workspace/page.tsx
const _AUTH_KEYS = [
  'levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name',
  'levy_ai_institution', 'levy_ai_primary_major', 'levy_ai_degree_type',
  'levy_ai_country', 'levy_ai_secondary_major',
] as const;
```

**Onboarding flow:**
After registration, users land on `/onboarding` where they set country, institution (async combobox fetching from `https://universities.hipolabs.com`), degree type, and majors. Onboarding data is saved to the backend via `POST /api/user/onboarding` and mirrored into localStorage. The workspace reads onboarding fields from localStorage on mount; fresh data from `GET /api/stats` updates them on load.

**Key conventions:**
- **Tailwind v4** — CSS-first config only. No `tailwind.config.ts`. All config in `app/globals.css` via `@import "tailwindcss"` and `@theme inline`. Always write complete class strings (no dynamic construction).
- **RTL Hebrew** — `LanguageProvider` (`app/providers/language.tsx`) toggles `document.documentElement.dir` between `rtl`/`ltr` and saves to `localStorage('levy_ai_lang')`. In RTL flex-row, `justify-start` aligns to the right — message alignment is intentionally inverted vs. English. **Always use `dir={lang === 'he' ? 'rtl' : 'ltr'}` — never hardcode `dir="rtl"`.** Setting `dir` on an element makes CSS logical properties (`insetInlineEnd`, etc.) resolve relative to that element's own direction, not the document's — this causes positioning bugs in the other language.
- **Matcha design tokens** — all UI uses these values consistently: primary green `#517B3E`, dark green `#2A3B22`, focus ring `rgba(81,123,62,0.15)`, sidebar background `rgba(217,235,208,0.97)`, page background `#e8e4d9` (onboarding) / `#F7F5EF` (workspace). Border `rgba(200,190,170,0.75)` for form inputs, `rgba(100,140,80,0.2)` for sidebar dividers.
- **KaTeX** — `katex/dist/katex.min.css` imported in `layout.tsx`. Workspace uses `remark-math` + `rehype-katex` to render `$...$` / `$$...$$`.
- **Workspace tab persistence** — both `ChatInterface` and `PaperWriter` are always mounted; inactive tab hidden with `hidden`. `key={chatKey}` on `ChatInterface` is intentional — changing it forces a full remount.
- **File upload caution** — `handleRemoveFile` must NOT call `onRemove` inside the `setUploadedFiles` updater (causes "Cannot update a component while rendering"). Image previews from `URL.createObjectURL()` must be revoked in `handleRemoveFile`.
- **i18n** — `app/locales/landing.ts` holds the bilingual string table for the landing page. Workspace strings are inline in `workspace/page.tsx` in a `translations` object keyed by `'he' | 'en'`. All components that need bilingual text — including inline components like `LogoutConfirmModal` — call `useLanguage()` directly to get `lang`; they do not receive it as a prop. The idiomatic pattern is `const he = lang === 'he'` then `he ? 'hebrew text' : 'english text'`. Extracted components (`UserProfileModal.tsx`) also call `useLanguage()` internally. Never hardcode Hebrew strings in JSX outside the `translations` object.

**`workspace/page.tsx` structure:**
The file is very large (~2500 lines). All modal components except `UserProfileModal` are defined inline in this file in this order: `CodeExecutionBlock` → `QuizModal` → `LogoutConfirmModal` → `Sidebar` → `Home` (root page). Modals are extracted to separate files only when their props surface is large and they need their own routing context (e.g., `UserProfileModal.tsx`).

**z-index layering (workspace):**

| Layer | Value | What |
|---|---|---|
| Sidebar backdrop | `z-40` | Dim overlay when sidebar is open |
| Sidebar panel | `z-50` | Slide-in drawer |
| Quiz / profile modals | `z-50` / `z-[60]` | Content modals |
| Logout confirm modal | `z-[70]` | Appears above all other modals |
| Rate-limit toast | `z-[9999]` | Always on top |

**Back-button interception:**
The workspace intercepts the browser Back button to show a logout confirmation instead of navigating away. The pattern: on mount push an extra history entry (`window.history.pushState(null, '', window.location.href)`), then listen for `popstate` — when fired, re-push to stay on the page and open `LogoutConfirmModal`. Logout itself uses `window.location.href = '/'` (hard redirect) to ensure all React state is flushed after `_clearAuth()`.

**Logout routing rule:**
Every logout entry point (avatar dropdown, sidebar button, `UserProfileModal`, Back button) MUST call `setShowLogoutModal(true)` — never call `handleLogout()` directly from a button. `handleLogout` is bound only to `LogoutConfirmModal.onConfirm`. This is enforced; verify with `grep "handleLogout" workspace/page.tsx` which should show only the function definition and the `onConfirm` prop assignment.

**Language hydration:**
`LanguageProvider` always initializes `lang` to `'he'` (matching `layout.tsx`'s `<html lang="he" dir="rtl">`). It reads `localStorage` only in a `useEffect` after mount and guards `document.documentElement` mutations behind a `mounted` flag. The `<html>` element has `suppressHydrationWarning` because the mounted effect later mutates its `lang`/`dir` attributes directly. Never reintroduce a `useState` lazy initializer that reads `localStorage` — this breaks SSR hydration because `window` is available during client hydration but not on the server.

**Combobox pattern (onboarding):**
`onboarding/page.tsx` implements accessible comboboxes without a library:
- Use `onMouseDown + e.preventDefault()` on dropdown items (not `onClick`) to prevent input blur from closing the dropdown before the selection registers.
- Move any `setState` calls that clear options out of `useEffect` bodies and into `onChange` handlers to satisfy the `react-hooks/set-state-in-effect` ESLint rule — no synchronous `setState` in effect bodies is permitted.
- Click-outside via a `mousedown` listener on `document`; refs on wrapper `<div>` elements.

**ESLint gotcha:**
The rule `react-hooks/set-state-in-effect` is active. Any `setState()` call that appears synchronously in a `useEffect` body (even in an early-return branch) will error. Move such calls to event handlers or inside async callbacks/`setTimeout`.

### Data persistence

| Store | Location | Contents | Cleared by |
|---|---|---|---|
| ChromaDB | `backend/data/db/` | Per-user text chunks + embeddings | Manual deletion or re-upload |
| SQLite | `backend/data/chat.db` | Users, sessions, messages, OTP codes, reset tokens, document ownership | Manual deletion |
| BM25 index | Memory | Per-user; rebuilt from ChromaDB on first access | Server restart |
| Images | Memory | Per-user base64 uploads | Server restart |

To fully wipe all data and start fresh: delete `backend/data/` then recreate `backend/data/db/` (empty). The app recreates `chat.db` on next startup.

### Utility scripts

- `backend/export_users.py` — dumps all users from `chat.db` to `users_export.csv`
- `backend/scripts/make_admin.py <email>` — promotes a user to `role='admin'` directly in SQLite (run once; user must re-login for new JWT)

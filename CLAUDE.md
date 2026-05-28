# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

```
.
├── start.py                # Unified startup: runs Flask + Next.js in parallel
├── backend/
│   ├── app.py              # Entry point: Flask app, CORS, limiter, blueprint registration
│   ├── extensions.py       # Shared singletons: OpenAI, ChromaDB, limiter, per-user caches
│   ├── models/
│   │   └── __init__.py     # SQLAlchemy models + DB engine + SessionLocal + migrations
│   ├── api/
│   │   ├── middleware.py   # token_required, admin_required, _get_user_refreshed
│   │   ├── auth.py         # Auth blueprint (login, OTP, register, profile, onboarding, etc.)
│   │   ├── documents.py    # Documents/RAG blueprint (upload, ask, sessions)
│   │   ├── admin.py        # Admin blueprint + CFO agent + proactive scheduler
│   │   ├── professor.py    # Professor Brain Simulator blueprint
│   │   └── export.py       # Export blueprint (paper, quiz, PDF, DOCX) + all /api/mastery/* routes
│   ├── services/
│   │   ├── rag.py          # hybrid_search, BM25, get_user_collection
│   │   ├── security.py     # DLP filter, PII redaction, HTML stripping
│   │   ├── email.py        # OTP + reset email (SMTP / Resend / terminal)
│   │   ├── pdf.py          # PPTX text/slide extraction
│   │   ├── code_runner.py  # Python sandbox (matplotlib Agg backend set here)
│   │   └── startup.py      # Background backfill threads + orphan session migration
│   ├── data/               # gitignored persistent storage
│   │   ├── db/             # ChromaDB vector store
│   │   └── chat.db         # SQLite (users, sessions, messages)
│   ├── requirements.txt
│   ├── .env.example
│   ├── export_users.py
│   └── scripts/
│       ├── make_admin.py   # Promote user to admin
│       └── seed_payments.py # Seed test payment data
└── frontend/
    ├── middleware.ts                           # Next.js /admin route guard (pass-through; security at Flask layer)
    ├── src/
    │   ├── components/
    │   │   ├── CoursePill.tsx    # Global course selector pill — self-contained (calls useCourse + useLanguage)
    │   │   ├── NoCourseState.tsx # Fixed-overlay empty state shown when no course is selected
    │   │   └── TopBar.tsx        # Persistent top bar component (currently unused in layout)
    │   ├── context/
    │   │   └── CourseContext.tsx  # Re-export shim for providers/course.tsx
    │   └── app/
    │       ├── page.tsx                        # Landing page + auth modal (WORKSPACE_ROUTE = '/dashboard')
    │       ├── layout.tsx                      # Root layout: LanguageProvider → CourseProvider → AuthProvider
    │       ├── globals.css                     # Tailwind v4 entry + keyframes + matcha design tokens
    │       ├── login/page.tsx                  # Login page
    │       ├── register/page.tsx               # Registration page
    │       ├── reset-password/page.tsx         # Password reset completion
    │       ├── onboarding/page.tsx             # Post-registration onboarding form
    │       ├── dashboard/page.tsx              # Course Hub Home — greeting + hero stat cards + course selector/focus view
    │       ├── profile/page.tsx                # Profile page
    │       ├── mastery/page.tsx                # Skill mastery — dynamic topics from RAG + quiz modal + score tracking
    │       ├── workspace/
    │       │   ├── page.tsx                    # Main RAG workspace (~2500 lines; Sidebar + Home component inline)
    │       │   ├── UserProfileModal.tsx        # User profile modal (extracted component)
    │       │   ├── UpgradeModal.tsx            # Plan upgrade modal (Pro/Semester pricing)
    │       │   └── professor-simulator/
    │       │       └── page.tsx                # Professor Brain Simulator feature
    │       ├── admin/
    │       │   ├── page.tsx                    # Admin dashboard
    │       │   └── AiAccountantChat.tsx        # CFO AI accountant chat component
    │       ├── api/flask/[...path]/route.ts    # Server-side Flask proxy
    │       └── providers/
    │           ├── auth.tsx                    # Global AuthProvider + useAuth hook
    │           ├── language.tsx               # Lang context (he/en)
    │           └── course.tsx                 # Global CourseProvider + useCourse hook + COURSES array
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
# Option A — unified launcher (recommended for development)
python start.py          # runs both Flask + Next.js in a single terminal

# Option B — two terminals
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
| `RESET_DB` | Set to `1` to perform a full data wipe on next startup (drops + recreates SQLite tables and all ChromaDB collections), then exits | — |

Frontend env lives in `frontend/.env.local`:

| Variable | Purpose |
|---|---|
| `API_URL` | Server-only Flask URL used by the Next.js proxy route |
| `NEXT_PUBLIC_API_URL` | Browser-visible Flask URL used by the admin page |

## Architecture

Full-stack RAG app branded **U-Note** for Hebrew-speaking university students. Students upload study materials and ask questions in Hebrew or English, or generate full academic papers. The app also has a skill-mastery system and a professor brain simulator.

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
Usage counters: `uploads_this_month`, `upload_month_key`, `questions_this_month`, `question_month_key`, `prof_sims_this_month`, `prof_sim_month_key`.
Onboarding: `country`, `institution`, `degree_type`, `primary_major`, `secondary_major`, `gender`, `study_year`, `ai_style`.

**Additional models** (`models/__init__.py`):
- `Payment` — financial transactions (ILS). Fields: `user_id`, `amount`, `currency`, `plan_type` (`'monthly'`|`'semester'`), `status` (`'completed'`|`'failed'`|`'refunded'`|`'pending'`), `payment_date`, `description`. Populated via `backend/scripts/seed_payments.py` for testing.
- `CfoNotification` — proactive CFO alerts. Fields: `title`, `message`, `type` (`'info'`|`'warning'`|`'critical'`), `is_read`, `created_at`. Written daily by `analyze_financial_health()` in `api/admin.py`.
- `TopicMastery` — per-user mastery score per uploaded document. Fields: `user_id`, `file_id` (MD5 hex from `UserDocument`), `topic` (display name), `mastery_pct` (0–100 float), `quiz_count`, `last_updated`. Unique constraint on `(user_id, file_id)`. All mastery routes live in `api/export.py`.

**Schema migrations** are idempotent `ALTER TABLE` statements at the bottom of `models/__init__.py`. Every new column added to the `User` class must also get a corresponding migration statement there — the `try/except` silently skips columns that already exist. New tables are created automatically by `_Base.metadata.create_all()`.

**Document isolation model:**
Each user owns a separate ChromaDB collection (`documents_u{user_id}`). File IDs are MD5 hex of the filename. The `UserDocument` SQL table is the authoritative ownership registry — every vector query validates ownership there before touching ChromaDB (defence-in-depth).

**Auth (`@token_required` / `@admin_required`):**
JWT HS256, 24 h TTL, `SECRET_KEY` from env. Two decorators inject `user_id` as the first function argument. Dual login modes: 6-digit OTP magic link and password. Rate limiting via Flask-Limiter (bucketed by `user_id` for auth'd requests, IP otherwise; `storage_uri="memory://"` — not distributed).

**User / plan system:**
`role`: `'user'` | `'admin'`. `plan_type`: `'basic'` | `'pro'` | `'semester'`. Monthly counters (`uploads_this_month`, `questions_this_month`) reset automatically when the month key changes. `ADMIN_EMAIL` env var auto-promotes that account on every login.

**File upload pipeline (`/upload-pdf`):**
Accepts PDF, PPTX, PNG/JPG/JPEG. PDFs → PyMuPDF (`fitz`) in-memory (preserves Hebrew logical order). PPTX → `extract_pptx_text()`, slides prefixed `[שקופית N]`. Images → base64 in `_user_images_map` (not indexed). Text chunks → embedded → upserted into ChromaDB; old chunks for the same file purged first.

**Retrieval (`hybrid_search`):**
Combines ChromaDB cosine similarity and BM25 via Reciprocal Rank Fusion (RRF constant 60). `tokenize_hebrew()` strips niqqud/cantillation before BM25. Returns `TOP_K=8` chunks. Accepts optional `file_id` to restrict to a single document.

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

**Mastery system (`api/export.py`):**
All four mastery routes live in the `export_bp` blueprint:
- `GET /api/mastery/topics` — joins `UserDocument` + `TopicMastery` for the user; returns `[{file_id, topic, icon, mastery_pct|null, quiz_count}]`. Returns `[]` when no uploads.
- `POST /api/mastery/generate-quiz` — accepts `topic` + optional `file_id`. Validates file ownership, runs `hybrid_search` scoped to that file, calls `gpt-4o` with `response_format: json_object`. Returns 3 `{question, options[4], correct_answer}` objects.
- `POST /api/mastery/submit-results` — accepts `topic`, `file_id` (32-char MD5), `score`, `total`. Validates file ownership. Weighted update formula: `new = existing * 0.4 + (score/total*100) * 0.6`. First quiz seeds from neutral 50%. Returns `{mastery_pct, file_id, topic}`.
- `GET /api/mastery/scores` — returns all `TopicMastery` records for the user.

**Professor Brain Simulator (`api/professor.py`):**
`POST /api/professor-simulator/ask` — simulates a named professor as an academic examiner.
- Accepts `professor_name`, `exam_style`, `trap_types[]`, `topics`, `question`, `history[]`, `file_ids[]`.
- Uses `gpt-4o` (not `gpt-4o-mini`). Retrieves RAG context per file via `hybrid_search`.
- Rate limited to 2 simulations/month for basic plan (`prof_sims_this_month` + `prof_sim_month_key` counters).
- File ownership validated before RAG retrieval (defence-in-depth — same pattern as `/ask`).
- Responds in Hebrew unless the user questions in English. Returns `{reply, context_chunks_used, professor_name, status}`.

**Admin / CFO features (`api/admin.py`):**
- `POST /api/admin/ai-accountant` — simple CFO chat (stateless, injects `context` JSON blob).
- `POST /api/admin/ai-accountant/chat` — **agentic CFO** using native OpenAI function calling (no LangChain). Four tools: `calculate_monthly_revenue`, `get_new_subscriptions_count`, `get_platform_financial_summary`, `calculate_tax_obligation` (Israeli 2024 brackets + Bituach Leumi). Also returns a `chartData` field for inline chart rendering (`bar`/`area`).
- CFO alert scheduler (`start_cfo_scheduler()`) — APScheduler daily cron at 09:00 UTC + one 30 s startup run. Checks: Osek Patur threshold (warns at 90%, critical at 95%), churn (≥20% weekly drop), revenue growth milestone (≥20% MoM). Deduplicates alerts by title within a sliding window. Called in `app.py` after `start_background_threads()`.

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
| `/api/mastery/topics` | GET | user | List all user's uploaded docs with mastery scores |
| `/api/mastery/generate-quiz` | POST | user | Generate 3-question quiz via gpt-4o + RAG (accepts `topic`, `file_id`) |
| `/api/mastery/submit-results` | POST | user | Save quiz score; weighted mastery update |
| `/api/mastery/scores` | GET | user | Raw mastery records for the user |
| `/api/admin/users` | GET | admin | List all users |
| `/api/admin/users/<id>/gift-pro` | PATCH | admin | Grant pro plan |
| `/api/admin/users/<id>/gift-semester` | PATCH | admin | Grant semester plan |
| `/api/admin/users/<id>/reset-limits` | POST | admin | Reset usage counters |
| `/api/admin/ai-accountant` | POST | admin | Simple CFO chat (stateless) |
| `/api/admin/ai-accountant/chat` | POST | admin | Agentic CFO with function calling + chart data |
| `/api/admin/notifications` | GET | admin | List proactive CFO alerts (unread first) |
| `/api/admin/notifications/<id>/read` | POST | admin | Mark notification read |
| `/api/admin/notifications/read-all` | POST | admin | Mark all notifications read |
| `/api/professor-simulator/ask` | POST | user | Professor Brain Simulator (gpt-4o, RAG-grounded) |

### Frontend — `frontend/`

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · `react-dropzone` v15

> **Warning:** This Next.js version has breaking changes from older releases. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

**Post-login redirect:** After successful login/OTP, `page.tsx` routes to `WORKSPACE_ROUTE = '/dashboard'` (the Course Hub Home, not `/workspace`).

**Provider tree** (`layout.tsx`):
```
LanguageProvider → CourseProvider → AuthProvider → {children}
```
All three providers must remain in this order. The `CourseProvider` wraps `AuthProvider` so the course context is available to every authenticated page.

**API call patterns — two distinct approaches exist:**

1. **Server-side proxy** (`app/api/flask/[...path]/route.ts`): catches `GET/POST/PATCH/PUT/DELETE /api/flask/*` and forwards to Flask using the server-only `API_URL` env var. Zero browser CORS. Currently used by some pages.

2. **Direct browser calls**: `app/workspace/page.tsx` calls Flask directly at the hardcoded `const API = 'http://127.0.0.1:5003'`. `app/admin/page.tsx` uses `NEXT_PUBLIC_API_URL`. Both attach `Authorization: Bearer <token>` from localStorage.

**Auth (client-side):**
JWT stored in `localStorage` key `levy_ai_token`. New pages should use the global `AuthProvider` (`app/providers/auth.tsx`) and the `useAuth()` hook rather than reading localStorage directly. The provider exposes `user`, `isLoading`, `updateToken`, and `logout`.

The canonical list of localStorage keys is `AUTH_KEYS` exported from `providers/auth.tsx`. **Keep this list in sync** with every `localStorage.setItem` call in the app — if you add a new key anywhere, add it here too:

```typescript
// providers/auth.tsx
export const AUTH_KEYS = [
  'levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name',
  'levy_ai_institution', 'levy_ai_primary_major', 'levy_ai_degree_type',
  'levy_ai_country', 'levy_ai_secondary_major', 'levy_ai_gender',
] as const;
```

`workspace/page.tsx` still has its own local `_AUTH_KEYS` constant — **that array must mirror `AUTH_KEYS` above exactly**. Prefer `useAuth()` in new code.

**Course context (`providers/course.tsx`):**
`CourseProvider` / `useCourse()` / `COURSES` array. Persists `selectedCourse: { id, name, icon, color } | null` to `localStorage('levy_ai_course')`. Three fixed course definitions: `infi1`, `ds`, `phys`. Reading from localStorage is done via `Promise.resolve().then(setState)` to satisfy the `react-hooks/set-state-in-effect` ESLint rule. When a course is selected, `workspace/page.tsx`, `mastery/page.tsx`, and `professor-simulator/page.tsx` show a `NoCourseState` overlay (fixed z-80) if no course is active. The backend currently ignores `?course=` query params — filtering is frontend-only.

**Onboarding flow:**
After registration, users land on `/onboarding` where they set country, institution (async combobox fetching from `https://universities.hipolabs.com`), degree type, and majors. Onboarding data is saved to the backend via `POST /api/user/onboarding` and mirrored into localStorage. The workspace reads onboarding fields from localStorage on mount; fresh data from `GET /api/stats` updates them on load.

**Key conventions:**
- **Tailwind v4** — CSS-first config only. No `tailwind.config.ts`. All config in `app/globals.css` via `@import "tailwindcss"` and `@theme inline`. Always write complete class strings (no dynamic construction).
- **RTL Hebrew** — `LanguageProvider` toggles `document.documentElement.dir` between `rtl`/`ltr` and saves to `localStorage('levy_ai_lang')`. **Always use `dir={lang === 'he' ? 'rtl' : 'ltr'}` — never hardcode `dir="rtl"` or use `flex-row-reverse` to simulate RTL.** Setting `dir` on an element makes CSS logical properties (`insetInlineEnd`, etc.) resolve relative to that element's own direction — this causes positioning bugs in the other language.
- **Creamy Matcha design tokens** — the active design system uses these values:
  - Global body background: `#F9FCFA`; primary text: `#1C3329`; secondary text: `#527061`
  - Page headers: creamy glass `rgba(255,255,255,0.82)` + `backdropFilter: blur(16px)` + `border-b #E2EBE5` — **no solid green headers**
  - Sidebar panels: `rgba(255,255,255,0.94)` with `backdropFilter: blur(20px)` + `border-inline-end #E2EBE5`
  - Active nav items: `background: #D1E6D9; color: #183025` — a soft matcha pill
  - Inactive nav items: `text-[#1C3329]/70 hover:bg-[#EEF5F0]`
  - Accent green (legacy, still used in buttons/progress): `#517B3E` / `#2A3B22`
  - `CoursePill` component: `bg-white border-[#D3E0D8] text-[#1C3329] hover:bg-[#EEF5F0]`
  - `globals.css` defines custom `@theme inline` tokens `--color-matcha-50` through `--color-matcha-950`, `@keyframes masteryPulse`, `oasisGlow`, `subtleDrift`, `jewelGlow`, and utility classes `.animate-mastery-pulse`, `.animate-jewel-glow`, etc.
- **KaTeX** — `katex/dist/katex.min.css` imported in `layout.tsx`. Workspace uses `remark-math` + `rehype-katex` to render `$...$` / `$$...$$`.
- **Workspace tab persistence** — both `ChatInterface` and `PaperWriter` are always mounted; inactive tab hidden with `hidden`. `key={chatKey}` on `ChatInterface` is intentional — changing it forces a full remount.
- **File upload caution** — `handleRemoveFile` must NOT call `onRemove` inside the `setUploadedFiles` updater (causes "Cannot update a component while rendering"). Image previews from `URL.createObjectURL()` must be revoked in `handleRemoveFile`.
- **i18n** — `app/locales/landing.ts` holds the bilingual string table for the landing page. Workspace strings are inline in `workspace/page.tsx` in a `translations` object keyed by `'he' | 'en'`. All components that need bilingual text call `useLanguage()` directly — they do not receive `lang` as a prop. The idiomatic pattern is `const he = lang === 'he'` then `he ? 'hebrew text' : 'english text'`. Never hardcode Hebrew strings in JSX outside the translations object.

**Dashboard (`dashboard/page.tsx`):**
The Course Hub Home — the primary entry point after login. Contains:
- `DashboardSidebar` inline component (same pattern as other pages' sidebars)
- Hero stat cards (3 coloured panels: pale matcha `#EAF3ED`, warm cream `#F4F1EA`, soft sage `#E3EBE6`) showing documents / sessions / messages from `/api/stats`
- **Course Selector view** (when `selectedCourse === null`): grid of `CourseOptionCard` buttons using `COURSES` from `providers/course.tsx`
- **Course Focus view** (when course selected): `CrystalCard` quick actions + `MaterialRow` list from `/api/mastery/topics`
- `CoursePill` in the header right section (next to the language toggle)
- All color logic centralised in a `D` design-token object at the top of the file

**Mastery page (`mastery/page.tsx`, ~1100 lines):**
- On mount fetches `/api/mastery/topics?course=${selectedCourse?.id}` → `topics: GapCard[]` state
- `GapCard` interface: `{ id: string (file_id), icon, topic, mastery: number|null, quiz_count }`
- Quiz modal has states: `closed → loading → active → done`; `submitState: idle → loading → success → error`
- On last question answered, calls `submitResults(quizTopic, quizFileId, score, total)` which POSTs to `/api/mastery/submit-results` and mutates the `topics` array live
- Gradient progress bar: `linear-gradient(90deg,#ef4444,#f97316,#eab308,#84cc16,#517B3E)` with `animate-mastery-pulse` CSS class
- Shows `NoCourseState` overlay when `selectedCourse === null`

**`workspace/page.tsx` structure:**
The file is very large (~2500 lines). All modal components except `UserProfileModal` are defined inline in this file in this order: `CodeExecutionBlock` → `QuizModal` → `LogoutConfirmModal` → `Sidebar` → `Home` (root page). Modals are extracted to separate files only when their props surface is large and they need their own routing context (e.g., `UserProfileModal.tsx`). The `Sidebar` component calls `useCourse()` directly to show/clear the active course indicator. The `Home` component also calls `useCourse()` and renders `<NoCourseState />` as a z-80 fixed overlay when no course is selected.

**z-index layering (workspace):**

| Layer | Value | What |
|---|---|---|
| Sidebar backdrop | `z-40` | Dim overlay when sidebar is open |
| Sidebar panel | `z-50` | Slide-in drawer |
| Quiz / profile modals | `z-50` / `z-[60]` | Content modals |
| Logout confirm modal | `z-[70]` | Appears above all other modals |
| NoCourseState overlay | `z-[80]` | Blocks page interaction until course selected |
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

**ESLint critical rule:**
The rule `react-hooks/set-state-in-effect` is active. Any `setState()` call that appears synchronously in a `useEffect` body will error. The correct pattern for async-equivalent calls is:
```typescript
// Reading localStorage in an effect (e.g. providers/course.tsx):
Promise.resolve(localStorage.getItem('key'))
  .then(val => { if (val) setState(parse(val)); });

// Waiting for a fetch to complete:
fetch(url).then(...).finally(() => setLoading(false));
```

### Data persistence

| Store | Location | Contents | Cleared by |
|---|---|---|---|
| ChromaDB | `backend/data/db/` | Per-user text chunks + embeddings | Manual deletion or re-upload |
| SQLite | `backend/data/chat.db` | Users, sessions, messages, OTP codes, reset tokens, document ownership, payments, CFO notifications, mastery scores | Manual deletion or `RESET_DB=1` |
| BM25 index | Memory | Per-user; rebuilt from ChromaDB on first access | Server restart |
| Images | Memory | Per-user base64 uploads | Server restart |
| Active course | `localStorage('levy_ai_course')` | `{id, name, icon, color}` JSON | User clicks ✕ on CoursePill or clears localStorage |

To fully wipe all data and start fresh: delete `backend/data/` then recreate `backend/data/db/` (empty). The app recreates `chat.db` on next startup.

### Utility scripts

- `backend/export_users.py` — dumps all users from `chat.db` to `users_export.csv`
- `backend/scripts/make_admin.py <email>` — promotes a user to `role='admin'` directly in SQLite (run once; user must re-login for new JWT)
- `backend/scripts/seed_payments.py` — inserts synthetic `Payment` rows for testing the CFO dashboard charts and financial calculations

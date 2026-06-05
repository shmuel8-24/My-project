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
│   │   ├── courses.py      # Courses blueprint: parse-syllabus, save, update, delete, update-syllabus
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
    │   │   └── NoCourseState.tsx # Fixed-overlay empty state shown when no course is selected
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
    │       ├── settings/page.tsx               # Settings page
    │       ├── academic-writing/page.tsx       # AI co-writing feature (paragraph-by-paragraph)
    │       ├── mastery/page.tsx                # Skill mastery — dynamic topics from RAG + quiz modal + score tracking
    │       ├── course-picker/
    │       │   ├── page.tsx                    # Course list — shows only customCourses; 3-dots menu per card
    │       │   ├── add/page.tsx                # Add Course wizard (3 steps + optional Step 0 syllabus upload)
    │       │   └── edit/[id]/page.tsx          # Edit Course wizard (pre-filled; optional syllabus re-upload)
    │       ├── workspace/
    │       │   ├── page.tsx                    # Main RAG workspace (~2500 lines; Sidebar + Home component inline)
    │       │   ├── UserProfileModal.tsx        # User profile modal (extracted component)
    │       │   ├── UpgradeModal.tsx            # Plan upgrade modal (Pro/Semester pricing)
    │       │   └── professor-simulator/
    │       │       └── page.tsx                # Professor Brain Simulator feature
    │       ├── admin/
    │       │   ├── page.tsx                    # Admin dashboard
    │       │   └── AiAccountantChat.tsx        # CFO AI accountant chat component
    │       ├── api/flask/[...path]/route.ts    # Server-side Flask proxy (exports GET/POST/PATCH/PUT/DELETE)
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

**Python runtime note:** `fitz` (PyMuPDF) is not installed in the `.venv` — it lives in `/opt/anaconda3/envs/New_env_conda/`. When testing backend imports that use `fitz`, run via `/opt/anaconda3/envs/New_env_conda/bin/python`. `start.py` uses `.venv/bin/python` for Flask.

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

Full-stack RAG app branded **U-Note** for Hebrew-speaking university students. Students upload study materials and ask questions in Hebrew or English, or generate full academic papers. The app also has a skill-mastery system, a professor brain simulator, and a course management system with AI-powered syllabus parsing.

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
- `Payment` — financial transactions (ILS). Fields: `user_id`, `amount`, `currency`, `plan_type` (`'monthly'`|`'semester'`), `status` (`'completed'`|`'failed'`|`'refunded'`|`'pending'`), `payment_date`, `description`.
- `CfoNotification` — proactive CFO alerts. Fields: `title`, `message`, `type` (`'info'`|`'warning'`|`'critical'`), `is_read`, `created_at`.
- `TopicMastery` — per-user mastery score per uploaded document. Fields: `user_id`, `file_id` (MD5 hex from `UserDocument`), `topic`, `mastery_pct` (0–100 float), `quiz_count`, `last_updated`. Unique on `(user_id, file_id)`. All mastery routes live in `api/export.py`.
- `CustomCourse` — user-created course with optional syllabus for RAG. Fields: `user_id`, `course_name`, `lecturer_name`, `has_tirgul` (bool), `ta_name`, `semester` (`'a'`|`'b'`|`'summer'`), `color`, `full_syllabus_text` (Text), `syllabus_file_id` (16-char MD5 linking to `UserDocument` + ChromaDB). Course name is the identity key used in all backend operations — do not rename it without also renaming the ChromaDB chunks.

**Schema migrations** are idempotent `ALTER TABLE` statements at the bottom of `models/__init__.py`. Every new column added to the `User` class must also get a corresponding migration statement there — the `try/except` silently skips columns that already exist. New tables are created automatically by `_Base.metadata.create_all()`.

**Document isolation model:**
Each user owns a separate ChromaDB collection (`documents_u{user_id}`). File IDs are MD5 hex of the filename. The `UserDocument` SQL table is the authoritative ownership registry — every vector query validates ownership there before touching ChromaDB (defence-in-depth).

**Auth (`@token_required` / `@admin_required`):**
JWT HS256, 24 h TTL, `SECRET_KEY` from env. Two decorators inject `user_id` as the first function argument. Dual login modes: 6-digit OTP magic link and password. Rate limiting via Flask-Limiter (bucketed by `user_id` for auth'd requests, IP otherwise; `storage_uri="memory://"` — not distributed).

**User / plan system:**
`role`: `'user'` | `'admin'`. `plan_type`: `'basic'` | `'pro'` | `'semester'`. Monthly counters reset automatically when the month key changes. `ADMIN_EMAIL` env var auto-promotes that account on every login.

**File upload pipeline (`/upload-pdf`):**
Accepts PDF, PPTX, PNG/JPG/JPEG. PDFs → PyMuPDF (`fitz`) in-memory (preserves Hebrew logical order). PPTX → `extract_pptx_text()`, slides prefixed `[שקופית N]`. Images → base64 in `_user_images_map` (not indexed). Text chunks → embedded → upserted into ChromaDB; old chunks for the same file purged first.

**Syllabus indexing (`api/courses.py`):**
`_reindex_syllabus_for_course(user_id, course_name, full_text)` is the shared helper used by both `save_course` and `update_course_syllabus`. It: deletes existing ChromaDB chunks by `file_id`, re-embeds and upserts, rebuilds BM25, upserts the `UserDocument` ownership record, and updates `full_syllabus_text` + `syllabus_file_id` on the `CustomCourse` row. The `syllabus_file_id` is always `md5(f"syllabus_{user_id}_{course_name}").hexdigest()[:16]`.

The `update_course_syllabus` endpoint additionally runs LLM extraction on the new PDF (same `_EXTRACTION_SYSTEM` prompt as `parse_syllabus`), diffs old vs new fields (lecturer, has_tirgul, ta, semester), updates those fields in the DB, and returns `{ success, changes: [Hebrew diff strings] }`. `course_name` is never auto-renamed by syllabus update.

**Retrieval (`hybrid_search`):**
Combines ChromaDB cosine similarity and BM25 via Reciprocal Rank Fusion (RRF constant 60). `tokenize_hebrew()` strips niqqud/cantillation before BM25. Returns `TOP_K=8` chunks. Accepts optional `file_id` to restrict to a single document.

**Q&A flow (`/ask`) — SSE stream:**
1. Create/resume `ChatSession` in SQLite; save user message.
2. Short queries (< 5 words) enriched with prior user question before embedding.
3. `hybrid_search` retrieves chunks.
4. LLM call with two OpenAI tools: `code_interpreter` and `search_web` (Tavily).
5. `code_interpreter` → `execute_python_code()` in daemon thread (25 s timeout); captures stdout + matplotlib figures as base64 PNG.
6. Non-empty `_user_images_map` → message sent as OpenAI multi-part array (text + image_url), activating vision.
7. Events: `{type:"status", phase}` → `{type:"result", ...}` | `{type:"error"}`.

**Export routes:**
- `/export-pdf` — `markdown` lib → HTML → WeasyPrint (requires system `pango`). Hebrew RTL styling.
- `/export-docx` — custom Markdown+LaTeX → python-docx. `$$...$$` blocks pre-processed to sentinel markers. Inline math in Cambria Math (blue), block equations centred. `w:bidi` on all paragraphs for RTL.

**Mastery system (`api/export.py`):**
- `GET /api/mastery/topics` — joins `UserDocument` + `TopicMastery`; returns `[{file_id, topic, icon, mastery_pct|null, quiz_count}]`.
- `POST /api/mastery/generate-quiz` — accepts `topic` + optional `file_id`. Calls `gpt-4o`. Returns 3 `{question, options[4], correct_answer}` objects.
- `POST /api/mastery/submit-results` — weighted update formula: `new = existing * 0.4 + (score/total*100) * 0.6`. First quiz seeds from neutral 50%.
- `GET /api/mastery/scores` — raw `TopicMastery` records for the user.

**Professor Brain Simulator (`api/professor.py`):**
`POST /api/professor-simulator/ask` — uses `gpt-4o` (not `gpt-4o-mini`). Rate limited to 2 simulations/month for basic plan. File ownership validated before RAG retrieval.

**Admin / CFO features (`api/admin.py`):**
- Agentic CFO (`/api/admin/ai-accountant/chat`) uses native OpenAI function calling with four financial tools; returns `chartData` for inline chart rendering.
- CFO alert scheduler runs daily at 09:00 UTC + 30 s startup run via APScheduler.

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
| `/api/profile` | GET, PATCH | user | Get/update profile |
| `/api/user/onboarding` | POST | user | Save onboarding fields |
| `/api/usage` | GET | user | Monthly upload/question counters |
| `/api/stats` | GET | user | Aggregate usage stats |
| `/api/transcribe` | POST | user | Audio → text (Whisper) |
| `/upload-pdf` | POST | user | Upload PDF / PPTX / images |
| `/documents` | GET | user | List user's indexed files |
| `/documents/<file_id>` | DELETE | user | Delete a document |
| `/ask` | POST | user | RAG Q&A, SSE stream |
| `/sessions` | GET | user | List chat sessions |
| `/sessions/<id>` | GET, DELETE | user | Fetch / delete session |
| `/generate-paper` | POST | user | Write academic paper from docs |
| `/api/generate-quiz` | POST | user | Generate quiz from docs |
| `/export-pdf` | POST | user | Markdown → PDF |
| `/export-docx` | POST | user | Markdown+LaTeX → DOCX |
| `/api/mastery/topics` | GET | user | List docs with mastery scores |
| `/api/mastery/generate-quiz` | POST | user | Generate 3-question quiz via gpt-4o + RAG |
| `/api/mastery/submit-results` | POST | user | Save quiz score; weighted mastery update |
| `/api/mastery/scores` | GET | user | Raw mastery records |
| `/api/courses/parse-syllabus` | POST | user | Parse PDF → LLM metadata + full text (multipart) |
| `/api/courses` | POST | user | Save CustomCourse + index syllabus to ChromaDB |
| `/api/courses/details` | GET | user | Fetch course metadata by `?name=` |
| `/api/courses/update` | PATCH | user | Update course fields; re-indexes if `full_syllabus_text` supplied |
| `/api/courses/delete` | POST | user | Delete course + purge ChromaDB chunks + UserDocument |
| `/api/courses/update-syllabus` | POST | user | Re-parse PDF, diff fields, return Hebrew change log |
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

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · `react-dropzone` v15 · `framer-motion` v12

> **Warning:** This Next.js version has breaking changes from older releases. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

**Post-login redirect:** After successful login/OTP, `page.tsx` routes to `WORKSPACE_ROUTE = '/dashboard'` (the Course Hub Home, not `/workspace`).

**Provider tree** (`layout.tsx`):
```
LanguageProvider → CourseProvider → AuthProvider → {children}
```
All three providers must remain in this order.

**API call patterns — two distinct approaches exist:**

1. **Server-side proxy** (`app/api/flask/[...path]/route.ts`): catches all methods on `/api/flask/*` and forwards to Flask. Exports `GET`, `POST`, `PATCH`, `PUT`, `DELETE`. Uses server-only `API_URL` env var. Logs every request to the `npm run dev` terminal.

2. **Direct browser calls**: Most pages call Flask directly at `const API = 'http://127.0.0.1:5003'` with `Authorization: Bearer <token>`. The proxy is an alternative — both patterns coexist in the codebase.

**Critical note on DELETE vs POST for destructive actions:** Use `POST /api/courses/delete` (not `DELETE /api/courses`) to avoid HTTP method routing ambiguity in Flask and CORS preflight issues. This pattern is established in `courses.py`.

**Auth (client-side):**
JWT stored in `localStorage` key `levy_ai_token`. Use the global `AuthProvider` (`app/providers/auth.tsx`) and `useAuth()` hook. The `AUTH_KEYS` export lists every localStorage key the app touches — keep it in sync.

**Course context (`providers/course.tsx`):**
Exports `CourseProvider` / `useCourse()` / `COURSES` (three built-in courses: `infi1`, `ds`, `phys`). The context exposes:
- `customCourses: Course[]` — user-added courses, persisted to `localStorage('levy_ai_custom_courses')`
- `addCustomCourse(course)` — appends + persists
- `removeCustomCourse(id)` — removes by ID + persists
- `updateCustomCourse(id, updates)` — merges `Partial<Omit<Course, 'id'>>` + persists
- `selectedCourse` / `setSelectedCourse` — active course, persisted to `localStorage('levy_ai_course')`

**Course picker (`course-picker/page.tsx`):**
Shows ONLY `customCourses` — the three built-in `COURSES` are no longer displayed here (they remain exported from `providers/course.tsx` for use on the dashboard's course-selector view). Each card has a 3-dots `MoreVertical` menu with: Edit (navigates to `edit/[id]`), Update Syllabus (triggers hidden file input → `POST /api/courses/update-syllabus` → shows Hebrew change log), Delete (opens confirmation modal). The `syllabusTargetRef` (not state) stores which course the file input targets to avoid stale closure.

**Add Course wizard (`course-picker/add/page.tsx`):**
Steps: 0 (PDF upload zone using `react-dropzone`) → 1 (Name + Lecturer) → 2 (Tirgul toggle + conditional TA input) → 3 (Semester + Color). Step 0 calls `POST /api/courses/parse-syllabus` and auto-fills form fields. All step transitions use `framer-motion` `AnimatePresence mode="wait"` + directional slide variants. The card itself uses `motion.div layout` to smoothly resize between steps.

Exit protection: `isDirty = step >= 1 && !hasSaved` controls both a `beforeunload` listener and a `popstate` trap (phantom history entry on mount). Both trigger the "לצאת ללא שמירה?" modal.

**Edit Course wizard (`course-picker/edit/[id]/page.tsx`):**
URL param `[id]` is the localStorage Course ID (string like `custom_${Date.now()}`). On mount: finds course in `customCourses` by ID → pre-fills name+color from localStorage, then fetches remaining fields from `GET /api/courses/details?name=`. Has an optional syllabus re-upload zone at the top of the form card (using `react-dropzone`) that calls `parse-syllabus` and auto-fills all fields. On save: calls `PATCH /api/courses/update`; if `syllabusText` was re-uploaded, includes it in the body to trigger re-indexing.

**Onboarding flow:**
After registration, users land on `/onboarding`. Onboarding data saved via `POST /api/user/onboarding` and mirrored into localStorage.

**Key conventions:**
- **Tailwind v4** — CSS-first config only. No `tailwind.config.ts`. All config in `app/globals.css`.
- **RTL Hebrew** — Always use `dir={lang === 'he' ? 'rtl' : 'ltr'}`. Never hardcode `dir="rtl"` or use `flex-row-reverse`.
- **Creamy Matcha design tokens** — Active design system:
  - Global body background: `#F9FCFA`; primary text: `#1C3329`; secondary text: `#527061`
  - Page headers: `rgba(255,255,255,0.82)` + `backdropFilter: blur(16px)` + `border-b #E2EBE5` — **no solid green headers**
  - Sidebar panels: `rgba(255,255,255,0.94)` + `backdropFilter: blur(20px)` + `border-inline-end #E2EBE5`
  - Active nav items: `background: #D1E6D9; color: #183025`
  - Accent green: `#517B3E` / `#2A3B22`
  - `globals.css` defines `@theme inline` tokens `--color-matcha-50` through `--color-matcha-950` and utility classes `.animate-mastery-pulse`, `.animate-jewel-glow`, etc.
- **framer-motion** — installed (`v12`). Use `AnimatePresence mode="popLayout"` for list items, `mode="wait"` for step transitions. The `layout` prop on containers animates height changes. Use `position: fixed` dropdowns to escape `overflow` constraints.
- **KaTeX** — `katex/dist/katex.min.css` imported in `layout.tsx`. Workspace uses `remark-math` + `rehype-katex`.
- **Workspace tab persistence** — both `ChatInterface` and `PaperWriter` are always mounted; inactive tab hidden with `hidden`.
- **i18n** — The idiomatic pattern is `const he = lang === 'he'` then `he ? 'hebrew' : 'english'`. Never hardcode Hebrew strings in JSX outside translation objects. RAG, ChromaDB, and other technical terms must NEVER appear in user-facing UI strings.

**Dashboard (`dashboard/page.tsx`):**
- Owl mascot (`/assets/mascot/charley.PNG`) displayed beside the greeting header
- `CrystalCard` component shows text-only (no emoji icon) — do not add an `icon` prop back
- `D` design-token object at the top centralises all colours
- **Course Selector view** (when `selectedCourse === null`): uses `COURSES` + `customCourses` from the provider
- **Course Focus view** (when course selected): `CrystalCard` quick actions + `MaterialRow` list

**`workspace/page.tsx` structure:**
Very large (~2500 lines). Inline components in order: `CodeExecutionBlock` → `QuizModal` → `LogoutConfirmModal` → `Sidebar` → `Home`. Every logout entry point must call `setShowLogoutModal(true)` — never `handleLogout()` directly.

**z-index layering (wizard exit modals / dropdowns):**

| Layer | Value | What |
|---|---|---|
| Sidebar backdrop | `z-40` | Dim overlay when sidebar is open |
| Sidebar panel | `z-50` | Slide-in drawer |
| Course picker context dropdown | `z-[10000]` | Fixed-position 3-dots menu (escapes overflow) |
| Delete / exit-warning modals | `z-[80]`–`z-[90]` | Confirmation overlays |
| Syllabus upload overlay | `z-[9998]` | Loading modal during quick upload |
| Toast / change-log notification | `z-[9999]` | Always on top |

**Back-button interception (wizards):**
Add/Edit course wizards push a phantom history entry on mount (`window.history.pushState(null, '', window.location.href)`) and listen for `popstate` — re-push + open exit warning modal. Also has a `beforeunload` listener while `isDirty`. Both are cleaned up on unmount.

**Language hydration:**
`LanguageProvider` always initializes to `'he'`. Never use a `useState` lazy initializer that reads `localStorage` — this breaks SSR.

**ESLint critical rule:**
`react-hooks/set-state-in-effect` is active. Any synchronous `setState()` in a `useEffect` body errors. Pattern:
```typescript
Promise.resolve(localStorage.getItem('key'))
  .then(val => { if (val) setState(parse(val)); });
```

### Data persistence

| Store | Location | Contents | Cleared by |
|---|---|---|---|
| ChromaDB | `backend/data/db/` | Per-user text chunks + embeddings (including syllabus chunks) | Manual deletion or re-upload |
| SQLite | `backend/data/chat.db` | Users, sessions, messages, OTP codes, reset tokens, document ownership, payments, CFO notifications, mastery scores, custom courses | Manual deletion or `RESET_DB=1` |
| BM25 index | Memory | Per-user; rebuilt from ChromaDB on first access | Server restart |
| Images | Memory | Per-user base64 uploads | Server restart |
| Active course | `localStorage('levy_ai_course')` | `{id, name, icon, color}` JSON | User clears or `setSelectedCourse(null)` |
| Custom courses | `localStorage('levy_ai_custom_courses')` | `Course[]` JSON | `removeCustomCourse` or manual clear |

To fully wipe all data: delete `backend/data/` then recreate `backend/data/db/` (empty). The app recreates `chat.db` on next startup.

### Utility scripts

- `backend/export_users.py` — dumps all users from `chat.db` to `users_export.csv`
- `backend/scripts/make_admin.py <email>` — promotes a user to `role='admin'` (user must re-login for new JWT)
- `backend/scripts/seed_payments.py` — inserts synthetic `Payment` rows for testing the CFO dashboard

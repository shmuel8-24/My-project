# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

```
.
├── start.py                # Unified startup: runs Flask + Next.js in parallel
├── backend/
│   ├── app.py              # Entry point: Flask app, CORS, limiter, blueprint registration
│   ├── extensions.py       # Shared singletons: OpenAI, limiter, per-user caches, JWT config
│   ├── models/
│   │   └── __init__.py     # SQLAlchemy models + DB engine + SessionLocal + migrations
│   ├── api/
│   │   ├── middleware.py   # token_required, admin_required, _get_user_refreshed
│   │   ├── auth.py         # Auth blueprint (login, OTP, register, profile, onboarding, etc.)
│   │   ├── courses.py      # Courses blueprint: parse-syllabus, save, update, delete, update-syllabus
│   │   ├── documents.py    # Documents/RAG blueprint (upload, ask, sessions)
│   │   ├── admin.py        # Admin blueprint + CFO agent + proactive scheduler
│   │   ├── professor.py    # Professor Brain Simulator blueprint
│   │   ├── presentation_agent.py # Presentation Agent blueprint: multi-tool file→deck generation
│   │   └── export.py       # Export blueprint (paper, quiz, PDF, DOCX, slides) + all /api/mastery/* routes
│   ├── services/
│   │   ├── faiss_store.py  # FAISS vector store (FaissCollection — ChromaDB-compatible surface)
│   │   ├── rag.py          # hybrid_search, BM25, get_user_collection (wraps faiss_store)
│   │   ├── md_renderer.py  # Markdown → HTML (Python-Markdown + mdx_math + Pygments)
│   │   ├── security.py     # DLP filter, PII redaction, HTML stripping, prompt sanitization (_sanitize)
│   │   ├── email.py        # OTP + reset email (SMTP / Resend / terminal)
│   │   ├── pdf.py          # PPTX text/slide extraction
│   │   ├── code_runner.py  # Python sandbox (matplotlib Agg backend set here)
│   │   ├── slides.py       # Slide-deck generation: generate_slide_deck (RAG) + generate_deck_via_agent (agent)
│   │   └── startup.py      # Background backfill threads + orphan session migration
│   ├── data/               # gitignored persistent storage
│   │   ├── faiss/          # FAISS vector store — one subdirectory per user (user_{id}/)
│   │   └── chat.db         # SQLite (users, sessions, messages)
│   ├── requirements.txt
│   ├── .env.example
│   ├── export_users.py
│   └── scripts/
│       ├── make_admin.py   # Promote user to admin
│       └── seed_payments.py # Seed test payment data
└── frontend/
    ├── middleware.ts        # Active auth guard: hybrid Supabase + Flask-JWT; see frontend/CLAUDE.md
    ├── src/
    │   ├── components/
    │   │   ├── CoursePill.tsx          # Global course selector pill
    │   │   ├── Sidebar.tsx             # SidebarDocumentsLink nav item (→ /workspace/documents)
    │   │   ├── AIThinkingIndicator.tsx # Streaming phase indicator (thinking/searching/running)
    │   │   ├── SelectionPopover.tsx    # Text-selection popover (explain / summarize / quiz)
    │   │   ├── CodeBlock.tsx           # Syntax-highlighted code block renderer
    │   │   ├── AcademicRichEditor.tsx  # @uiw/react-md-editor wrapper — ssr:false required
    │   │   ├── SlideLayouts.tsx        # RAG deck renderer (Title_Slide/Image_Right/Big_Metric) — /presentation
    │   │   ├── SlideViewer.tsx         # Agent deck renderer (12 layouts incl. timeline/barChart/architecture/quote_focus/formula_heavy/two_column), light "Matcha Executive Light" theme — /presentation-generator
    │   │   ├── ChartSlide.tsx          # recharts bar+donut chart for SlideViewer's "barChart" layout
    │   │   ├── pptxExport.ts           # exportToPPTX(slides, lang) — pptxgenjs deck export, dynamic-imported
    │   │   └── ui/Skeleton.tsx         # Loading skeleton
    │   ├── context/
    │   │   └── CourseContext.tsx        # Re-export shim for providers/course.tsx
    │   └── app/
    │       ├── page.tsx                        # Landing page + auth modal
    │       ├── layout.tsx                      # Root layout: LanguageProvider → CourseProvider → AuthProvider
    │       ├── globals.css                     # Tailwind v4 entry + keyframes + matcha design tokens
    │       ├── locales/landing.ts              # He/en copy for landing page only (exception to inline i18n)
    │       ├── dashboard/page.tsx              # Course Hub Home
    │       ├── profile/page.tsx                # Profile page (also owns Documents tab logic)
    │       ├── settings/page.tsx               # Settings — full-nav sidebar + centered Preferences/Language card
    │       ├── academic-writing/page.tsx       # AI co-writing (~2125 lines, WritingPanel inline)
    │       ├── presentation/page.tsx           # RAG slide deck from own documents → SlideLayouts
    │       ├── presentation-generator/page.tsx # Agent-based one-shot deck from uploaded files → SlideViewer
    │       ├── mastery/page.tsx                # Skill mastery — quiz modal + score tracking
    │       ├── course-picker/
    │       │   ├── page.tsx                    # Course list (customCourses only; 3-dots menu)
    │       │   ├── add/page.tsx                # Add Course wizard (steps 0–3)
    │       │   └── edit/[id]/page.tsx          # Edit Course wizard
    │       ├── workspace/
    │       │   ├── page.tsx                    # Main RAG workspace (~3087 lines; all inline)
    │       │   ├── documents/page.tsx          # Route alias → Profile page on Documents tab
    │       │   ├── UserProfileModal.tsx
    │       │   ├── UpgradeModal.tsx
    │       │   └── professor-simulator/page.tsx
    │       ├── admin/
    │       │   ├── AdminShell.tsx              # Shared sidebar+header+footer chrome for all /admin/* pages
    │       │   ├── page.tsx                    # Admin Overview — KPIs, AI Accountant chat, CFO notifications
    │       │   ├── AiAccountantChat.tsx
    │       │   └── users/page.tsx              # User Management table
    │       ├── api/flask/[...path]/route.ts    # Server-side Flask proxy
    │       ├── types/katex.d.ts                # KaTeX type declarations
    │       └── providers/
    │           ├── auth.tsx
    │           ├── language.tsx
    │           └── course.tsx
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
npm run dev      # dev server with hot reload (Turbopack)
npm run build    # production build
npm run lint     # ESLint (must pass before committing)
npx tsc --noEmit # type-check without emitting
npm run clean    # rm -rf .next — use when Turbopack cache misbehaves
```

No test suite is configured (no `*.test.*`/`*.spec.*` files).

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
| `RESET_DB` | Set to `1` to perform a full data wipe on next startup (drops + recreates SQLite tables and all FAISS stores), then exits | — |

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
| `tavily_client` | `TavilyClient` or `None` when `TAVILY_API_KEY` absent |
| `embeddings_model` | LangChain `OpenAIEmbeddings` (`text-embedding-3-small`) |
| `text_splitter` | `RecursiveCharacterTextSplitter` (chunk 1500, overlap 300) |
| `limiter` | Flask-Limiter (lazy — bound to Flask app via `limiter.init_app(app)`) |
| `TOP_K` / `RRF_K` | Retrieval constants: 8 results, RRF constant 60 |

Per-user state in `extensions.py` (keyed by `user_id`):
- `_bm25_map` → BM25 index (rebuilt from FAISS on first access or after upload)
- `_images_map` → `{filename: {base64, mime}}`; cleared on server restart

**Vector store (`services/faiss_store.py`):**
FAISS replaces ChromaDB. `FaissCollection` exposes a ChromaDB-compatible surface (`upsert`, `delete`, `count`, `get`, `query`) so all call sites work unchanged. Data lives in `backend/data/faiss/user_{id}/` (3 files: `index.faiss`, `vecs.npy`, `meta.json`). `get_user_store(user_id)` is the entry point; an in-process cache (`_user_stores`) avoids repeated disk loads.

**User model fields** (`models/__init__.py`):
Core: `email`, `password_hash`, `first_name`, `last_name`, `role`, `plan_type`, `subscription_end_date`.
Usage counters: `uploads_this_month`, `upload_month_key`, `questions_this_month`, `question_month_key`, `prof_sims_this_month`, `prof_sim_month_key`.
Onboarding: `country`, `institution`, `degree_type`, `primary_major`, `secondary_major`, `gender`, `study_year`, `ai_style`.

**Additional models** (`models/__init__.py`):
- `Payment` — financial transactions (ILS). Fields: `user_id`, `amount`, `currency`, `plan_type` (`'monthly'`|`'semester'`), `status` (`'completed'`|`'failed'`|`'refunded'`|`'pending'`), `payment_date`, `description`.
- `CfoNotification` — proactive CFO alerts. Fields: `title`, `message`, `type` (`'info'`|`'warning'`|`'critical'`), `is_read`, `created_at`.
- `TopicMastery` — per-user mastery score per uploaded document. Fields: `user_id`, `file_id` (MD5 hex from `UserDocument`), `topic`, `mastery_pct` (0–100 float), `quiz_count`, `last_updated`. Unique on `(user_id, file_id)`. All mastery routes live in `api/export.py`.
- `CustomCourse` — user-created course with optional syllabus for RAG. Fields: `user_id`, `course_name`, `lecturer_name`, `has_tirgul` (bool), `ta_name`, `semester` (`'a'`|`'b'`|`'summer'`), `color`, `full_syllabus_text` (Text), `syllabus_file_id` (16-char MD5 linking to `UserDocument` + FAISS). Course name is the identity key used in all backend operations — do not rename it without also renaming the FAISS chunks.

**Schema migrations** are idempotent `ALTER TABLE` statements at the bottom of `models/__init__.py`. Every new column added to the `User` class must also get a corresponding migration statement there — the `try/except` silently skips columns that already exist. New tables are created automatically by `_Base.metadata.create_all()`.

**Document isolation model:**
Each user owns a separate FAISS store directory (`data/faiss/user_{id}/`). File IDs are MD5 hex of the filename. The `UserDocument` SQL table is the authoritative ownership registry — every vector query validates ownership there before touching FAISS (defence-in-depth).

**Auth (`@token_required` / `@admin_required`):**
JWT HS256, 24 h TTL, `SECRET_KEY` from env. Two decorators inject `user_id` as the first function argument. Dual login modes: 6-digit OTP magic link and password. Rate limiting via Flask-Limiter (bucketed by `user_id` for auth'd requests, IP otherwise; `storage_uri="memory://"` — not distributed).

**User / plan system:**
`role`: `'user'` | `'admin'`. `plan_type`: `'basic'` | `'pro'` | `'semester'`. Monthly counters reset automatically when the month key changes. `ADMIN_EMAIL` env var auto-promotes that account on every login.

**File upload pipeline (`/upload-pdf`):**
Accepts PDF, PPTX, PNG/JPG/JPEG. PDFs → PyMuPDF (`fitz`) in-memory (preserves Hebrew logical order). PPTX → `extract_pptx_text()`, slides prefixed `[שקופית N]`. Images → base64 in `_images_map` (not indexed). Text chunks → embedded → upserted into FAISS; old chunks for the same file purged first.

**Syllabus indexing (`api/courses.py`):**
`_reindex_syllabus_for_course(user_id, course_name, full_text)` is the shared helper used by both `save_course` and `update_course_syllabus`. It: deletes existing FAISS chunks by `file_id`, re-embeds and upserts, rebuilds BM25, upserts the `UserDocument` ownership record, and updates `full_syllabus_text` + `syllabus_file_id` on the `CustomCourse` row. The `syllabus_file_id` is always `md5(f"syllabus_{user_id}_{course_name}").hexdigest()[:16]`.

The `update_course_syllabus` endpoint additionally runs LLM extraction on the new PDF (same `_EXTRACTION_SYSTEM` prompt as `parse_syllabus`), diffs old vs new fields (lecturer, has_tirgul, ta, semester), updates those fields in the DB, and returns `{ success, changes: [Hebrew diff strings] }`. `course_name` is never auto-renamed by syllabus update.

**Retrieval (`hybrid_search`):**
Combines FAISS L2 similarity and BM25 via Reciprocal Rank Fusion (RRF constant 60). `tokenize_hebrew()` strips niqqud/cantillation before BM25. Returns `TOP_K=8` chunks. Accepts optional `file_id` to restrict to a single document.

**Q&A flow (`/ask`) — SSE stream:**
1. Create/resume `ChatSession` in SQLite; save user message.
2. Short queries (< 5 words) enriched with prior user question before embedding.
3. `hybrid_search` retrieves chunks.
4. LLM call with two OpenAI tools: `code_interpreter` and `search_web` (Tavily).
5. `code_interpreter` → `execute_python_code()` in daemon thread (25 s timeout); captures stdout + matplotlib figures as base64 PNG.
6. Non-empty `_images_map` → message sent as OpenAI multi-part array (text + image_url), activating vision.
7. Events: `{type:"status", phase}` → `{type:"result", ...}` | `{type:"error"}`.

**Academic paper generation (`/generate-paper`) — SSE stream:**
Stateless per-call — no conversation history stored. The frontend accumulates approved sections and sends the full `previousContent` on each subsequent call. An anti-repetition engine in the system prompt forces the model to catalog already-mentioned authors/cases/arguments and produce new material. Prompt text is sanitized via `_sanitize()` (lives in `services/security.py`, shared with `services/slides.py`) to avoid homework-filter refusals. **RAG diversity**: the FAISS query is enriched per chunk with a chapter-specific angle phrase from `_CHUNK_ANGLES` (e.g. intro → theory → examples → findings), so each generation call retrieves topically-distinct document sections rather than the same TOP_K chunks repeated every call.

**Word-count-driven pacing** (replaces the older pure chunk-count model): the frontend (`academic-writing/page.tsx`) is the single source of truth for document length — `targetWordCount = pageCount * WORDS_PER_PAGE` (`WORDS_PER_PAGE=300`) is sent to the backend on every call. `CHUNKS_PER_PAGE=1.5` only derives `maxChunks` as a generous upper-bound safety net so the loop always terminates, not the real stopping condition. Each chunk is paced to `chunk_word_min=250`–`chunk_word_max=300` words (`max_tokens=800` fixed ceiling, since a chunk no longer scales with total document length). The frontend computes `isFinalSection = wordsSoFar >= targetWords || paragraphNum + 1 >= chunkTotal` and sends it as `isFinalSection`/`targetWordCount` — the backend reads these directly rather than deriving them. The final chunk writes `## סיכום`. A new **academic-rigor / anti-templating engine** (applies to every chunk; the forward-flow/lead-with-substance rules apply only to non-final chunks) bans repetitive paragraph-opening templates, requires 3-4 sentences of critical analysis per named author/case from the source material, and requires non-final chunks to end with a forward-looking transition and open with substance (a name/case/ruling) rather than a generic framing sentence.

**Markdown rendering (`services/md_renderer.py`):**
`render_markdown_html(text)` — Python-Markdown with `mdx_math` (→ `<script type="math/tex">` tags for client-side KaTeX), `fenced_code`, and `CodeHiliteExtension` (Pygments inline CSS). Used by `/generate-paper` SSE result and `/export-pdf`.

**Export routes:**
- `/export-pdf` — `render_markdown_html` → full HTML → WeasyPrint (requires system `pango`). Hebrew RTL styling.
- `/export-docx` — custom Markdown+LaTeX → python-docx. `$$...$$` blocks pre-processed to sentinel markers. Inline math in Cambria Math (blue), block equations centred. `w:bidi` on all paragraphs for RTL.

**Slide deck generation (`services/slides.py`) — two independent flows, two slide shapes:**
- `generate_slide_deck(client, topic, context, course_name)` — RAG-based. Used by `POST /api/generate-slides` (`api/export.py`): retrieves `hybrid_search` chunks from the user's own FAISS knowledge base (query enriched with "מושגים מרכזיים נתונים מספרים ומסקנות key concepts data statistics findings conclusions"), optionally restricted to `fileIds`. Returns 20 slides shaped `{title, content, layoutType, imageQuery}` with `layoutType ∈ {Title_Slide, Image_Right, Big_Metric}` — slide 1 is the `Title_Slide` cover and slide 20 is a content-rich `Image_Right` "Strategic Summary & Conclusion" (never a sparse "Thank you"/"תודה" closer). `imageQuery` is a short descriptive phrase only — never resolved to a real image.
- `generate_deck_via_agent(client, topic, context, rag_context="")` — agent-based. Used by `POST /api/generate-presentation` (`api/presentation_agent.py`): a 4-tool OpenAI function-calling agent (`parse_document` for PDF/DOCX/PPTX, `transcribe_media` via Whisper for audio/video, `analyze_image` via vision, plus a forced final `build_presentation` tool call) processes freshly-uploaded files **in-memory only — never persisted to FAISS or the user's document set**. The endpoint additionally runs `hybrid_search(user_id, deck_topic, TOP_K)` against the user's *existing* FAISS knowledge base (all previously-indexed course materials) and passes the result as `rag_context` — the system prompt treats the uploaded files as the primary subject and the RAG chunks as supplementary depth/examples (both sources are synthesized together, never just one). All slide text (titles, bullets, metrics, tile/timeline/chart/architecture labels) is generated in **Hebrew regardless of source-material language** — only `iconName` and architecture `id` values stay in English as identifiers. Returns 20 slides shaped `{title, layout, content?, ...}` with `layout ∈ DECK_LAYOUTS = {title, bullets, metric, split-screen, timeline, barChart, tileGrid, bleedImage, architecture, quote_focus, formula_heavy, two_column}`. Each non-title/bullets/metric layout carries its own data field instead of (or alongside) `content`: `timeline` → `timelineData: {date, event}[]`, `barChart` → `chartData: {label, percentage}[]`, `tileGrid` → `tiles: {iconName, title, text}[]` (`iconName` ∈ `TILE_ICON_NAMES`), `architecture` → `layers: string[]` + `nodes: {id, label, layer}[]` + `connections: {from, to}[]`, `quote_focus` → `content` is ONE full-sentence Hebrew string (the foundational principle/definition/quote) plus optional `attribution` (short Hebrew source label), `formula_heavy` → required `latexFormula` (LaTeX, no `$`/`$$` delimiters) plus optional `content: string[]` (1-3 Hebrew bullets explaining the formula), `two_column` → `content: string[]` (3-5 Hebrew bullets) plus REQUIRED `keyTakeaway: {title, text}` — a definition/concept panel rendered beside the bullets (deliberately separate from `highlightBox`: always present and the slide's primary content, not a sparing supplementary callout). Additionally, any slide whose layout is in `HIGHLIGHT_BOX_LAYOUTS = {bullets, split-screen, bleedImage, quote_focus, formula_heavy}` (note: `two_column` is intentionally excluded — its `keyTakeaway` already provides the prominent panel) may carry an optional `highlightBox: {type: 'tip'|'warning'|'definition', title, text}` callout — used sparingly (2-4 slides per deck). `_validate_deck_slides` drops slides whose required per-layout data is missing/invalid (a malformed `highlightBox` is dropped individually without dropping the slide; `_extract_bullets()` is the shared helper for normalizing `content` into a bullet list across `bullets`/`split-screen`/`bleedImage`, `formula_heavy`, and `two_column`).

**AI-generated slide images (Pollinations.ai):** For `"split-screen"`/`"bleedImage"` slides, `_DECK_SYSTEM_PROMPT` (rule 19) asks the model for an additional `imagePrompt` field — a highly descriptive 15-20 word **English** AI image-generation prompt (cinematic/professional/academic aesthetic) translated from the slide's Hebrew subject (e.g. for `"מגמות בשוק העבודה"`, something like `"a sleek modern office skyline at dusk, glowing data dashboards reflected in glass windows, cinematic professional photography, academic tone"`); this happens for free as part of the existing `build_presentation` tool call, no extra LLM call. `_validate_deck_slides` keeps `imagePrompt` only for those two layouts, as a plain string on the slide — there is no backend image resolution/provider abstraction. The frontend (`SlideViewer.tsx`'s `AIImage`) builds the image URL directly: `https://image.pollinations.ai/prompt/{encodeURIComponent(imagePrompt)}?width=800&height=600&nologo=true` — Pollinations generates the image on the fly when the browser requests this URL, free and with no API key. Absent `imagePrompt` ⇒ the slide renders its existing placeholder visual unchanged.

Both entry points share `_sanitize()` and the 10-slide McKinsey/BCG-style system prompt convention, but `_validate_slides`/`VALID_SLIDE_LAYOUTS` (RAG shape) and `_validate_deck_slides`/`DECK_LAYOUTS` (agent shape) are separate validators — the two slide shapes are intentionally different and rendered by different frontend components (`SlideLayouts.tsx` vs `SlideViewer.tsx`). Don't conflate them.

**`SlideViewer.tsx` rendering — "Matcha Executive Light" deck theme:**
`SlideViewer.tsx` renders each slide rectangle in a bright, high-contrast, consulting-style theme (`EXEC` palette: `#F8FAF5` background, `#8BAF84` accent for borders/icons/decorative fills, `#517B3E` accentDark for high-contrast accent text like metric values and timeline dates, `#1C3329` primary text, `#527061` secondary/cream text) — close to, but distinct from, the rest of the app's light Creamy Matcha UI. `ArchitectureLayout`'s `LAYER_COLORS` and `ChartSlide`'s `PIE_COLORS` use darker matcha-family tones chosen for contrast against this light background. It loads its own fonts via `next/font/google` (`Urbanist` for headings, `Assistant` for Hebrew/Latin body) — independent of the global `Heebo` font set in `layout.tsx`. Since the backend now always generates slide text in Hebrew (see `generate_deck_via_agent`), the slide rect and print pages are hardcoded `dir="rtl" lang="he"` regardless of the UI `lang` prop (only the surrounding controls — nav buttons, export buttons — respect `lang`). `TILE_ICONS` (lucide-react) maps `tileGrid` `iconName` strings to icon components and **must stay in sync with `TILE_ICON_NAMES` in `backend/services/slides.py`**. `ArchitectureLayout` lays nodes out per-layer in a CSS grid and draws `connections` as SVG lines between computed node-center percentages; its diagram area is forced `dir="ltr"` because the connector-line math assumes left-to-right x positions. The `barChart` layout renders via `ChartSlide.tsx` (recharts horizontal bar + donut, RTL-mirrored axes). `BulletsLayout`/`SplitScreenLayout`/`BleedImageLayout` give each bullet a context-relevant icon via `bulletIcon()` — a Hebrew/English keyword-matched `lucide-react` icon (`BULLET_ICON_RULES`), falling back to a small rotating set (`BULLET_ICON_FALLBACKS`) by index — replacing the previous uniform checkmark. `QuoteFocusLayout` (`quote_focus`) renders `content` as one large centered quote with a `Quote` glyph and optional `attribution` byline; `FormulaHeavyLayout` (`formula_heavy`) renders `latexFormula` via `FormulaBlock` (KaTeX `renderToString(..., { displayMode: true })`, kept `dir="ltr"` since math notation reads LTR even in RTL slides) above optional explanatory bullets. `TwoColumnLayout` (`two_column`) renders `content` as bullets on one side and a single prominent panel on the other — `slide.keyTakeaway.title`/`.text` with a `BookOpen` icon badge, styled via `theme.accentDark`/`theme.accent` — distinct from `SplitScreenLayout`, whose other side is a photo/placeholder. All three of `QuoteFocusLayout`, `FormulaHeavyLayout`, and `TwoColumnLayout`'s panel render a low-opacity `SlidePattern` (SVG dot-grid, `useId()`-scoped to avoid `<pattern>` id collisions when every slide renders simultaneously in the print view) as background texture. Any layout in `HIGHLIGHT_BOX_LAYOUTS` renders an optional `<HighlightBox>` callout when `slide.highlightBox` is present, colored by `type` via the active theme (`tip`→`accent`, `warning`→`layerColors[1]`, `definition`→`layerColors[3]`). Export controls offer both `downloadPdf` (`window.print()`, styled via `globals.css` `@media print`) and `downloadPptx` (`exportToPPTX` from `pptxExport.ts`, which dynamic-imports `pptxgenjs` so it never loads during SSR and maps each `DeckSlide` onto native PowerPoint shapes mirroring the `EXEC` palette, including `quote_focus`, `formula_heavy`, and `two_column` (bullets + a `keyTakeaway` title/text block in a tinted `roundRect` panel) — `formula_heavy` renders `latexFormula` as plain text in a `Cambria Math`-faced box since pptxgenjs has no KaTeX renderer; `slide.imagePrompt`'s AI-generated image and `slide.highlightBox` are not embedded in the PPTX export — those slides fall back to their placeholder/simpler representation in the exported file).

**Slide images (`SlideViewer.tsx`'s `AIImage`):** `SplitScreenLayout`/`BleedImageLayout` render `slide.imagePrompt` via a plain `<img>` pointed at a Pollinations.ai URL built with `encodeURIComponent`, styled `object-cover`. While the image is generating (Pollinations can take several seconds) the existing themed `VisualPlaceholder`/`ImageIcon` fallback is shown underneath and the `<img>` fades in via `onLoad`; on `onError` the fallback is shown permanently instead — never a broken image. `rounded` controls corner rounding (true for split-screen's padded visual area, false for bleedImage's edge-to-edge half). `slide.imagePrompt` absent ⇒ the fallback renders immediately. Hebrew slide text itself is never overlaid on the image (it lives in the other half of the slide), so RTL/contrast of the actual content is unaffected by which image is generated.

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
| `/health` | GET | — | Liveness; reports FAISS chunk count |
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
| `/generate-paper` | POST | user | Write academic paper from docs (SSE, chunk-by-chunk) |
| `/api/generate-quiz` | POST | user | Generate quiz from docs |
| `/export-pdf` | POST | user | Markdown → PDF |
| `/export-docx` | POST | user | Markdown+LaTeX → DOCX |
| `/api/mastery/topics` | GET | user | List docs with mastery scores |
| `/api/mastery/generate-quiz` | POST | user | Generate 3-question quiz via gpt-4o + RAG |
| `/api/mastery/submit-results` | POST | user | Save quiz score; weighted mastery update |
| `/api/mastery/scores` | GET | user | Raw mastery records |
| `/api/courses/parse-syllabus` | POST | user | Parse PDF → LLM metadata + full text (multipart) |
| `/api/courses` | POST | user | Save CustomCourse + index syllabus to FAISS |
| `/api/courses/details` | GET | user | Fetch course metadata by `?name=` |
| `/api/courses/update` | PATCH | user | Update course fields; re-indexes if `full_syllabus_text` supplied |
| `/api/courses/delete` | POST | user | Delete course + purge FAISS chunks + UserDocument |
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

**`middleware.ts`** actively guards `/admin/*` and `/dashboard/*` with a hybrid Supabase + Flask-JWT auth check. It also sets security headers on every response. See `frontend/CLAUDE.md` for the full details — the pass-through description in older notes is stale.

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

**Academic writing (`academic-writing/page.tsx`):**
~2125 lines. `WritingPanel` drives a co-writing SSE loop: `generateParagraph(paragraphNum, approved[], feedback)` sends `previousContent` (raw concatenated approved text — no UI labels), `currentChunkIndex`, `maxChunks`, `isFinalSection`, `fileIds`. `CHUNKS_PER_PAGE=4`; `maxChunks = pageCount * 4`. Approved sections accumulate in `approvedParagraphs[]` (pure LLM text only — never UI strings). `resetSession()` zeroes all state including `chunkIndexRef` for a clean new paper. `handleNextStep` is the single unified approve callback: it appends the current draft to `approvedParagraphs[]`, then either finalizes (`setIsFinished(true)`) when `next.length >= maxChunks`, or advances `chunkIndexRef` and calls `generateParagraph` — the `next.length >= maxChunks` check is the hard page-count enforcement and is evaluated synchronously against the just-built array (not stale React state).

**`workspace/page.tsx` structure:**
Very large (~3087 lines). Inline components in order: `CodeExecutionBlock` → `QuizModal` → `LogoutConfirmModal` → `Sidebar` → `Home`. Every logout entry point must call `setShowLogoutModal(true)` — never `handleLogout()` directly. No shared `<Sidebar>` shell exists in this codebase — each page owns its own sidebar.

**Full-nav sidebar pattern (`mastery/page.tsx`, `academic-writing/page.tsx`, `presentation/page.tsx`, `presentation-generator/page.tsx`, `settings/page.tsx`, `workspace/page.tsx`, `workspace/professor-simulator/page.tsx`):**
Each page has its own copy-pasted hamburger-triggered sidebar (`MasterySidebar` / local `Sidebar` — unrelated to `components/Sidebar.tsx`, which is a different, smaller component): backdrop (`z-40`) + slide-in `<aside>` panel (`z-50`, `translateClass` for RTL/LTR direction), nav links (Home/StudyLab/Academic Writing/Create Presentation/Professor's Brain/Mastery/Settings/Collaboration "Soon" — every full-nav sidebar includes a "🎬 Create Presentation" → `/presentation-generator` item), an active-course indicator via `useCourse()`, an admin-only "Admin CT" section gated on `isAdmin` (decoded from the JWT via `decodeJwtPayload`), and a bottom Logout button wired to `LogoutConfirmModal`. The header also carries a profile-avatar popover (`AvatarContent`, name/email, Logout). `mastery/page.tsx`'s `MasterySidebar` is the canonical reference — copy it verbatim (including `AvatarContent`/`IconShield`/`LogoutConfirmModal`/`decodeJwtPayload` helpers) when adding this shell to a new page rather than re-deriving it. Newer headers (`settings`, `admin/*`, and the post-rewrite `academic-writing`/`mastery`/`presentation-generator`) drop the centered page-title badge entirely — just hamburger+logo on the start side and CoursePill+language-toggle+avatar-popover on the end side; `presentation/page.tsx` still has the older centered title badge and hasn't been migrated.

**Admin pages (`admin/page.tsx`, `admin/users/page.tsx`):**
These two pages share one `AdminShell.tsx` component (not copy-pasted, unlike the full-nav pattern above — with only two admin pages a shared component was preferred over duplicating ~300 lines twice) providing the sidebar/header/footer chrome. There is no `admin/layout.tsx`; both pages wrap their content directly in `<AdminShell>...</AdminShell>`. `AdminShell`'s sidebar extends the standard nav with an always-visible "Admin CT" section (🖥️ Platform → `/dashboard`, 🛡️ Overview → `/admin`, 👥 User Management → `/admin/users`, 📚 Course Assignments "Soon") — not gated on `isAdmin` since `AdminShell` is only ever rendered on confirmed-admin routes (each page's own auth-guard effect still calls `router.replace('/?login=true')` for non-admins before rendering `AdminShell`). Page content sits on `AdminShell`'s `#97AB92` background inside `max-w-7xl`/`max-w-6xl mx-auto` containers.

**`/workspace/documents` route:**
Thin alias at `workspace/documents/page.tsx` — renders `<ProfilePageInner>` which opens directly on the Documents tab (detected via `pathname === '/workspace/documents'`). All document fetch/list/delete logic lives in `profile/page.tsx`.

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
- **KaTeX** — `katex/dist/katex.min.css` imported in `layout.tsx`. Workspace uses `remark-math` + `rehype-katex`. Academic writing uses `mathtex-script-type` (from backend HTML) plus auto-render fallback.
- **`AcademicRichEditor`** — must always be loaded `dynamic(() => import(...), { ssr: false })` — `@uiw/react-md-editor` touches `window` at module evaluation time.
- **Workspace tab persistence** — both `ChatInterface` and `PaperWriter` are always mounted; inactive tab hidden with `hidden`.
- **i18n** — The idiomatic pattern is `const he = lang === 'he'` then `he ? 'hebrew' : 'english'`. Never hardcode Hebrew strings in JSX outside translation objects. `locales/landing.ts` is the only exception (landing page only — large static copy). RAG, ChromaDB, FAISS, and other technical terms must NEVER appear in user-facing UI strings.

**Dashboard (`dashboard/page.tsx`):**
- Owl mascot (`/assets/mascot/charley.PNG`) displayed beside the greeting header
- `CrystalCard` component shows text-only (no emoji icon) — do not add an `icon` prop back
- `D` design-token object at the top centralises all colours
- **Course Selector view** (when `selectedCourse === null`): uses `COURSES` + `customCourses` from the provider
- **Course Focus view** (when course selected): `CrystalCard` quick actions + `MaterialRow` list
- The "Create Presentation" `CrystalCard` routes to `/presentation-generator` (single screen: topic input + drag-and-drop upload + Generate). `/presentation` (RAG deck from already-indexed docs, topic-only, no upload) is a separate, intentionally distinct feature and is not linked from the dashboard.

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
| FAISS | `backend/data/faiss/user_{id}/` | Per-user text chunks + embeddings (3 files per user: index.faiss, vecs.npy, meta.json) | Manual deletion or re-upload |
| SQLite | `backend/data/chat.db` | Users, sessions, messages, OTP codes, reset tokens, document ownership, payments, CFO notifications, mastery scores, custom courses | Manual deletion or `RESET_DB=1` |
| BM25 index | Memory | Per-user; rebuilt from FAISS on first access | Server restart |
| Images | Memory | Per-user base64 uploads | Server restart |
| Active course | `localStorage('levy_ai_course')` | `{id, name, icon, color}` JSON | User clears or `setSelectedCourse(null)` |
| Custom courses | `localStorage('levy_ai_custom_courses')` | `Course[]` JSON | `removeCustomCourse` or manual clear |

To fully wipe all data: delete `backend/data/` then recreate `backend/data/faiss/` (empty directory). The app recreates `chat.db` and per-user FAISS stores on next startup.

### Utility scripts

- `backend/export_users.py` — dumps all users from `chat.db` to `users_export.csv`
- `backend/scripts/make_admin.py <email>` — promotes a user to `role='admin'` (user must re-login for new JWT)
- `backend/scripts/seed_payments.py` — inserts synthetic `Payment` rows for testing the CFO dashboard

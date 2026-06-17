# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The monorepo-level `../CLAUDE.md` is the authoritative architecture reference (provider tree, design
tokens, API surface, conventions, etc.) — read it first. The notes below cover things that have
since changed or aren't yet captured there.

## Commands (run from `frontend/`)

```bash
npm run dev      # dev server (Turbopack, hot reload) — http://localhost:3000
npm run build    # production build
npm run lint     # ESLint — must pass before committing
npx tsc --noEmit # type-check without emitting
npm run clean    # rm -rf .next (use when Turbopack cache misbehaves after big refactors)
```

There is no test suite configured (no `*.test.*`/`*.spec.*` files, no test script in `package.json`).

To lint or type-check a single file: `npx eslint src/app/academic-writing/page.tsx` or rely on
`tsc --noEmit` (project-wide; TS has no single-file mode that respects `tsconfig.json` path aliases).

## `middleware.ts` — hybrid auth guard (newer than documented upstream)

The root CLAUDE.md describes `middleware.ts` as a pass-through. It no longer is — it now actively
guards routes and runs a **hybrid Supabase + Flask-JWT** auth check on every request to `/admin/*`
and `/dashboard/*`:

- **Layer 1 (Supabase)**: if `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set,
  `@supabase/ssr`'s `createServerClient` validates the session cookie via `supabase.auth.getUser()`.
  Admin role comes from `app_metadata.role === 'admin'` or `user_metadata.is_admin === true`.
- **Layer 2 (Flask, fallback)**: `levy_ai_session` (presence flag) + `levy_ai_token` (JWT, payload
  decoded but **not signature-verified** at the Edge — real authorization stays in Flask's
  `@admin_required`). Both layers can coexist during a migration; Supabase wins when it has a user.
- `/admin/*` requires `isAuthenticated && isAdmin` (redirects to `/` or `/?login=true`).
- `/dashboard/*` requires auth **and** an active course (`levy_ai_course_active` cookie),
  redirecting to `/course-picker` otherwise.
- Every response gets security headers (`X-Frame-Options`, `HSTS`, etc.) via `applySecurityHeaders`.

**Important:** `@supabase/supabase-js` / `@supabase/ssr` are dependencies but are used **only** in
`middleware.ts` — there is no Supabase client anywhere in `src/app` (auth provider, pages, etc. are
still pure Flask-JWT via `useAuth()`/`localStorage('levy_ai_token')`). Don't assume a Supabase
browser client exists; this looks like in-progress migration scaffolding at the Edge layer only.

## Scale note

`workspace/page.tsx`: ~3087 lines. `academic-writing/page.tsx`: ~2200+ lines. Both follow the
same single-file, inline-everything pattern — the root CLAUDE.md has the up-to-date counts.

## Academic Writing wizard — URL-based navigation (critical)

`academic-writing/page.tsx` uses **URL query params as the source of truth for wizard step and
phase** — not local state. This is what keeps the browser Back button active throughout the flow.

- `Wizard` component derives `step: 1 | 2 | 3` from `useSearchParams().get('step')`. The
  `const [step, setStep]` pattern does NOT exist — there is no `setStep`.
- "Next" button calls `router.push('?step=N')` — writes a browser history entry.
- "Back" button calls `router.back()` — pops the history stack.
- `AcademicWritingPage` derives `phase: 'config' | 'writing'` from
  `searchParams.get('step') === 'writing' ? 'writing' : 'config'`. The `setPhase` call does NOT
  exist — `phase` is a `const`, not state.
- Clicking "Start Writing" (the `onStart` callback) calls `router.push('?step=writing')`.
- `onBack` in `WritingPanel` calls `router.back()`.
- Auth-guard `router.replace()` calls in `useEffect` are intentionally NOT `router.push()` — do
  not change those.

History sequence: `/academic-writing` → `?step=2` → `?step=3` → `?step=writing` → Back re-enables
the browser ← arrow at every transition.

## Academic Writing wizard — layout and card design

**Outer container width** is step-conditional (`step <= 2 ? 'max-w-3xl' : 'max-w-lg'`): wide for
steps 1 and 2 so the horizontal card grids have room; narrow for step 3 (Confirm).

**Outer card background** is also step-conditional (`step === 3 ? card : {}`): the frosted glass
card style only applies on step 3. Steps 1 and 2 render transparently — option tiles float
directly on the page background. Do NOT revert this to a uniform card style.

**Step 1 — source selection**: `SourceTile` is a vertical card (emoji on top, title + subtitle
centered below, `minHeight: 160px`). The three tiles sit in a `grid grid-cols-3 gap-6`. Expanded
sub-content (dropzone / document list / session list) renders as a full-width sibling below the
grid, NOT nested inside the grid cells.

**Step 2 — writing type**: Three cards in `grid grid-cols-3 gap-6`, `minHeight: 180px`. Only three
types exist: `essay` (חיבור), `research` (עבודת מחקר), `summary` (סיכום). The `email` option was
permanently removed — do not add it back. `WritingTypeId` derives from `WRITING_TYPES as const` so
the TypeScript type automatically reflects the three valid IDs.

## Academic Writing — generation constants

Both sides must agree on these values (frontend sends `targetWordCount` explicitly so the backend
uses the same target):

| Constant | Location | Value | Purpose |
|---|---|---|---|
| `WORDS_PER_PAGE` | `academic-writing/page.tsx` | **400** | Word target per page |
| `CHUNKS_PER_PAGE` | `academic-writing/page.tsx` | **2** | Max chunks per page (safety net) |
| `chunk_word_min` | `backend/api/export.py` | **380** | Minimum words per body chunk |
| `chunk_word_max` | `backend/api/export.py` | **520** | Maximum words per body chunk |
| `max_tokens` (generate-paper) | `backend/api/export.py` | **1500** | LLM token ceiling per chunk |

`isFinalSection` is the PRIMARY stopping condition (`wordsSoFar >= targetWords`); chunk count is a
fallback safety net. The conclusion chunk targets ~200–300 words (not `chunk_word_min/max`) — the
pacing instruction is hardcoded separately for the final chunk.

## Academic Writing — writing type format injection

The frontend sends `writingType: 'essay' | 'research' | 'summary' | null` as a top-level field in
every `/generate-paper` POST body. The backend (`export.py`) extracts it and appends a
`_WRITING_TYPE_BLOCKS[writing_type]` string at the **very end** of the system prompt (maximum
recency weight). Each block contains strong structural override instructions specific to the type:

- `essay`: No abstract/methodology/bibliography; thesis-driven `## פתיחה`/body/`## סיכום`; personal argumentative voice.
- `research`: Standard academic paper structure (תקציר → מבוא → body → סיכום → מקורות).
- `summary`: Bullet-point-first, bold key terms, `## נקודות מפתח` closing; flowing prose prohibited.

The `_WRITING_TYPE_BLOCKS` dict also has an `email` key (dead code, harmless) retained for safety.

## Student CRM — global LLM profile injection

`backend/api/middleware.py` exports `_build_student_crm(user) -> str` which builds a student
profile string from `institution`, `country`, `degree_type`, `primary_major`, `secondary_major`,
`study_year`, `ai_style`, and `crm_profile` (a freeform AI-tutor-notes field). This string is
injected into the system prompt of every LLM call in `documents.py` (`/ask`), `export.py`
(`/generate-paper`), and `professor.py`. The injection block is a no-op when the string is empty
(user hasn't completed onboarding).

## Course isolation — `courseName` in all API payloads

All RAG endpoints pass `course_name` to `hybrid_search`. The frontend sends `courseName` (camelCase)
in every API payload where a course is active:

- `/ask` (workspace): `if (selectedCourse?.name) payload.course_name = selectedCourse.name;`
- `/generate-paper` (academic-writing): `courseName: selectedCourse?.name ?? null`
- `/professor-simulator/ask`: `course_name: selectedCourse?.name ?? ''`

Do not make RAG calls without forwarding the active course — it causes cross-course context leakage.

## Empty scaffold directories — ignore

`components/` and `lib/` at the frontend root, and `src/components/Chat/` and
`src/components/Dashboard/`, are all empty. They predate the current flat `src/components/*.tsx`
layout and aren't wired into anything — don't be misled into thinking chat/dashboard pieces live
there; e.g. the dashboard UI is `src/app/dashboard/page.tsx` and chat is inline in
`workspace/page.tsx`.

## `locales/landing.ts` — one-off dictionary pattern (landing page only)

`src/app/locales/landing.ts` (339 lines) is a dedicated `{ he: {...}, en: {...} }` translation
object imported only by `src/app/page.tsx` (the marketing landing page, including its blog post
copy). This is a deliberate exception to the root CLAUDE.md's "inline `const he = lang === 'he'`"
i18n convention — the landing page's copy volume (long blog excerpts, multi-paragraph card text)
made an inline approach unwieldy. Don't propagate this dictionary pattern to other pages; it exists
because of this one page's unusual amount of static prose.

## Routes not in the root monorepo tree

These pages exist under `src/app/` but aren't listed in the root CLAUDE.md's monorepo layout:

- `login/page.tsx` and `register/page.tsx` — both are 10-line client components that just call
  `router.replace('/?login=true')` / `router.replace('/?register=true')`. The real login/register
  UI is the auth modal on the landing page (`page.tsx`); these routes exist only so links to
  `/login` or `/register` redirect there correctly.
- `reset-password/page.tsx` (225 lines) — standalone page (not a modal) for the
  `POST /api/reset-password` flow; reads `?token=` from the URL (sent via the password-reset
  email — see `services/email.py`).
- `onboarding/page.tsx` (775 lines) — post-registration form (country/institution/degree/majors
  with autocomplete dropdowns), guarded by `if (!getToken()) router.replace('/?login=true')`,
  submits via `POST /api/user/onboarding`, then `router.push('/workspace')`.

**Error boundaries** (all three are `'use client'`; all render RTL Hebrew matcha-styled fallback UI):
- `error.tsx` — route-segment boundary; catches errors thrown inside page/layout components. Renders inside the normal `<html>/<body>` shell (root layout stays intact). Has a "נסה שוב" (`reset()`) button and a "דף הבית" button.
- `global-error.tsx` — root-layout boundary; owns its own `<html>/<body>`. Catches errors inside providers/fonts/global CSS. Same button set.
- `not-found.tsx` — rendered by Next.js when `notFound()` is called or a route has no match.

## Sidebar/header icon convention — `lucide-react`, never emoji

All "full-nav sidebar" copies (the 10 pages listed in the root CLAUDE.md plus `admin/AdminShell.tsx`)
use `lucide-react` icons for nav items and profile-menu entries — emoji were fully removed from
sidebar nav, admin sections, profile menus, and matching page-header "identity" icons. Fixed
mapping — keep any new full-nav page consistent with this:

| Nav item | Icon | Import alias |
|---|---|---|
| Home | `Home` | `HomeIcon` in `workspace/page.tsx` only (collides with its own `function Home()` default export) |
| StudyLab | `BookOpen` | — |
| Academic Writing | `PenTool` | — |
| Create Presentation | `Presentation` | `PresentationIcon` (kept consistently in every "presentation"-named file) |
| Professor's Brain | `Brain` | — |
| Mastery | `Target` | — |
| My Documents | `Folder` | — |
| Settings | `Settings` | `IconSettings` |
| Admin → Platform | `Monitor` | — |
| Admin → Course Assignments | `GraduationCap` | — |
| Profile menu → Logout | `LogOut` | — |

Page-header "identity" icons mirror the nav icon for that page (e.g. Mastery's hero icon and
Presentation Generator's empty-state icon both use `Target`/`Presentation` respectively, matching
their own nav entry). All other emoji — quiz feedback (🌟🎉💪✓✗), `WRITING_TYPES`/preference-toggle
icons, course color icons, file-type icons in `presentation-generator`, and `⚠️` error spans — are
intentionally untouched: they're content/feature icons, not navigation/header chrome.

## `AcademicRichEditor.tsx` — Markdown rich-text editor (academic-writing only)

`src/components/AcademicRichEditor.tsx` wraps `@uiw/react-md-editor` with three custom toolbar
commands (insert image / equation / code block) and KaTeX + Prism rendering in the preview pane.
Used exclusively by `academic-writing/page.tsx`. **Must always be loaded via
`dynamic(() => import(...), { ssr: false })`** — `@uiw/react-md-editor` touches `window` at module
evaluation time and will break SSR otherwise.

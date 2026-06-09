# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The monorepo-level `../CLAUDE.md` is the authoritative architecture reference (provider tree, design
tokens, API surface, conventions, etc.) — read it first. The notes below cover things that have
since changed or aren't yet captured there.

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

`workspace/page.tsx`: 3017 lines. `academic-writing/page.tsx`: ~2078 lines. Both follow the
same single-file, inline-everything pattern — the root CLAUDE.md has the up-to-date counts.

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

## `AcademicRichEditor.tsx` — Markdown rich-text editor (academic-writing only)

`src/components/AcademicRichEditor.tsx` wraps `@uiw/react-md-editor` with three custom toolbar
commands (insert image / equation / code block) and KaTeX + Prism rendering in the preview pane.
Used exclusively by `academic-writing/page.tsx`. **Must always be loaded via
`dynamic(() => import(...), { ssr: false })`** — `@uiw/react-md-editor` touches `window` at module
evaluation time and will break SSR otherwise.

## Commands (run from `frontend/`)

```bash
npm run dev      # dev server (Turbopack, hot reload) — http://localhost:3000
npm run build    # production build
npm run lint     # ESLint — must pass before committing
npx tsc --noEmit # type-check without emitting
npm run clean    # rm -rf .next (use when Turbopack cache misbehaves after big refactors)
```

There is no test suite configured (no `*.test.*`/`*.spec.*` files, no test script in `package.json`).

To lint or type-check a single file, pass its path directly, e.g.
`npx eslint src/app/academic-writing/page.tsx` or rely on `tsc --noEmit` (project-wide; TS has no
single-file mode that respects `tsconfig.json` path aliases).

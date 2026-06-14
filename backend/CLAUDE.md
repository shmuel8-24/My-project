# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The monorepo-level `../CLAUDE.md` is the authoritative architecture reference (layered module
structure, data models, full API surface, retrieval pipeline, slide/paper generation flows, env
vars, etc.) — read it first. This file covers backend-only setup/verification notes that aren't
captured there.

## Running (from `backend/`)

```bash
source .venv/bin/activate && python app.py   # → http://localhost:5003, must run from backend/
```

**`fitz` (PyMuPDF)** is not installed in `.venv` — it lives in
`/opt/anaconda3/envs/New_env_conda/`. Any code path that imports `fitz` (PDF parsing —
`services/pdf.py`, `api/presentation_agent.py`'s `parse_document`, etc.) must run via
`/opt/anaconda3/envs/New_env_conda/bin/python`, not `.venv/bin/python`.

## No tests, no linter configured

There is no test suite (no `test_*.py`/`pytest.ini`/`conftest.py`) and no Python lint/format config
(`.flake8`, `pyproject.toml`, `.pylintrc`, `ruff.toml`) anywhere in `backend/`. The fastest
correctness check after editing `api/*`/`services/*`/`models/*` is importing the app, which pulls
in the full blueprint graph and fails loudly on any import-time error:

```bash
source .venv/bin/activate && python -c "import app; print(list(app.app.blueprints))"
```

## `requirements.txt` is a raw venv dump, not a curated dependency list

It includes many packages unrelated to this app (crewai, gradio, streamlit, llama_cpp_python,
python-telegram-bot, yfinance, etc.) — these are leftovers from a shared environment, not actual
dependencies. Don't infer the stack from this file; trust what's actually imported under `api/`,
`services/`, `models/`, `extensions.py`.

## Adding a new blueprint or service module

Layering is `models/` ← `extensions.py` ← `services/*` ← `api/*` ← `app.py`, enforced by
convention (no cycles): a `services/*` module may import `models`/`extensions` but never `api/*`;
an `api/*` blueprint may import `services/*`/`extensions`/`models` but should not import other
`api/*` modules. A new blueprint must be registered in `api/__init__.py::register_blueprints`
(imports + `app.register_blueprint(...)`) — `app.py` itself only calls
`register_blueprints(app)` and never imports individual blueprint modules.

## `app.py` runtime specifics

- CORS (`flask_cors`) is locked to `http://localhost:3000` / `http://127.0.0.1:3000`, with
  `supports_credentials=True` and `MAX_CONTENT_LENGTH` = 100 MB.
- 404/429/500 error handlers always return JSON (`{"error": ...}`) instead of Werkzeug's default
  HTML pages — the frontend's `res.json()` would otherwise throw `Unexpected token '<'`. New error
  paths should preserve this (return `jsonify({"error": ...}), <code>`, never raise unhandled).
- A macOS-only shim at the top of the file searches `/opt/homebrew/lib` and `/usr/local/lib` for
  `libgobject-2.0.0.dylib` and prepends the matching dir to `DYLD_LIBRARY_PATH` *before* any
  imports, so `cffi`/WeasyPrint can `dlopen` Homebrew's `pango` when `/export-pdf` first runs. If
  `/export-pdf` fails with a `cffi`/`gobject` load error, check this shim found the right prefix
  (e.g. `brew install pango` installed somewhere else).
- Startup order matters and is fixed: `extensions` (loads `.env`, builds singletons) → `models`
  (creates DB engine + runs idempotent migrations) → Flask app/CORS/limiter init → error handlers →
  `register_blueprints(app)` → `services.startup.start_background_threads()` →
  `api.admin.start_cfo_scheduler()`.

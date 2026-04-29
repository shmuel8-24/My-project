# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in real values
```

## Running the server

```bash
python app.py
```

Default port is `5003` (macOS port 5000 is occupied by AirPlay). Override via the `PORT` env var.

## Verify the server is up

```bash
curl http://localhost:5003/health
# → {"status": "ok"}
```

## Test the AI endpoint

```bash
curl -X POST http://localhost:5003/test-ai \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
# → {"reply": "..."}
```

## Environment variables

All secrets live in `.env` (gitignored). `.env.example` is the committed template. `load_dotenv()` is called once at module load in `app.py`, so any new variable added to `.env` is immediately available via `os.getenv()` anywhere in the app.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API access |
| `PORT` | Server port (default `5003`) |
| `FLASK_ENV` | Set to `development` to enable Flask debug mode |

## Architecture

This is an early-stage AI backend. The single entry point is `app.py`, which creates the Flask `app` object and a module-level `OpenAI` client (instantiated once at startup from `OPENAI_API_KEY`). All routes are registered on the `app` object directly; use Flask Blueprints when the route count grows.

### Current endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/test-ai` | Send `{"message": "..."}`, get `{"reply": "..."}` from `gpt-4o-mini` |

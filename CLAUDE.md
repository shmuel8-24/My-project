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

Default port is `5001` (macOS port 5000 is occupied by AirPlay). Override via the `PORT` env var.

## Verify the server is up

```bash
curl http://localhost:5001/health
# → {"status": "ok"}
```

## Environment variables

All secrets live in `.env` (gitignored). `.env.example` is the committed template. `load_dotenv()` is called once at module load in `app.py`, so any new variable added to `.env` is immediately available via `os.getenv()` anywhere in the app.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API access |
| `PORT` | Server port (default `5001`) |
| `FLASK_ENV` | Set to `development` to enable Flask debug mode |

## Architecture

This is an early-stage AI backend. The single entry point is `app.py`, which creates the Flask `app` object. All routes will be registered on that object (or on Blueprints imported into it as the codebase grows).

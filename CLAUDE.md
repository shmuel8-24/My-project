# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**KuraNote** — an agentic AI CRM for students. A Telegram bot backed by a 6-agent CrewAI crew. Each agent represents a startup founder role (CEO, CTO, CFO, CMO, Legal, Vision) and analyzes every incoming user message from their specific domain. All agent output is in Hebrew.

## Running the bot

```bash
python bot.py
```

`_validate_env()` runs first and exits immediately if any required token is missing. `register_webhook()` then calls Telegram's `setWebhook` API. The Flask dev server starts on `PORT` (default 5000) with `threaded=True`.

For production, use gunicorn:

```bash
gunicorn bot:app --bind 0.0.0.0:5000 --workers 1 --threads 4
```

## Required environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM + embeddings |
| `OPENAI_MODEL` | Model name (default: `gpt-4o`) |
| `TELEGRAM_TOKEN` | Main bot — Conor (CEO) + webhook polling |
| `TELEGRAM_TOKEN_VISION` | Luke (Vision & Brand) |
| `TELEGRAM_TOKEN_CTO` | Indiana (CTO) |
| `TELEGRAM_TOKEN_LEGAL` | Saul (Legal) |
| `TELEGRAM_TOKEN_CMO` | Ted (CMO) |
| `TELEGRAM_TOKEN_CFO` | Kobe (CFO) |
| `WEBHOOK_URL` | Public HTTPS base URL for Telegram webhook (e.g. `https://yourdomain.com`) |
| `PORT` | Flask port (default: `5000`) |

## Package versions (critical)

This project requires **crewai ≥ 0.80** and **langchain-openai ≥ 0.2.0**. Older versions (crewai 0.11.x + langchain 0.1.x) use a `pydantic.v1` compatibility shim that is fundamentally broken on Python 3.14, producing `ConfigError: unable to infer type for attribute "llm_output"` across dozens of internal langchain classes. There is no code-level workaround; the package upgrade is required.

```bash
pip install "crewai>=0.80" "langchain-openai>=0.2.0" flask python-dotenv requests
```

## Architecture

### Request flow

```
Telegram → POST /webhook → webhook()
              └─ threading.Thread(target=run_crew) → returns "ok" 200 immediately
                    └─ build_crew(chat_id)
                          └─ crew.kickoff(inputs={"user_request": text})
                                └─ 6 tasks run sequentially
                                      └─ each task.callback → send_telegram_message(agent_token, chat_id, output)
```

The webhook handler **must** return 200 immediately or Telegram retries. The crew (which can take minutes) always runs in a daemon background thread.

### Crew construction

`build_crew(chat_id)` is called fresh for every request. This is intentional: each agent's `make_task_callback(token, chat_id)` closure must capture the current `chat_id`, and there is no thread-safe way to share this across a pre-built crew. CrewAI's memory (SQLite + ChromaDB) is file-based and persists across crew instances.

### Agent → token mapping (immutable)

| Agent | Token env var |
|---|---|
| Conor (CEO) | `TELEGRAM_TOKEN` |
| Luke (Vision & Brand) | `TELEGRAM_TOKEN_VISION` |
| Indiana (CTO) | `TELEGRAM_TOKEN_CTO` |
| Saul (Legal) | `TELEGRAM_TOKEN_LEGAL` |
| Ted (CMO) | `TELEGRAM_TOKEN_CMO` |
| Kobe (CFO) | `TELEGRAM_TOKEN_CFO` |

Never swap these. Each agent's Telegram message appears to come from a different bot, giving each founder a distinct identity in the group chat.

### Task template variable

Task descriptions contain the literal string `{user_request}` (not an f-string). CrewAI substitutes this at `crew.kickoff(inputs={"user_request": text})` time. The `AGENT_RULES` prefix in each task description (embedded via f-string) enforces Hebrew-only output with no greetings, sign-offs, or self-identification.

### Memory

`memory=True` on `Crew` enables:
- **Long-term memory**: SQLite (local file, persists across restarts)
- **Short-term memory**: ChromaDB (local vector store)
- **Embedder**: OpenAI `text-embedding-3-small` (vectors stored locally, only computation is remote)

SQLite and ChromaDB files are gitignored via `*.sqlite3`.

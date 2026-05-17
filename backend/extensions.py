import os
import re

import chromadb
import jwt as pyjwt
from dotenv import load_dotenv
from flask import request
from flask_limiter import Limiter
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI

load_dotenv()

# ── JWT ───────────────────────────────────────────────────────────────────────
SECRET_KEY  = os.getenv("SECRET_KEY", "levy-ai-dev-secret-change-in-production")
TOKEN_TTL_H = 24

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()

# ── OpenAI ────────────────────────────────────────────────────────────────────
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ── Tavily (optional) ─────────────────────────────────────────────────────────
try:
    from tavily import TavilyClient as _TavilyClient
    _tavily_key = os.getenv("TAVILY_API_KEY")
    tavily_client = _TavilyClient(api_key=_tavily_key) if _tavily_key else None
    print("[Tavily] web search " + ("enabled" if tavily_client else "disabled (TAVILY_API_KEY not set)"))
except ImportError:
    tavily_client = None
    print("[Tavily] tavily-python not installed — web search disabled")

# ── Resend (optional) ─────────────────────────────────────────────────────────
try:
    import resend as _resend_mod
    _RESEND_OK = True
except ImportError:
    _resend_mod = None  # type: ignore[assignment]
    _RESEND_OK  = False

# ── ChromaDB + embeddings ─────────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path="./data/db")

embeddings_model = OpenAIEmbeddings(
    model="text-embedding-3-small",
    api_key=os.getenv("OPENAI_API_KEY"),
)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1500,
    chunk_overlap=300,
    separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
)

TOP_K = 8
RRF_K = 60

# ── Per-user in-memory caches (shared across all requests) ────────────────────
_collection_map: dict[int, object] = {}
_bm25_map:       dict[int, dict]   = {}
_images_map:     dict[int, dict]   = {}

# ── LLM tool definitions ──────────────────────────────────────────────────────
SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": (
            "Search the internet for current events, real-world facts, or topics not "
            "covered in the uploaded PDF documents. Use when the document context is "
            "clearly insufficient or the user asks for up-to-date / external information. "
            "Do NOT use when the PDF context already answers the question."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query — use the most effective language for the topic",
                }
            },
            "required": ["query"],
        },
    },
}

CODE_INTERPRETER_TOOL = {
    "type": "function",
    "function": {
        "name": "code_interpreter",
        "description": (
            "Execute Python code for mathematical calculations, physics/engineering simulations, "
            "numerical analysis, statistics, or data visualizations. Use proactively whenever "
            "the user asks to calculate, simulate, plot, or analyse anything numerical. "
            "Available libraries: numpy (as np), scipy (integrate, optimize, stats, linalg, fft), "
            "matplotlib (as plt), math. Always use print() for text output. "
            "Use plt.figure() / plt.plot() etc. for charts — do NOT call plt.show()."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": (
                        "Well-commented Python code to execute. Use print() for every "
                        "result you want to surface. Figures are captured automatically."
                    ),
                }
            },
            "required": ["code"],
        },
    },
}

# ── Rate limiter (bound to Flask app via limiter.init_app() in app.py) ────────
def _rate_limit_key() -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = pyjwt.decode(auth[7:], SECRET_KEY, algorithms=["HS256"])
            return f"user:{payload['user_id']}"
        except Exception:
            pass
    return f"ip:{request.remote_addr}"


limiter = Limiter(key_func=_rate_limit_key, default_limits=[], storage_uri="memory://")

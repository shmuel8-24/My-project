import os
# Homebrew libs (Apple Silicon: /opt/homebrew, Intel: /usr/local) are not in the
# default dyld search path. Setting DYLD_LIBRARY_PATH here lets cffi/WeasyPrint
# find pango/gobject at dlopen time when the /export-pdf route first fires.
_hb = next(
    (p for p in ('/opt/homebrew/lib', '/usr/local/lib')
     if os.path.isfile(f'{p}/libgobject-2.0.0.dylib')),
    None,
)
if _hb and _hb not in os.environ.get('DYLD_LIBRARY_PATH', ''):
    os.environ['DYLD_LIBRARY_PATH'] = f"{_hb}:{os.environ.get('DYLD_LIBRARY_PATH', '')}".strip(':')

import functools
import json
import re
import base64
import secrets
import threading
import numpy as np
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, request, send_file, Response, stream_with_context
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import jwt as pyjwt
try:
    import resend as _resend
    _RESEND_OK = True
except ImportError:
    _resend = None  # type: ignore[assignment]
    _RESEND_OK = False
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb
import fitz  # PyMuPDF — correct logical-order extraction for Hebrew/RTL text
from rank_bm25 import BM25Okapi
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, ForeignKey, func as sql_func, text as sql_text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

load_dotenv()

# Set the non-interactive Agg backend before pyplot is first imported anywhere.
import matplotlib
matplotlib.use("Agg")

# ── JWT config ────────────────────────────────────────────────────────────────
SECRET_KEY   = os.getenv("SECRET_KEY", "levy-ai-dev-secret-change-in-production")
TOKEN_TTL_H  = 24  # hours

# ── SQLite chat-history DB ────────────────────────────────────────────────────
_Base = declarative_base()


class User(_Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name    = Column(String(100), nullable=False, server_default='')
    last_name     = Column(String(100), nullable=False, server_default='')
    role          = Column(String(20),  nullable=False, server_default='user')  # 'user' | 'admin'
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    sessions      = relationship(
        "ChatSession", back_populates="owner",
        cascade="all, delete-orphan",
    )


class OtpCode(_Base):
    """Short-lived one-time password codes for passwordless login."""
    __tablename__ = "otp_codes"
    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String(255), nullable=False, index=True)
    code       = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)          # naive UTC
    used       = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSession(_Base):
    __tablename__ = "sessions"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title      = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    messages   = relationship(
        "ChatMessage", back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )
    owner = relationship("User", back_populates="sessions")


class ChatMessage(_Base):
    __tablename__ = "messages"
    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role       = Column(String(20), nullable=False)   # "user" | "assistant"
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    session    = relationship("ChatSession", back_populates="messages")


_db_engine  = create_engine("sqlite:///./chat.db", connect_args={"check_same_thread": False})
_Base.metadata.create_all(bind=_db_engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_db_engine)

# ── DB migrations ─────────────────────────────────────────────────────────────
with _db_engine.connect() as _conn:
    for _stmt, _msg in [
        (
            "ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)",
            "added user_id to sessions",
        ),
        (
            "ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NOT NULL DEFAULT ''",
            "added first_name to users",
        ),
        (
            "ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NOT NULL DEFAULT ''",
            "added last_name to users",
        ),
        (
            "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'",
            "added role to users",
        ),
        # otp_codes is a new table — create_all handles it; no ALTER needed.
    ]:
        try:
            _conn.execute(sql_text(_stmt))
            _conn.commit()
            print(f"[DB] Migration: {_msg}")
        except Exception:
            pass  # Column already exists
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

try:
    from tavily import TavilyClient as _TavilyClient
    _tavily_key = os.getenv("TAVILY_API_KEY")
    tavily_client = _TavilyClient(api_key=_tavily_key) if _tavily_key else None
    print("[Tavily] web search " + ("enabled" if tavily_client else "disabled (TAVILY_API_KEY not set)"))
except ImportError:
    tavily_client = None
    print("[Tavily] tavily-python not installed — web search disabled")

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

# ── ChromaDB (one global client; per-user collections created on demand) ──────
chroma_client = chromadb.PersistentClient(path="./db")

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

# ── Per-user in-memory state ──────────────────────────────────────────────────
# _collection_map  : user_id → chromadb.Collection
# _bm25_map        : user_id → {index, ids, chunks, metadatas}
# _images_map      : user_id → {filename → {base64, mime}}
_collection_map: dict[int, object] = {}
_bm25_map:       dict[int, dict]   = {}
_images_map:     dict[int, dict]   = {}


def get_user_collection(user_id: int):
    if user_id not in _collection_map:
        _collection_map[user_id] = chroma_client.get_or_create_collection(
            f"documents_u{user_id}",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection_map[user_id]


def get_user_bm25(user_id: int) -> dict:
    return _bm25_map.get(
        user_id,
        {"index": None, "ids": [], "chunks": [], "metadatas": []},
    )


def get_user_images(user_id: int) -> dict:
    return _images_map.setdefault(user_id, {})


# ── Hebrew-aware tokenizer ────────────────────────────────────────────────────
def tokenize_hebrew(text: str) -> list[str]:
    text = re.sub(r"[֑-ׇ]", "", text)
    return [t for t in re.findall(r"\w+", text.lower(), re.UNICODE) if len(t) > 1]


def rebuild_user_bm25(user_id: int) -> None:
    col   = get_user_collection(user_id)
    total = col.count()
    if total == 0:
        _bm25_map[user_id] = {"index": None, "ids": [], "chunks": [], "metadatas": []}
        print(f"[BM25] u{user_id}: index cleared")
        return
    result    = col.get(include=["documents", "metadatas"])
    ids       = result["ids"]
    chunks    = result["documents"]
    metadatas = result["metadatas"]
    tokenized = [tokenize_hebrew(c) for c in chunks]
    _bm25_map[user_id] = {
        "index":     BM25Okapi(tokenized),
        "ids":       ids,
        "chunks":    chunks,
        "metadatas": metadatas,
    }
    doc_names = {m.get("source", "?") for m in metadatas}
    print(f"[BM25] u{user_id}: {total} chunks across {len(doc_names)} doc(s)")


def rrf_merge(semantic_ids: list[str], bm25_ids: list[str]) -> list[str]:
    scores: dict[str, float] = {}
    for rank, id_ in enumerate(semantic_ids):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    for rank, id_ in enumerate(bm25_ids):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def hybrid_search(user_id: int, query_text: str, n_results: int) -> tuple[list[str], list[dict]]:
    col       = get_user_collection(user_id)
    bm25_st   = get_user_bm25(user_id)
    doc_count = col.count()
    if doc_count == 0:
        return [], []

    n_fetch = min(n_results * 2, doc_count)

    query_vector = embeddings_model.embed_query(query_text)
    sem_result   = col.query(
        query_embeddings=[query_vector],
        n_results=n_fetch,
        include=["documents", "metadatas", "distances"],
    )
    sem_ids    = sem_result["ids"][0]
    sem_chunks = sem_result["documents"][0]
    sem_metas  = sem_result["metadatas"][0]

    bm25_ids: list[str] = []
    if bm25_st["index"] is not None:
        tokens = tokenize_hebrew(query_text)
        if tokens:
            scores      = bm25_st["index"].get_scores(tokens)
            top_indices = np.argsort(scores)[::-1][:n_fetch]
            bm25_ids    = [bm25_st["ids"][i] for i in top_indices if scores[i] > 0.0]

    print(f"▶ HYBRID u{user_id}: {len(sem_ids)} semantic | {len(bm25_ids)} bm25")

    if not bm25_ids:
        return sem_chunks[:n_results], sem_metas[:n_results]

    merged_ids = rrf_merge(sem_ids, bm25_ids)[:n_results]

    id_to_idx = {id_: i for i, id_ in enumerate(bm25_st["ids"])}
    chunks, metas = [], []
    for id_ in merged_ids:
        if id_ in id_to_idx:
            i = id_to_idx[id_]
            chunks.append(bm25_st["chunks"][i])
            metas.append(bm25_st["metadatas"][i])

    return chunks, metas


# ── JWT helpers ───────────────────────────────────────────────────────────────
def _make_token(user_id: int, email: str, role: str = "user") -> str:
    payload = {
        "user_id":  user_id,
        "email":    email,
        "role":     role,
        "is_admin": role == "admin",
        "iat":      datetime.now(timezone.utc),
        "exp":      datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_H),
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm="HS256")


ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()


def token_required(f):
    """Decorator that validates the Bearer JWT and injects user_id as the first arg."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Authentication required. Please log in."}), 401
        token = auth[7:]
        try:
            payload = pyjwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_id: int = payload["user_id"]
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token. Please log in again."}), 401
        return f(user_id, *args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator: validates the Bearer JWT and enforces role == 'admin' (RBAC)."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Authentication required."}), 401
        token = auth[7:]
        try:
            payload = pyjwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token. Please log in again."}), 401

        # Primary check: role field in JWT
        role         = payload.get("role", "user")
        caller_email = payload.get("email", "").lower()
        # Fallback: ADMIN_EMAIL env var (for tokens issued before role was added)
        is_admin = role == "admin" or (ADMIN_EMAIL and caller_email == ADMIN_EMAIL)
        if not is_admin:
            return jsonify({"error": "Forbidden — admin access required."}), 403
        return f(payload["user_id"], *args, **kwargs)
    return decorated


# ── Misc helpers ──────────────────────────────────────────────────────────────
def _save_ai_message(session_id: int, content: str) -> None:
    try:
        db = SessionLocal()
        try:
            db.add(ChatMessage(session_id=session_id, role="assistant", content=content))
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        print(f"[DB] failed to save AI message for session {session_id}: {exc}")


def execute_python_code(code: str, timeout: int = 25) -> dict:
    import io as _io
    import base64 as _b64
    import contextlib as _ctx
    import traceback as _tb

    result: dict = {"output": "", "error": None, "images": []}

    def _run() -> None:
        import numpy as _np
        import matplotlib.pyplot as _plt
        import math as _math

        exec_globals: dict = {
            "__builtins__": __builtins__,
            "np": _np, "numpy": _np,
            "plt": _plt, "matplotlib": matplotlib,
            "math": _math,
        }
        try:
            import scipy
            import scipy.integrate, scipy.optimize, scipy.stats
            import scipy.linalg, scipy.signal, scipy.fft
            exec_globals.update({
                "scipy": scipy,
                "integrate": scipy.integrate,
                "optimize": scipy.optimize,
                "stats": scipy.stats,
                "linalg": scipy.linalg,
                "fft": scipy.fft,
            })
        except ImportError:
            pass

        stdout_buf = _io.StringIO()
        try:
            with _ctx.redirect_stdout(stdout_buf):
                exec(compile(code, "<code_interpreter>", "exec"), exec_globals)  # noqa: S102
        except Exception:
            result["error"] = _tb.format_exc()

        result["output"] = stdout_buf.getvalue()

        images: list[str] = []
        for fig_num in _plt.get_fignums():
            buf = _io.BytesIO()
            _plt.figure(fig_num).savefig(
                buf, format="png", dpi=150,
                bbox_inches="tight", facecolor="white", edgecolor="none",
            )
            buf.seek(0)
            images.append(_b64.b64encode(buf.read()).decode("utf-8"))
        _plt.close("all")
        result["images"] = images

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    if thread.is_alive():
        result["error"] = f"Execution timed out after {timeout}s."
    return result


def extract_pptx_text(pptx_bytes: bytes) -> tuple[str, int]:
    from pptx import Presentation
    from io import BytesIO
    prs = Presentation(BytesIO(pptx_bytes))
    parts = []
    for i, slide in enumerate(prs.slides, 1):
        lines = []
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                t = " ".join(run.text for run in para.runs).strip()
                if t:
                    lines.append(t)
        if lines:
            parts.append(f"[שקופית {i}]\n" + "\n".join(lines))
    return "\n\n".join(parts), len(prs.slides)


# ── Resend email helpers ──────────────────────────────────────────────────────
def _otp_email_html(code: str) -> str:
    """Branded U-Note OTP email — dark neon theme, Hebrew RTL."""
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>קוד אימות ל-U-Note</title>
</head>
<body style="margin:0;padding:0;background:#060b18;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="padding:48px 20px;background:#060b18;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0"
             style="background:#0d1424;border-radius:20px;overflow:hidden;
                    border:1px solid rgba(0,212,255,0.2);max-width:480px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#08152b 0%,#0d2040 100%);
                     padding:36px 32px 28px;text-align:center;
                     border-bottom:1px solid rgba(0,212,255,0.15);">
            <!-- Logo mark (text fallback — SVG not reliable in email clients) -->
            <div style="display:inline-block;width:56px;height:56px;
                        background:#060b18;border-radius:14px;
                        border:2px solid rgba(0,212,255,0.4);
                        line-height:56px;text-align:center;margin-bottom:18px;">
              <span style="font-size:26px;font-weight:900;color:#00d4ff;
                           font-family:'Arial Black',Arial;">U</span>
            </div>
            <h1 style="color:#00d4ff;margin:0 0 6px;font-size:26px;font-weight:bold;
                       letter-spacing:2px;">U-Note</h1>
            <p  style="color:#4a7fa8;margin:0;font-size:13px;">שותף המחקר החכם שלך</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 32px 28px;">
            <p style="margin:0 0 10px;color:#94a3b8;font-size:15px;line-height:1.7;">שלום,</p>
            <p style="margin:0 0 28px;color:#cbd5e1;font-size:15px;line-height:1.7;">
              קוד האימות שלך ל-<strong style="color:#00d4ff;">U-Note</strong> הוא:
            </p>

            <!-- OTP box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr><td align="center">
                <div style="display:inline-block;background:#060b18;
                            border:1px solid rgba(0,212,255,0.45);
                            border-radius:16px;padding:22px 44px;
                            box-shadow:0 0 32px rgba(0,212,255,0.12);">
                  <span style="font-size:44px;font-weight:bold;letter-spacing:18px;
                               color:#00d4ff;font-family:'Courier New',monospace;">
                    {code}
                  </span>
                </div>
              </td></tr>
            </table>

            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              ⏱ הקוד בתוקף ל-<strong style="color:#94a3b8;">10 דקות</strong>.
            </p>
            <p style="margin:0;color:#475569;font-size:12px;line-height:1.6;">
              אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו בבטחה.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#080d1a;padding:18px 32px;
                     border-top:1px solid rgba(0,212,255,0.08);text-align:center;">
            <p style="margin:0;color:#334155;font-size:12px;">
              U-Note &middot; שותף המחקר החכם שלך
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send_otp_email(to_email: str, code: str) -> None:
    """Send OTP via Resend; falls back to terminal output if unavailable."""
    resend_key = os.getenv("RESEND_API_KEY", "")
    if resend_key and _RESEND_OK and _resend is not None:
        try:
            _resend.api_key = resend_key
            _resend.Emails.send({
                "from":    "U-Note <onboarding@resend.dev>",
                "to":      [to_email],
                "subject": "קוד האימות שלך ל-U-Note",
                "html":    _otp_email_html(code),
            })
            print(f"[OTP] Email sent via Resend → {to_email}")
            return
        except Exception as exc:
            print(f"[OTP] Resend error: {exc} — falling back to terminal")

    # Terminal fallback (development mode)
    print(f"\n{'─'*52}")
    print(f"  [OTP] Code for: {to_email}")
    print(f"  {'─'*8}> {code} <{'─'*8}")
    print(f"  Expires in 10 min  |  Add RESEND_API_KEY to .env")
    print(f"{'─'*52}\n")


# ── Auth routes ───────────────────────────────────────────────────────────────
@app.route("/api/check-email", methods=["POST"])
def check_email():
    """Return whether an email address is already registered."""
    data  = request.get_json()
    email = (data.get("email") or "").strip().lower() if data else ""
    if not email:
        return jsonify({"error": "Email is required"}), 400
    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == email).first() is not None
        return jsonify({"exists": exists}), 200
    finally:
        db.close()


# ── OTP: send code ───────────────────────────────────────────────────────────
@app.route("/api/send-otp", methods=["POST"])
def send_otp():
    data  = request.get_json()
    email = (data.get("email") or "").strip().lower() if data else ""
    if not email:
        return jsonify({"error": "Email is required"}), 400

    code       = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    db = SessionLocal()
    try:
        db.add(OtpCode(email=email, code=code, expires_at=expires_at))
        db.commit()
    finally:
        db.close()

    _send_otp_email(email, code)
    return jsonify({"message": "Code sent successfully"}), 200


# ── OTP: verify code → login or register ─────────────────────────────────────
@app.route("/api/verify-otp", methods=["POST"])
def verify_otp():
    data       = request.get_json()
    email      = (data.get("email")      or "").strip().lower() if data else ""
    code       = (data.get("code")       or "").strip()         if data else ""
    first_name = (data.get("first_name") or "").strip()         if data else ""
    last_name  = (data.get("last_name")  or "").strip()         if data else ""

    if not email or not code:
        return jsonify({"error": "Email and code are required"}), 400

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        otp = (
            db.query(OtpCode)
            .filter(
                OtpCode.email      == email,
                OtpCode.code       == code,
                OtpCode.used       == False,  # noqa: E712
                OtpCode.expires_at >  now,
            )
            .order_by(OtpCode.created_at.desc())
            .first()
        )
        if not otp:
            return jsonify({"error": "Invalid or expired code. Please try again."}), 401

        otp.used = True

        user = db.query(User).filter(User.email == email).first()
        if not user:
            if not first_name or not last_name:
                return jsonify({"error": "First and last name are required for new accounts."}), 400
            assigned_role = "admin" if (ADMIN_EMAIL and email == ADMIN_EMAIL) else "user"
            user = User(
                email=email,
                password_hash=generate_password_hash(secrets.token_hex(32)),
                first_name=first_name,
                last_name=last_name,
                role=assigned_role,
            )
            db.add(user)
            db.flush()
            print(f"[OTP] New user created: {first_name} {last_name} <{email}> role={assigned_role}")
        else:
            # Auto-promote existing admin-email user if role not yet set
            if ADMIN_EMAIL and email == ADMIN_EMAIL and user.role != "admin":
                user.role = "admin"
                print(f"[OTP] Auto-promoted {email} to admin")

        db.commit()
        db.refresh(user)

        token = _make_token(user.id, user.email, user.role)
        print(f"[OTP] Verified: {email} (id={user.id}, role={user.role})")
        return jsonify({
            "token":      token,
            "email":      user.email,
            "first_name": user.first_name,
            "last_name":  user.last_name,
            "role":       user.role,
        }), 200
    finally:
        db.close()


# ── Profile: read ─────────────────────────────────────────────────────────────
@app.route("/api/profile", methods=["GET"])
@token_required
def get_profile(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        session_count = db.query(sql_func.count(ChatSession.id)).filter(
            ChatSession.user_id == user_id,
        ).scalar() or 0

        message_count = (
            db.query(sql_func.count(ChatMessage.id))
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .filter(ChatSession.user_id == user_id)
            .scalar()
        ) or 0

        document_count = 0
        try:
            col = chroma_client.get_collection(f"documents_u{user_id}")
            if col.count() > 0:
                metas = col.get(include=["metadatas"])["metadatas"]
                document_count = len({m.get("source", "") for m in metas if m.get("source")})
        except Exception:
            document_count = 0

        return jsonify({
            "id":             user.id,
            "email":          user.email,
            "first_name":     user.first_name,
            "last_name":      user.last_name,
            "created_at":     user.created_at.isoformat(),
            "session_count":  session_count,
            "message_count":  message_count,
            "document_count": document_count,
        }), 200
    finally:
        db.close()


# ── Profile: update name ──────────────────────────────────────────────────────
@app.route("/api/profile", methods=["PATCH"])
@token_required
def update_profile(user_id: int):
    data       = request.get_json()
    first_name = (data.get("first_name") or "").strip() if data else ""
    last_name  = (data.get("last_name")  or "").strip() if data else ""
    if not first_name or not last_name:
        return jsonify({"error": "First and last name are required"}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.first_name = first_name
        user.last_name  = last_name
        db.commit()
        return jsonify({
            "email":      user.email,
            "first_name": user.first_name,
            "last_name":  user.last_name,
        }), 200
    finally:
        db.close()


# ── Admin: list all users ─────────────────────────────────────────────────────
@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_list_users(_user_id: int):
    db = SessionLocal()
    try:
        rows = (
            db.query(
                User,
                sql_func.count(sql_func.distinct(ChatSession.id)).label("session_count"),
                sql_func.count(ChatMessage.id).label("message_count"),
            )
            .outerjoin(ChatSession, ChatSession.user_id == User.id)
            .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
            .group_by(User.id)
            .order_by(User.created_at.desc())
            .all()
        )

        users = []
        for row in rows:
            user = row.User
            document_count = 0
            try:
                col = chroma_client.get_collection(f"documents_u{user.id}")
                total_chunks = col.count()
                if total_chunks > 0:
                    metas = col.get(include=["metadatas"])["metadatas"]
                    document_count = len({m.get("source", "") for m in metas if m.get("source")})
            except Exception:
                document_count = 0

            users.append({
                "id":             user.id,
                "first_name":     user.first_name,
                "last_name":      user.last_name,
                "email":          user.email,
                "role":           user.role,
                "created_at":     user.created_at.isoformat() if user.created_at else None,
                "session_count":  row.session_count,
                "message_count":  row.message_count,
                "document_count": document_count,
            })

        return jsonify({"users": users, "total": len(users)}), 200
    finally:
        db.close()


# ── Liveness check (public) ───────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


# ── File upload ───────────────────────────────────────────────────────────────
_ALLOWED_EXTS = {'.pdf', '.pptx', '.png', '.jpg', '.jpeg'}
_IMG_MIME     = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}


@app.route("/upload-pdf", methods=["POST"])
@token_required
def upload_pdf(user_id: int):
    print("DEBUG FILES:", request.files)
    raw_files   = request.files.getlist("files")
    valid_files = [f for f in raw_files if f and f.filename]
    if not valid_files:
        return jsonify({"error": "no files provided"}), 400

    col         = get_user_collection(user_id)
    user_images = get_user_images(user_id)

    text_results: list[dict] = []
    img_results:  list[dict] = []
    errors:       list[dict] = []

    for file in valid_files:
        filename = secure_filename(file.filename)
        ext      = os.path.splitext(filename.lower())[1]

        if ext not in _ALLOWED_EXTS:
            errors.append({"source": file.filename, "error": "unsupported file type"})
            continue

        if ext in _IMG_MIME:
            img_bytes = file.read()
            user_images[filename] = {
                "base64": base64.b64encode(img_bytes).decode("utf-8"),
                "mime":   _IMG_MIME[ext],
            }
            img_results.append({
                "source":        filename,
                "size":          len(img_bytes),
                "chunks_stored": 0,
                "type":          "image",
            })
            print(f"[Image] u{user_id}: stored {filename!r} ({len(img_bytes):,} bytes)")
            continue

        raw_bytes  = file.read()
        page_count = 0
        try:
            if ext == '.pptx':
                full_text, page_count = extract_pptx_text(raw_bytes)
                pages_with_text = page_count
                file_type = "pptx"
            else:
                text_parts: list[str] = []
                with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
                    page_count = len(doc)
                    for page in doc:
                        page_text = page.get_text("text")
                        if page_text and page_text.strip():
                            text_parts.append(page_text)
                full_text = "\n\n".join(text_parts)
                pages_with_text = len(text_parts)
                file_type = "pdf"
        except Exception as exc:
            errors.append({"source": filename, "error": f"parsing failed: {exc}"})
            continue

        if not full_text.strip():
            errors.append({"source": filename, "error": "no extractable text — may be scanned/image-only"})
            continue

        chunks = text_splitter.split_text(full_text)
        if not chunks:
            errors.append({"source": filename, "error": "text chunking produced no output"})
            continue

        try:
            col.delete(where={"source": filename})
        except Exception as exc:
            print(f"[upload] u{user_id}: could not purge old chunks for {filename!r}: {exc}")

        try:
            vectors = embeddings_model.embed_documents(chunks)
        except Exception as exc:
            errors.append({"source": filename, "error": f"embedding failed: {exc}"})
            continue

        ids   = [f"{filename}_chunk_{i}" for i in range(len(chunks))]
        metas = [{"source": filename, "chunk_index": i, "total_pages": page_count}
                 for i in range(len(chunks))]
        col.upsert(ids=ids, embeddings=vectors, documents=chunks, metadatas=metas)

        text_results.append({
            "source":          filename,
            "size":            len(raw_bytes),
            "pages_scanned":   page_count,
            "pages_with_text": pages_with_text,
            "chunks_stored":   len(chunks),
            "total_chars":     len(full_text),
            "type":            file_type,
        })

    if text_results:
        rebuild_user_bm25(user_id)

    all_results = text_results + img_results
    if not all_results:
        return jsonify({"error": "all files failed to process", "errors": errors}), 422

    resp: dict = {
        "message": f"{len(all_results)} file(s) processed successfully",
        "files":   all_results,
        "total_chunks_stored": sum(r.get("chunks_stored", 0) for r in all_results),
    }
    if errors:
        resp["errors"] = errors
    return jsonify(resp), 200


MAX_HISTORY_MESSAGES = 10


@app.route("/ask", methods=["POST"])
@token_required
def ask(user_id: int):
    data     = request.get_json()
    question = data.get("message") if data else None
    if not question:
        return jsonify({"error": "message is required"}), 400

    session_id_in = data.get("session_id") if data else None

    print("\n" + "━" * 62)
    print(f"▶ /ask  u{user_id}")
    print(f"  message    : {question!r}")
    print(f"  session_id : {session_id_in!r}")
    print("━" * 62)

    col         = get_user_collection(user_id)
    user_images = get_user_images(user_id)
    doc_count   = col.count()

    if doc_count == 0 and not user_images:
        return jsonify({"error": "no documents in the knowledge base — upload a file first"}), 400

    db = SessionLocal()
    try:
        if session_id_in:
            chat_session = db.query(ChatSession).filter(
                ChatSession.id == int(session_id_in),
                ChatSession.user_id == user_id,
            ).first()
            if not chat_session:
                return jsonify({"error": "session not found"}), 404
        else:
            chat_session = ChatSession(title=question[:80].strip(), user_id=user_id)
            db.add(chat_session)
            db.flush()

        session_id: int = chat_session.id

        past = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        history = [{"role": m.role, "content": m.content} for m in past[-MAX_HISTORY_MESSAGES:]]

        db.add(ChatMessage(session_id=session_id, role="user", content=question))
        chat_session.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    search_query = question
    if len(question.split()) < 5 and history:
        last_user_q = next(
            (m["content"] for m in reversed(history) if m["role"] == "user"), None
        )
        if last_user_q:
            search_query = f"{last_user_q} {question}"

    def generate():
        try:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'thinking'})}\n\n"

            chunks, metadatas = hybrid_search(user_id, search_query, min(TOP_K, doc_count))

            if not chunks and not tavily_client and not user_images:
                no_result_answer = "לא נמצאו קטעים רלוונטיים במסמך לשאלה זו. נסה לנסח אחרת."
                _save_ai_message(session_id, no_result_answer)
                payload = json.dumps({
                    "type": "result",
                    "answer": no_result_answer,
                    "sources": [], "chunks_used": 0,
                    "searched_web": False, "web_sources": [],
                    "session_id": session_id,
                }, ensure_ascii=False)
                yield f"data: {payload}\n\n"
                return

            print(f"▶ CHUNKS RETRIEVED: {len(chunks)}")

            if chunks:
                context_blocks = [
                    f"[Excerpt {i + 1} — {meta.get('source', 'document')}]\n{chunk}"
                    for i, (chunk, meta) in enumerate(zip(chunks, metadatas))
                ]
            elif user_images:
                context_blocks = ["(no text documents — respond based on the uploaded image(s))"]
            else:
                context_blocks = ["(no relevant content found in the uploaded documents)"]
            context = "\n\n".join(context_blocks)
            sources = sorted({m.get("source", "Unknown") for m in metadatas}) if metadatas else []

            web_search_instruction = ""
            if tavily_client:
                web_search_instruction = (
                    "\n\nWEB SEARCH: You have a search_web tool. "
                    "Use it when the PDF context is insufficient, the question asks about "
                    "current events or real-world facts, or the user requests external info. "
                    "Do NOT use it when the PDF context already answers the question.\n"
                    "• By default, weave web findings naturally into your answer WITHOUT mentioning "
                    "URLs, source names, or any citation markers.\n"
                    "• NEVER output a bare https:// or http:// URL under any circumstances.\n"
                    "• ONLY if the user explicitly requests sources (e.g., 'מה המקורות?', "
                    "'show sources', 'cite your sources'), provide a clean Markdown list of "
                    "[Short Label](URL) links at the very end of your response."
                )

            code_interpreter_instruction = (
                "\n\nCODE INTERPRETER — STRICT RULES:"
                "\n• NEVER write Python code blocks (```python ... ```) anywhere in your response text."
                "\n• ALWAYS call the code_interpreter tool whenever you would write or execute Python."
                "\n• You MUST call the tool for ANY of: math, physics, chemistry, engineering,"
                " statistics, numerical analysis, simulations, graphs, or plots."
                "\n• After the tool runs, explain the results in natural language — do not re-print the code."
                "\n• Writing code as plain markdown instead of calling the tool is STRICTLY FORBIDDEN."
            )

            image_instruction = ""
            if user_images:
                names = ", ".join(user_images.keys())
                image_instruction = (
                    f"\n\nIMAGES: The user has uploaded {len(user_images)} image(s) "
                    f"({names}). They are embedded in this message. Analyse them carefully "
                    "and relate relevant visual content to the question."
                )

            system_prompt = (
                "You are a scientist, engineer, and knowledgeable assistant for U-Note, "
                "serving Hebrew-speaking university students. "
                "Answer conversational questions naturally in Hebrew. "
                "For factual or document questions, base your answer on the provided context.\n\n"
                "SOURCE CITATION RULES — CRITICAL (apply to every single response):\n"
                "• By default, NEVER include citations, source references, document names, "
                "links, or a list of sources anywhere in your response. "
                "Keep answers clean and conversational — as if you just know the answer.\n"
                "• ONLY if the user explicitly asks for sources "
                "(e.g., 'מה המקורות?', 'מאיפה המידע?', 'Show sources', 'cite your sources', 'where did you get this?'), "
                "then — and ONLY then — provide a clean list of titles and URLs "
                "at the very end of your response, after a '---' separator.\n"
                "• NEVER output a bare https:// or http:// URL under any circumstances.\n\n"
                "MATH: Use LaTeX for ALL mathematical expressions — no exceptions. "
                "ALWAYS wrap every formula, symbol, or equation in delimiters: "
                "$...$ for inline (e.g., $\\psi$, $E = mc^2$) and $$...$$ for display blocks. "
                "NEVER write LaTeX commands like \\psi or \\rho as bare text outside delimiters."
                + web_search_instruction
                + code_interpreter_instruction
                + image_instruction
            )

            text_content = (
                f"---\nDOCUMENT CONTEXT:\n{context}\n---\n"
                f"USER QUESTION: {question}"
            )
            if user_images:
                current_user_message: str | list = (
                    [{"type": "text", "text": text_content}]
                    + [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{img['mime']};base64,{img['base64']}",
                                "detail": "auto",
                            },
                        }
                        for img in user_images.values()
                    ]
                )
            else:
                current_user_message = text_content

            trimmed_history  = history[-MAX_HISTORY_MESSAGES:]
            messages_for_llm = (
                [{"role": "system", "content": system_prompt}]
                + trimmed_history
                + [{"role": "user", "content": current_user_message}]
            )

            tools_list: list[dict] = [CODE_INTERPRETER_TOOL]
            if tavily_client:
                tools_list.append(SEARCH_TOOL)

            first_resp    = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages_for_llm,
                tools=tools_list,
                tool_choice="auto",
                temperature=0,
            )
            assistant_msg = first_resp.choices[0].message

            web_results:   list[dict] = []
            searched_web               = False
            executed_code: str         = ""
            code_output:   str         = ""
            all_images:    list[str]   = []

            if assistant_msg.tool_calls:
                tool_calls_dict = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in assistant_msg.tool_calls
                ]

                messages_with_tools: list[dict] = messages_for_llm + [{
                    "role": "assistant",
                    "content": assistant_msg.content,
                    "tool_calls": tool_calls_dict,
                }]

                for tc, tc_dict in zip(assistant_msg.tool_calls, tool_calls_dict):
                    tool_content: str

                    if tc.function.name == "code_interpreter":
                        yield f"data: {json.dumps({'type': 'status', 'phase': 'running_code'})}\n\n"
                        try:
                            args      = json.loads(tc.function.arguments)
                            code_str: str = args.get("code", "")
                            executed_code = code_str
                            exec_result   = execute_python_code(code_str)
                            code_output   = exec_result["output"]
                            if exec_result.get("error"):
                                code_output += f"\n[Error]:\n{exec_result['error']}"
                            all_images.extend(exec_result.get("images", []))
                            parts = []
                            if exec_result["output"]:
                                parts.append(f"STDOUT:\n{exec_result['output']}")
                            if exec_result.get("error"):
                                parts.append(f"ERROR:\n{exec_result['error']}")
                            if exec_result.get("images"):
                                n = len(exec_result["images"])
                                parts.append(f"[{n} matplotlib figure(s) rendered and shown to the user]")
                            tool_content = "\n\n".join(parts) if parts else "(code ran — no output)"
                        except Exception as exc:
                            tool_content = json.dumps({"error": str(exc)})

                    elif tc.function.name == "search_web" and tavily_client:
                        searched_web = True
                        yield f"data: {json.dumps({'type': 'status', 'phase': 'searching_web'})}\n\n"
                        try:
                            args      = json.loads(tc.function.arguments)
                            query_str = args.get("query", "")
                            search_resp = tavily_client.search(query_str, max_results=5)
                            results   = search_resp.get("results", [])
                            web_results.extend(results)
                            tool_content = json.dumps(
                                [{"title": r.get("title", ""), "url": r.get("url", ""),
                                  "content": r.get("content", "")} for r in results],
                                ensure_ascii=False,
                            )
                        except Exception as exc:
                            tool_content = json.dumps({"error": str(exc)})

                    else:
                        tool_content = json.dumps({"error": f"unknown tool: {tc.function.name}"})

                    messages_with_tools.append({
                        "role": "tool",
                        "tool_call_id": tc_dict["id"],
                        "content": tool_content,
                    })

                second_resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages_with_tools,
                    temperature=0,
                )
                answer = second_resp.choices[0].message.content
            else:
                raw_content  = assistant_msg.content or ""
                _code_blocks = re.findall(r'```(?:python|py)?\s*\n(.*?)```', raw_content, re.DOTALL)
                if _code_blocks:
                    yield f"data: {json.dumps({'type': 'status', 'phase': 'running_code'})}\n\n"
                    combined_code = "\n\n".join(cb.strip() for cb in _code_blocks)
                    executed_code = combined_code
                    exec_result   = execute_python_code(combined_code)
                    code_output   = exec_result["output"]
                    if exec_result.get("error"):
                        code_output += f"\n[Error]:\n{exec_result['error']}"
                    all_images.extend(exec_result.get("images", []))
                    answer = re.sub(
                        r'```(?:python|py)?\s*\n.*?```', '', raw_content, flags=re.DOTALL
                    ).strip()
                else:
                    answer = raw_content

            web_sources = [
                {"title": r.get("title", ""), "url": r.get("url", "")}
                for r in web_results
            ]

            _save_ai_message(session_id, answer or "")

            payload = json.dumps({
                "type": "result",
                "answer": answer,
                "sources": sources,
                "chunks_used": len(chunks),
                "searched_web": searched_web,
                "web_sources": web_sources,
                "session_id": session_id,
                "executed_code": executed_code,
                "code_output": code_output,
                "images": all_images,
            }, ensure_ascii=False)
            yield f"data: {payload}\n\n"

        except Exception as exc:
            import traceback
            print(f"[/ask] error in generate(): {exc}")
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': 'שגיאה בעיבוד השאלה. נסה שוב.'})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/documents", methods=["GET"])
@token_required
def list_documents(user_id: int):
    col   = get_user_collection(user_id)
    total = col.count()
    if total == 0:
        return jsonify({"documents": [], "total_chunks": 0}), 200

    all_metas = col.get(include=["metadatas"])["metadatas"]
    sources: dict[str, int] = {}
    for meta in all_metas:
        src = meta.get("source", "Unknown")
        sources[src] = sources.get(src, 0) + 1

    return jsonify({
        "documents":    [{"name": name, "chunks": count} for name, count in sorted(sources.items())],
        "total_chunks": total,
    }), 200


@app.route("/sessions", methods=["GET"])
@token_required
def list_sessions(user_id: int):
    db = SessionLocal()
    try:
        rows = (
            db.query(ChatSession, sql_func.count(ChatMessage.id).label("message_count"))
            .outerjoin(ChatMessage, ChatSession.id == ChatMessage.session_id)
            .filter(ChatSession.user_id == user_id)
            .group_by(ChatSession.id)
            .order_by(ChatSession.updated_at.desc())
            .all()
        )
        return jsonify({
            "sessions": [
                {
                    "id":            row.ChatSession.id,
                    "title":         row.ChatSession.title,
                    "created_at":    row.ChatSession.created_at.isoformat(),
                    "updated_at":    row.ChatSession.updated_at.isoformat(),
                    "message_count": row.message_count,
                }
                for row in rows
            ]
        }), 200
    finally:
        db.close()


@app.route("/sessions/<int:session_id>", methods=["GET"])
@token_required
def get_session(user_id: int, session_id: int):
    db = SessionLocal()
    try:
        chat_session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        ).first()
        if not chat_session:
            return jsonify({"error": "session not found"}), 404
        return jsonify({
            "session": {
                "id":         chat_session.id,
                "title":      chat_session.title,
                "created_at": chat_session.created_at.isoformat(),
                "updated_at": chat_session.updated_at.isoformat(),
            },
            "messages": [
                {
                    "id":         m.id,
                    "session_id": m.session_id,
                    "role":       m.role,
                    "content":    m.content,
                    "created_at": m.created_at.isoformat(),
                }
                for m in chat_session.messages
            ],
        }), 200
    finally:
        db.close()


@app.route("/sessions/<int:session_id>", methods=["DELETE"])
@token_required
def delete_session(user_id: int, session_id: int):
    db = SessionLocal()
    try:
        chat_session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        ).first()
        if not chat_session:
            return jsonify({"error": "session not found"}), 404
        db.delete(chat_session)
        db.commit()
        return jsonify({"message": "session deleted"}), 200
    finally:
        db.close()


@app.route("/generate-paper", methods=["POST"])
@token_required
def generate_paper(user_id: int):
    data         = request.get_json()
    topic        = (data.get("topic")        or "").strip() if data else ""
    instructions = (data.get("instructions") or "").strip() if data else ""
    if not topic:
        return jsonify({"error": "topic is required"}), 400

    col       = get_user_collection(user_id)
    doc_count = col.count()
    if doc_count == 0:
        return jsonify({"error": "no documents in the knowledge base — upload a PDF first"}), 400

    chunks, metadatas = hybrid_search(user_id, topic, min(20, doc_count))
    if not chunks:
        return jsonify({"error": "no relevant chunks found for this topic"}), 400

    context_blocks = [
        f"[קטע {i + 1} — {meta.get('source', 'מסמך')}]\n{chunk}"
        for i, (chunk, meta) in enumerate(zip(chunks, metadatas))
    ]
    context = "\n\n".join(context_blocks)
    sources  = sorted({m.get("source", "Unknown") for m in metadatas})

    system_prompt = (
        "You are an expert academic writer in Hebrew. "
        "Write a structured academic paper based ONLY on the provided context. "
        "Use formal language, include headings, and cite the sources (filenames) where possible.\n\n"
        "Format rules:\n"
        "- Output Markdown: # for the paper title, ## for section headings, **bold** for key terms\n"
        "- Structure: title, תקציר (abstract), מבוא (introduction), body sections with sub-headings, "
        "סיכום (conclusion), מקורות (references)\n"
        "- Write every sentence in formal academic Hebrew\n"
        "- Base every claim strictly on the provided context — do not invent information\n"
        "- After each factual claim, cite the source filename in parentheses, e.g., (מקור: lecture1.pdf)\n"
        "- EQUATIONS: whenever you write any mathematical, physical, or chemical formula, "
        "always use LaTeX notation. Inline: $E=mc^2$. Display block: $$\\int_0^\\infty e^{-x}\\,dx = 1$$. "
        "Never write equations as plain text."
    )

    extra = f"\nהוראות נוספות: {instructions}" if instructions else ""
    user_message = (
        f"הקשר מהמסמכים:\n---\n{context}\n---\n\n"
        f"נושא המאמר: {topic}{extra}\n\nכתוב מאמר אקדמי מקיף ומובנה."
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message},
        ],
        temperature=0.4,
        max_tokens=4000,
    )

    return jsonify({
        "paper":       response.choices[0].message.content,
        "sources":     sources,
        "chunks_used": len(chunks),
    }), 200


@app.route("/export-pdf", methods=["POST"])
@token_required
def export_pdf(user_id: int):
    try:
        import markdown as md_lib
        from weasyprint import HTML as WeasyHTML
        from io import BytesIO
    except OSError:
        return jsonify({
            "error": "PDF generation requires the pango system library. Install it with: brew install pango",
        }), 503

    data     = request.get_json()
    text     = (data.get("text")     or "").strip() if data else ""
    filename = (data.get("filename") or "u-note-paper").strip()

    if not text:
        return jsonify({"error": "text is required"}), 400

    safe_name = re.sub(r"[^\w֐-׿\s-]", "", filename)[:60].strip() or "u-note-paper"
    if not safe_name.endswith(".pdf"):
        safe_name += ".pdf"

    html_body = md_lib.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    full_html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    @page {{ margin: 2cm 2.5cm; size: A4; }}
    body {{
      font-family: Arial, Helvetica, sans-serif;
      direction: rtl;
      font-size: 11pt;
      line-height: 1.9;
      color: #1a1a1a;
    }}
    h1 {{
      font-size: 19pt; font-weight: bold; text-align: center;
      border-bottom: 2px solid #4338ca; padding-bottom: 0.3em;
      margin-top: 0; margin-bottom: 1em;
    }}
    h2 {{ font-size: 14pt; font-weight: bold; color: #312e81; margin-top: 1.5em; margin-bottom: 0.5em; }}
    h3 {{ font-size: 12pt; font-weight: bold; color: #3730a3; margin-top: 1em;   margin-bottom: 0.3em; }}
    p   {{ margin-bottom: 0.8em; text-align: justify; }}
    strong {{ font-weight: bold; }}
    em     {{ font-style: italic; }}
    blockquote {{ border-right: 4px solid #7c3aed; padding-right: 1em; margin: 1em 0; color: #555; font-style: italic; }}
    code {{ background: #f3f4f6; padding: 0.1em 0.3em; font-size: 10pt; }}
    pre  {{ background: #f3f4f6; padding: 0.8em 1em; font-size: 10pt; }}
    table {{ width: 100%; border-collapse: collapse; margin: 1em 0; }}
    th, td {{ border: 1px solid #d1d5db; padding: 0.4em 0.7em; text-align: right; }}
    th {{ background: #f9fafb; font-weight: bold; }}
    hr {{ border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }}
    ul, ol {{ padding-right: 1.5em; padding-left: 0; margin-bottom: 0.8em; }}
    li {{ margin-bottom: 0.3em; line-height: 1.7; }}
  </style>
</head>
<body>
{html_body}
</body>
</html>"""

    pdf_bytes = WeasyHTML(string=full_html).write_pdf()
    buf = BytesIO(pdf_bytes)
    buf.seek(0)
    return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name=safe_name)


@app.route("/export-docx", methods=["POST"])
@token_required
def export_docx(user_id: int):
    try:
        from docx import Document
        from docx.shared import Pt, Cm, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml import OxmlElement
        from io import BytesIO as _BytesIO
    except ImportError:
        return jsonify({"error": "python-docx not installed — run: pip install python-docx"}), 503

    data     = request.get_json()
    text     = (data.get("text")     or "").strip() if data else ""
    filename = (data.get("filename") or "u-note-paper").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    safe_name = re.sub(r"[^\w֐-׿\s-]", "", filename)[:60].strip() or "u-note-paper"
    if not safe_name.endswith(".docx"):
        safe_name += ".docx"

    doc = Document()
    sec = doc.sections[0]
    sec.page_width = sec.page_height = None
    sec.page_width  = Cm(21)
    sec.page_height = Cm(29.7)
    for _attr in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, _attr, Cm(2.5))

    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(11)

    def _rtl(para):
        pPr = para._p.get_or_add_pPr()
        pPr.append(OxmlElement("w:bidi"))
        para.alignment = WD_ALIGN_PARAGRAPH.RIGHT

    _INLINE = re.compile(
        r"\*\*(.+?)\*\*"
        r"|\*(.+?)\*"
        r"|`(.+?)`"
        r"|\$(.+?)\$",
        re.DOTALL,
    )

    def _fill(para, raw: str):
        pos = 0
        for m in _INLINE.finditer(raw):
            if m.start() > pos:
                para.add_run(raw[pos:m.start()])
            if m.group(1):
                para.add_run(m.group(1)).bold = True
            elif m.group(2):
                para.add_run(m.group(2)).italic = True
            elif m.group(3):
                r = para.add_run(m.group(3))
                r.font.name = "Courier New"
                r.font.size = Pt(9.5)
            elif m.group(4):
                r = para.add_run(m.group(4).strip())
                r.font.name = "Cambria Math"
                r.italic = True
                r.font.color.rgb = RGBColor(0x1A, 0x56, 0xDB)
            pos = m.end()
        if pos < len(raw):
            para.add_run(raw[pos:])

    text = re.sub(
        r"\$\$(.+?)\$\$",
        lambda m: "\n⟦BLOCKEQ⟧" + m.group(1).strip().replace("\n", " ") + "⟦/BLOCKEQ⟧\n",
        text, flags=re.DOTALL,
    )

    for line in text.splitlines():
        s = line.strip()

        if s.startswith("⟦BLOCKEQ⟧") and s.endswith("⟦/BLOCKEQ⟧"):
            eq = s[9:-10]
            p  = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after  = Pt(6)
            r = p.add_run(eq)
            r.font.name = "Cambria Math"
            r.font.size = Pt(13)
            r.italic    = True
            r.font.color.rgb = RGBColor(0x1A, 0x56, 0xDB)
            continue

        if not s:
            continue

        if re.fullmatch(r"[-*_]{3,}", s):
            p = doc.add_paragraph()
            r = p.add_run("─" * 60)
            r.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)
            continue

        if s.startswith("# "):
            p = doc.add_paragraph(style="Heading 1")
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            _fill(p, s[2:].strip()); _rtl(p)
            continue
        if s.startswith("## "):
            p = doc.add_paragraph(style="Heading 2")
            _fill(p, s[3:].strip()); _rtl(p)
            continue
        if s.startswith("### "):
            p = doc.add_paragraph(style="Heading 3")
            _fill(p, s[4:].strip()); _rtl(p)
            continue

        if s.startswith("- ") or s.startswith("* "):
            p = doc.add_paragraph(style="List Bullet")
            _fill(p, s[2:].strip()); _rtl(p)
            continue
        mm = re.match(r"^\d+\.\s+(.*)", s)
        if mm:
            p = doc.add_paragraph(style="List Number")
            _fill(p, mm.group(1)); _rtl(p)
            continue

        if s.startswith("> "):
            p = doc.add_paragraph(style="Quote")
            _fill(p, s[2:].strip()); _rtl(p)
            continue

        p = doc.add_paragraph()
        p.paragraph_format.space_after  = Pt(6)
        p.paragraph_format.line_spacing = Pt(18)
        _fill(p, s); _rtl(p)

    buf = _BytesIO()
    doc.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name=safe_name,
    )


@app.route("/test-ai", methods=["POST"])
@token_required
def test_ai(user_id: int):
    data    = request.get_json()
    message = data.get("message") if data else None
    if not message:
        return jsonify({"error": "message is required"}), 400

    col       = get_user_collection(user_id)
    doc_count = col.count()

    if doc_count > 0:
        question_vector = embeddings_model.embed_query(message)
        results = col.query(
            query_embeddings=[question_vector],
            n_results=min(3, doc_count),
            include=["documents"],
        )
        chunks  = results["documents"][0]
        context = "\n---\n".join(chunks)
        content = (
            f"Here is the relevant context from the document:\n\n{context}\n\n---\n\n"
            f"Based ONLY on the context above, answer the following question:\n{message}"
        )
    else:
        content = message

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": content}],
    )
    return jsonify({"answer": response.choices[0].message.content}), 200


if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5003))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)

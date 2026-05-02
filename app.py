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

from flask import Flask, jsonify, request, send_file, Response, stream_with_context
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb
import fitz  # PyMuPDF — correct logical-order extraction for Hebrew/RTL text
import json
import re
import threading
import numpy as np
from datetime import datetime, timezone
from rank_bm25 import BM25Okapi
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, func as sql_func
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

load_dotenv()

# Set the non-interactive Agg backend before pyplot is first imported anywhere
# (including inside exec() in execute_python_code). Must run at module level.
import matplotlib
matplotlib.use("Agg")

# ── SQLite chat-history DB ────────────────────────────────────────────────────
_Base = declarative_base()

class ChatSession(_Base):
    __tablename__ = "sessions"
    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    messages   = relationship(
        "ChatMessage", back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )

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
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB — handles huge PDFs
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

chroma_client = chromadb.PersistentClient(path="./db")
# hnsw:space=cosine is the right metric for OpenAI text embeddings;
# ignored for existing collections (get_or_create keeps the original config).
collection = chroma_client.get_or_create_collection(
    "pdf_documents",
    metadata={"hnsw:space": "cosine"},
)

embeddings_model = OpenAIEmbeddings(
    model="text-embedding-3-small",
    api_key=os.getenv("OPENAI_API_KEY"),
)

# Larger chunks with semantic separators give more coherent retrieval units.
# LangChain's embed_documents() batches the OpenAI API calls automatically,
# so this works efficiently even for hundreds of pages.
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1500,
    chunk_overlap=300,
    separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
)

TOP_K = 8   # final chunks kept after hybrid re-ranking
RRF_K = 60  # RRF constant — dampens rank-position differences; 60 is the canonical default


# ── Hebrew-aware tokenizer ────────────────────────────────────────────────────
def tokenize_hebrew(text: str) -> list[str]:
    """
    Tokenize Hebrew/Latin mixed text for BM25.
    - Strips niqqud and cantillation marks (U+0591–U+05C7) so that the same
      root word matches regardless of vowel pointing.
    - Splits on any non-word character; keeps tokens longer than 1 character.
    """
    text = re.sub(r"[֑-ׇ]", "", text)           # drop diacritics
    return [t for t in re.findall(r"\w+", text.lower(), re.UNICODE) if len(t) > 1]


# ── In-memory BM25 state ──────────────────────────────────────────────────────
# Rebuilt from ChromaDB at startup and after every upload.
# NOTE: This state is per-process. In a multi-worker deployment each worker
# would maintain its own copy; for a single-process dev server this is fine.
bm25_state: dict = {"index": None, "ids": [], "chunks": [], "metadatas": []}


def rebuild_bm25() -> None:
    """Fetch all chunks from ChromaDB and rebuild the BM25 index from scratch."""
    global bm25_state
    total = collection.count()
    if total == 0:
        bm25_state = {"index": None, "ids": [], "chunks": [], "metadatas": []}
        print("[BM25] index cleared — no chunks in collection")
        return
    result    = collection.get(include=["documents", "metadatas"])
    ids       = result["ids"]
    chunks    = result["documents"]
    metadatas = result["metadatas"]
    tokenized = [tokenize_hebrew(c) for c in chunks]
    bm25_state = {
        "index":     BM25Okapi(tokenized),
        "ids":       ids,
        "chunks":    chunks,
        "metadatas": metadatas,
    }
    doc_names = {m.get("source", "?") for m in metadatas}
    print(f"[BM25] index rebuilt — {total} chunks across {len(doc_names)} document(s)")


def rrf_merge(semantic_ids: list[str], bm25_ids: list[str]) -> list[str]:
    """
    Reciprocal Rank Fusion over two ranked lists.
    Score for chunk d = Σ_ranker  1 / (RRF_K + rank(d) + 1)
    Chunks present in both lists get a boosted score; order-within-list is preserved.
    """
    scores: dict[str, float] = {}
    for rank, id_ in enumerate(semantic_ids):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    for rank, id_ in enumerate(bm25_ids):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def hybrid_search(query_text: str, n_results: int) -> tuple[list[str], list[dict]]:
    """
    Hybrid retrieval: semantic (ChromaDB cosine) + keyword (BM25) via RRF.

    Strategy:
      1. Cast a 2× wider net from each ranker (up to the collection size).
      2. Merge ranked lists with RRF.
      3. Return the top-n_results chunks resolved from the in-memory BM25 state
         (avoids a second ChromaDB round-trip).
    Falls back to semantic-only when the BM25 index is not yet built or when
    the query tokenises to nothing (e.g., pure punctuation).
    """
    doc_count = collection.count()
    if doc_count == 0:
        return [], []

    n_fetch = min(n_results * 2, doc_count)

    # ── 1. Semantic search ────────────────────────────────────────────────────
    query_vector = embeddings_model.embed_query(query_text)
    sem_result   = collection.query(
        query_embeddings=[query_vector],
        n_results=n_fetch,
        include=["documents", "metadatas", "distances"],
    )
    sem_ids    = sem_result["ids"][0]           # always present in query() output
    sem_chunks = sem_result["documents"][0]
    sem_metas  = sem_result["metadatas"][0]

    # ── 2. BM25 keyword search ────────────────────────────────────────────────
    bm25_ids: list[str] = []
    if bm25_state["index"] is not None:
        tokens = tokenize_hebrew(query_text)
        if tokens:
            scores      = bm25_state["index"].get_scores(tokens)
            top_indices = np.argsort(scores)[::-1][:n_fetch]
            # Exclude zero-score entries — they share no tokens with the query.
            bm25_ids = [bm25_state["ids"][i] for i in top_indices if scores[i] > 0.0]

    print(f"▶ HYBRID: {len(sem_ids)} semantic | {len(bm25_ids)} bm25 candidates")

    # ── 3. Fallback: no BM25 signal → return semantic results directly ────────
    if not bm25_ids:
        return sem_chunks[:n_results], sem_metas[:n_results]

    # ── 4. RRF merge ──────────────────────────────────────────────────────────
    merged_ids = rrf_merge(sem_ids, bm25_ids)[:n_results]
    print(f"▶ HYBRID: {len(merged_ids)} chunks after RRF merge")

    # ── 5. Resolve chunks from in-memory state ────────────────────────────────
    id_to_idx = {id_: i for i, id_ in enumerate(bm25_state["ids"])}
    chunks, metas = [], []
    for id_ in merged_ids:
        if id_ in id_to_idx:
            i = id_to_idx[id_]
            chunks.append(bm25_state["chunks"][i])
            metas.append(bm25_state["metadatas"][i])

    return chunks, metas


# Build BM25 index from any documents already in ChromaDB (e.g., after a restart).
rebuild_bm25()


def _save_ai_message(session_id: int, content: str) -> None:
    """Persist an AI response inside the SSE generator (opens its own DB session)."""
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
    """
    Execute Python code with numpy / scipy / matplotlib in a daemon thread.

    Returns:
        {
          "output": str,          # everything printed to stdout
          "error":  str | None,   # traceback if an exception occurred
          "images": list[str],    # base64-encoded PNG strings (one per figure)
        }

    Security note: this is intentionally a permissive sandbox for a trusted
    single-developer environment.  Do NOT expose this endpoint publicly.
    """
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


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "chunks_in_db": collection.count()}), 200


@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    print("DEBUG FILES:", request.files)
    uploaded_files = request.files.getlist("files")
    valid_files = [f for f in uploaded_files if f and f.filename]
    if not valid_files:
        return jsonify({"error": "no files provided"}), 400

    results = []
    errors = []

    for file in valid_files:
        filename = secure_filename(file.filename)
        if not filename.lower().endswith(".pdf"):
            errors.append({"source": file.filename, "error": "only PDF files are accepted"})
            continue

        try:
            pdf_bytes = file.read()
            text_parts = []
            page_count = 0
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                page_count = len(doc)
                for page in doc:
                    page_text = page.get_text("text")
                    if page_text and page_text.strip():
                        text_parts.append(page_text)
        except Exception as exc:
            errors.append({"source": filename, "error": f"PDF parsing failed: {exc}"})
            continue

        full_text = "\n\n".join(text_parts)
        print(f"\n=== {filename}: first 200 chars ===")
        print(full_text[:200])

        if not full_text.strip():
            errors.append({"source": filename, "error": "no extractable text — may be scanned/image-only"})
            continue

        chunks = text_splitter.split_text(full_text)
        if not chunks:
            errors.append({"source": filename, "error": "text chunking produced no output"})
            continue

        try:
            collection.delete(where={"source": filename})
        except Exception as exc:
            print(f"[upload-pdf] Warning: could not purge old chunks for {filename!r}: {exc}")

        try:
            vectors = embeddings_model.embed_documents(chunks)
        except Exception as exc:
            errors.append({"source": filename, "error": f"embedding failed: {exc}"})
            continue

        ids = [f"{filename}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {"source": filename, "chunk_index": i, "total_pages": page_count}
            for i in range(len(chunks))
        ]
        collection.upsert(ids=ids, embeddings=vectors, documents=chunks, metadatas=metadatas)

        results.append({
            "source": filename,
            "size": len(pdf_bytes),
            "pages_scanned": page_count,
            "pages_with_text": len(text_parts),
            "chunks_stored": len(chunks),
            "total_chars": len(full_text),
        })

    # Sync BM25 index once after all uploads (single rebuild regardless of file count).
    if results:
        rebuild_bm25()

    if not results:
        return jsonify({"error": "all files failed to process", "errors": errors}), 422

    resp: dict = {
        "message": f"{len(results)} PDF(s) processed successfully",
        "files": results,
        "total_chunks_stored": sum(r["chunks_stored"] for r in results),
    }
    if errors:
        resp["errors"] = errors
    return jsonify(resp), 200


MAX_HISTORY_MESSAGES = 10  # last 5 full turns kept for LLM context


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()

    question = data.get("message") if data else None
    if not question:
        return jsonify({"error": "message is required"}), 400

    session_id_in = data.get("session_id") if data else None

    print("\n" + "━" * 62)
    print("▶ /ask  INCOMING PAYLOAD")
    print(f"  message    : {question!r}")
    print(f"  session_id : {session_id_in!r}")
    print("━" * 62)

    doc_count = collection.count()
    if doc_count == 0:
        return jsonify({"error": "no documents in the knowledge base — upload a PDF first"}), 400

    # ── DB: get/create session, load history, save user message ──────────────
    db = SessionLocal()
    try:
        if session_id_in:
            chat_session = db.query(ChatSession).filter(ChatSession.id == int(session_id_in)).first()
            if not chat_session:
                return jsonify({"error": "session not found"}), 404
        else:
            chat_session = ChatSession(title=question[:80].strip())
            db.add(chat_session)
            db.flush()

        session_id: int = chat_session.id

        # Load history BEFORE saving the new user message so it isn't included.
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
    # ─────────────────────────────────────────────────────────────────────────

    # ── BUILD SEARCH QUERY (ChromaDB only) ───────────────────────────────────
    # CRITICAL SEPARATION:
    #   • ChromaDB needs a clean, focused semantic query → use the current question.
    #   • The LLM needs the full conversation history   → passed separately below.
    # Short follow-ups (< 5 words) are enriched with the immediately-prior user
    # question to give the embedder enough signal — one prior question, not two.
    search_query = question
    if len(question.split()) < 5 and history:
        last_user_q = next(
            (m["content"] for m in reversed(history) if m["role"] == "user"), None
        )
        if last_user_q:
            search_query = f"{last_user_q} {question}"

    print(f"\n▶ EMBED_QUERY INPUT → {search_query!r}")
    if search_query != question:
        print(f"  (raw question was → {question!r}  — enriched: < 5 words)")
    print()

    def generate():
        try:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'thinking'})}\n\n"

            chunks, metadatas = hybrid_search(search_query, min(TOP_K, doc_count))

            # No PDF matches and no web search → early exit
            if not chunks and not tavily_client:
                print("▶ CHUNKS: 0 — hybrid search returned no results, Tavily unavailable")
                no_result_answer = "לא נמצאו קטעים רלוונטיים במסמך לשאלה זו. נסה לנסח אחרת."
                _save_ai_message(session_id, no_result_answer)
                payload = json.dumps({
                    "type": "result",
                    "answer": no_result_answer,
                    "sources": [],
                    "chunks_used": 0,
                    "searched_web": False,
                    "web_sources": [],
                    "session_id": session_id,
                }, ensure_ascii=False)
                yield f"data: {payload}\n\n"
                return

            print(f"▶ CHUNKS RETRIEVED: {len(chunks)}")
            for i, (chunk, meta) in enumerate(zip(chunks, metadatas)):
                print(f"  [{i}] {meta.get('source')!r} chunk#{meta.get('chunk_index')} "
                      f"| {chunk[:80]!r}...")

            context_blocks = (
                [
                    f"[Excerpt {i + 1} — {meta.get('source', 'document')}]\n{chunk}"
                    for i, (chunk, meta) in enumerate(zip(chunks, metadatas))
                ]
                if chunks
                else ["(no relevant content found in the uploaded documents)"]
            )
            context = "\n\n".join(context_blocks)
            sources = sorted({m.get("source", "Unknown") for m in metadatas}) if metadatas else []

            print(f"\n▶ CONTEXT: {len(chunks)} chunks · {len(context):,} chars total")
            print(f"  preview → {context[:200]!r}")
            print()

            web_search_instruction = ""
            if tavily_client:
                web_search_instruction = (
                    "\n\nWEB SEARCH: You have a search_web tool. "
                    "Use it when the PDF context is insufficient, the question asks about "
                    "current events or real-world facts, or the user requests external info. "
                    "Do NOT use it when the PDF context already answers the question.\n"
                    "CITATION RULES FOR WEB SOURCES — CRITICAL:\n"
                    "  • NEVER paste a raw URL (e.g., https://example.com) anywhere in your response.\n"
                    "  • Always embed web citations as a Markdown link with a short, human-readable "
                    "label of 2–4 words: [Label](URL). "
                    "Good examples: [Wikipedia – Recursion](https://en.wikipedia.org/wiki/Recursion), "
                    "[BBC News](https://www.bbc.com/news/article123).\n"
                    "  • Place these links naturally inside your sentences — the UI renders them as "
                    "beautiful clickable chips so they must be proper Markdown, not bare URLs.\n"
                    "  • Cite PDF excerpts as (מקור: filename) as usual."
                )

            code_interpreter_instruction = (
                "\n\nCODE INTERPRETER: You have a code_interpreter tool that executes Python. "
                "Use it proactively when the user asks for: complex calculations, physics or "
                "engineering simulations, numerical analysis, statistics, or any graph/plot. "
                "Write clean, commented Python. Use print() for every result. "
                "After the tool returns, synthesise the output naturally in your answer — "
                "do not dump raw numbers; explain what they mean."
            )

            system_prompt = (
                "You are a scientist, engineer, and knowledgeable assistant for Levy AI, "
                "serving Hebrew-speaking university students. "
                "For conversational questions respond naturally in Hebrew. "
                "For factual or document questions, answer based on the provided context and "
                "cite which document each claim comes from. "
                "CRITICAL URL RULE: NEVER output a bare https:// or http:// URL. "
                "Any web reference must be a Markdown link [Short Label](URL) — never a raw address."
                + web_search_instruction
                + code_interpreter_instruction
            )

            # Document context is injected ONLY into the current user turn (fresh RAG).
            # History turns go to the LLM verbatim for conversational memory.
            current_user_message = (
                f"---\n"
                f"DOCUMENT CONTEXT:\n"
                f"{context}\n"
                f"---\n"
                f"USER QUESTION: {question}"
            )

            trimmed_history = history[-MAX_HISTORY_MESSAGES:]
            messages_for_llm = (
                [{"role": "system", "content": system_prompt}]
                + trimmed_history
                + [{"role": "user", "content": current_user_message}]
            )

            print(f"▶ LLM MESSAGES: {len(messages_for_llm)} total  "
                  f"(1 system + {len(trimmed_history)} history + 1 current)")
            for m in messages_for_llm:
                preview = (m.get("content") or "")[:70].replace("\n", " ")
                print(f"  [{m['role']}] {preview!r}...")
            print()

            tools_list: list[dict] = [CODE_INTERPRETER_TOOL]
            if tavily_client:
                tools_list.append(SEARCH_TOOL)

            call_kwargs: dict = {
                "model": "gpt-4o-mini",
                "messages": messages_for_llm,
                "tools": tools_list,
                "tool_choice": "auto",
                "temperature": 0,
            }

            first_resp = client.chat.completions.create(**call_kwargs)
            assistant_msg = first_resp.choices[0].message

            web_results: list[dict] = []
            searched_web = False
            executed_code: str = ""
            code_output: str = ""
            all_images: list[str] = []

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

                    # ── code_interpreter ─────────────────────────────────────
                    if tc.function.name == "code_interpreter":
                        yield f"data: {json.dumps({'type': 'status', 'phase': 'running_code'})}\n\n"
                        try:
                            args = json.loads(tc.function.arguments)
                            code_str: str = args.get("code", "")
                            executed_code = code_str
                            print(f"[CodeInterpreter] executing {len(code_str)} chars of code")
                            exec_result = execute_python_code(code_str)
                            code_output = exec_result["output"]
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
                            print(f"[CodeInterpreter] stdout={len(exec_result['output'])} chars, "
                                  f"images={len(exec_result.get('images', []))}")
                        except Exception as exc:
                            print(f"[CodeInterpreter] error: {exc}")
                            tool_content = json.dumps({"error": str(exc)})

                    # ── search_web ────────────────────────────────────────────
                    elif tc.function.name == "search_web" and tavily_client:
                        searched_web = True
                        yield f"data: {json.dumps({'type': 'status', 'phase': 'searching_web'})}\n\n"
                        try:
                            args = json.loads(tc.function.arguments)
                            query_str = args.get("query", "")
                            print(f"[Tavily] searching: {query_str!r}")
                            search_resp = tavily_client.search(query_str, max_results=5)
                            results = search_resp.get("results", [])
                            web_results.extend(results)
                            tool_content = json.dumps(
                                [{"title": r.get("title", ""), "url": r.get("url", ""),
                                  "content": r.get("content", "")} for r in results],
                                ensure_ascii=False,
                            )
                            print(f"[Tavily] {len(results)} result(s) returned")
                        except Exception as exc:
                            print(f"[Tavily] search error: {exc}")
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
                answer = assistant_msg.content

            web_sources = [
                {"title": r.get("title", ""), "url": r.get("url", "")}
                for r in web_results
            ]

            # Persist AI response before streaming the result to the client.
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
def list_documents():
    """List unique document sources currently stored in the vector database."""
    total = collection.count()
    if total == 0:
        return jsonify({"documents": [], "total_chunks": 0}), 200

    all_metas = collection.get(include=["metadatas"])["metadatas"]
    sources: dict[str, int] = {}
    for meta in all_metas:
        src = meta.get("source", "Unknown")
        sources[src] = sources.get(src, 0) + 1

    return jsonify({
        "documents":    [{"name": name, "chunks": count} for name, count in sorted(sources.items())],
        "total_chunks": total,
    }), 200


@app.route("/sessions", methods=["GET"])
def list_sessions():
    """Return all chat sessions ordered by most-recently updated."""
    db = SessionLocal()
    try:
        rows = (
            db.query(ChatSession, sql_func.count(ChatMessage.id).label("message_count"))
            .outerjoin(ChatMessage, ChatSession.id == ChatMessage.session_id)
            .group_by(ChatSession.id)
            .order_by(ChatSession.updated_at.desc())
            .all()
        )
        return jsonify({
            "sessions": [
                {
                    "id": row.ChatSession.id,
                    "title": row.ChatSession.title,
                    "created_at": row.ChatSession.created_at.isoformat(),
                    "updated_at": row.ChatSession.updated_at.isoformat(),
                    "message_count": row.message_count,
                }
                for row in rows
            ]
        }), 200
    finally:
        db.close()


@app.route("/sessions/<int:session_id>", methods=["GET"])
def get_session(session_id: int):
    """Return all messages for a given session."""
    db = SessionLocal()
    try:
        chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not chat_session:
            return jsonify({"error": "session not found"}), 404
        return jsonify({
            "session": {
                "id": chat_session.id,
                "title": chat_session.title,
                "created_at": chat_session.created_at.isoformat(),
                "updated_at": chat_session.updated_at.isoformat(),
            },
            "messages": [
                {
                    "id": m.id,
                    "session_id": m.session_id,
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat(),
                }
                for m in chat_session.messages
            ],
        }), 200
    finally:
        db.close()


@app.route("/sessions/<int:session_id>", methods=["DELETE"])
def delete_session(session_id: int):
    """Delete a session and all its messages (cascade)."""
    db = SessionLocal()
    try:
        chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not chat_session:
            return jsonify({"error": "session not found"}), 404
        db.delete(chat_session)
        db.commit()
        return jsonify({"message": "session deleted"}), 200
    finally:
        db.close()


@app.route("/generate-paper", methods=["POST"])
def generate_paper():
    data         = request.get_json()
    topic        = (data.get("topic") or "").strip()        if data else ""
    instructions = (data.get("instructions") or "").strip() if data else ""
    if not topic:
        return jsonify({"error": "topic is required"}), 400

    doc_count = collection.count()
    if doc_count == 0:
        return jsonify({"error": "no documents in the knowledge base — upload a PDF first"}), 400

    # Hybrid search: topic drives both the semantic vector and the BM25 keyword query.
    # Instructions (length, style) are intentionally excluded from retrieval.
    chunks, metadatas = hybrid_search(topic, min(20, doc_count))
    if not chunks:
        return jsonify({"error": "no relevant chunks found for this topic"}), 400

    context_blocks = [
        f"[קטע {i + 1} — {meta.get('source', 'מסמך')}]\n{chunk}"
        for i, (chunk, meta) in enumerate(zip(chunks, metadatas))
    ]
    context = "\n\n".join(context_blocks)
    sources = sorted({m.get("source", "Unknown") for m in metadatas})

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
        "- After each factual claim, cite the source filename in parentheses, e.g., (מקור: lecture1.pdf)"
    )

    extra = f"\nהוראות נוספות: {instructions}" if instructions else ""
    user_message = (
        f"הקשר מהמסמכים:\n"
        f"---\n"
        f"{context}\n"
        f"---\n\n"
        f"נושא המאמר: {topic}{extra}\n\n"
        f"כתוב מאמר אקדמי מקיף ומובנה."
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.4,
        max_tokens=4000,
    )

    return jsonify({
        "paper":       response.choices[0].message.content,
        "sources":     sources,
        "chunks_used": len(chunks),
    }), 200


@app.route("/test-ai", methods=["POST"])
def test_ai():
    """General-purpose chat. Injects RAG context when documents are present."""
    data = request.get_json()
    message = data.get("message") if data else None
    if not message:
        return jsonify({"error": "message is required"}), 400

    doc_count = collection.count()

    if doc_count > 0:
        question_vector = embeddings_model.embed_query(message)
        results = collection.query(
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


@app.route("/export-pdf", methods=["POST"])
def export_pdf():
    """Convert Markdown text to a text-selectable PDF using WeasyPrint and return it as an attachment."""
    # WeasyPrint requires pango (system lib). Lazy-import so the server starts
    # even on machines where pango isn't yet installed; fail at request time instead.
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
    filename = (data.get("filename") or "levy-ai-paper").strip()

    if not text:
        return jsonify({"error": "text is required"}), 400

    # Allow Hebrew letters (U+0590–U+05FF), word chars, spaces, hyphens; truncate to 60 chars.
    safe_name = re.sub(r"[^\w֐-׿\s-]", "", filename)[:60].strip() or "levy-ai-paper"
    if not safe_name.endswith(".pdf"):
        safe_name += ".pdf"

    html_body = md_lib.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])

    # Pango (via WeasyPrint) applies the full Unicode BiDi algorithm, so Hebrew text
    # inside a direction:rtl document renders correctly without any manual reordering.
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
      font-size: 19pt;
      font-weight: bold;
      text-align: center;
      border-bottom: 2px solid #4338ca;
      padding-bottom: 0.3em;
      margin-top: 0;
      margin-bottom: 1em;
    }}
    h2 {{ font-size: 14pt; font-weight: bold; color: #312e81; margin-top: 1.5em; margin-bottom: 0.5em; }}
    h3 {{ font-size: 12pt; font-weight: bold; color: #3730a3; margin-top: 1em; margin-bottom: 0.3em; }}
    p   {{ margin-bottom: 0.8em; text-align: justify; }}
    strong {{ font-weight: bold; }}
    em {{ font-style: italic; }}
    blockquote {{
      border-right: 4px solid #7c3aed;
      padding-right: 1em;
      margin: 1em 0;
      color: #555;
      font-style: italic;
    }}
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

    return send_file(
        buf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=safe_name,
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5003))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)

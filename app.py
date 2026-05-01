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
import numpy as np
from rank_bm25 import BM25Okapi

load_dotenv()

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


MAX_HISTORY_MESSAGES = 10  # keep last 5 full turns to stay within token limits


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()

    # ── LOG 1: exact incoming payload ────────────────────────────────────────
    print("\n" + "━" * 62)
    print("▶ /ask  INCOMING PAYLOAD")
    print(f"  message : {(data or {}).get('message', '')!r}")
    raw_history = (data or {}).get("history", [])
    h_count = len(raw_history) if isinstance(raw_history, list) else "not-a-list"
    print(f"  history : {h_count} message(s)")
    if isinstance(raw_history, list):
        for i, m in enumerate(raw_history):
            role    = m.get("role", "?")    if isinstance(m, dict) else "?"
            preview = (m.get("content", "") if isinstance(m, dict) else str(m))[:70]
            print(f"    [{i}] {role}: {preview!r}")
    print("━" * 62)
    # ─────────────────────────────────────────────────────────────────────────

    question = data.get("message") if data else None
    if not question:
        return jsonify({"error": "message is required"}), 400

    # history: [{role: "user"|"assistant", content: "..."}] — optional, sent by frontend
    history = data.get("history", []) if data else []
    if not isinstance(history, list):
        history = []
    # Sanitise: keep only the fields OpenAI expects and only known roles
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in history
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content")
    ]

    doc_count = collection.count()
    if doc_count == 0:
        return jsonify({"error": "no documents in the knowledge base — upload a PDF first"}), 400

    # ── BUILD SEARCH QUERY (ChromaDB only) ───────────────────────────────────
    # CRITICAL SEPARATION:
    #   • ChromaDB needs a clean, focused semantic query → use the current question.
    #   • The LLM needs the full conversation history   → passed separately below.
    # Mixing history wholesale into the embedding vector dilutes cosine similarity
    # and causes retrieval drift on follow-up questions.
    #
    # The one exception: very short follow-ups (< 5 words) like "על הכל" or
    # "הסבר יותר" have no semantic content on their own. For those only, we
    # prepend the single immediately-prior user question to give ChromaDB
    # enough signal. We use ONE prior question, not two — two would over-blend.
    search_query = question
    if len(question.split()) < 5 and history:
        last_user_q = next(
            (m["content"] for m in reversed(history) if m["role"] == "user"), None
        )
        if last_user_q:
            search_query = f"{last_user_q} {question}"

    # ── LOG 2: exact string going into embed_query (BEFORE the call) ─────────
    print(f"\n▶ EMBED_QUERY INPUT → {search_query!r}")
    if search_query != question:
        print(f"  (raw question was → {question!r}  — enriched: < 5 words)")
    print()
    # ─────────────────────────────────────────────────────────────────────────

    # All expensive work runs inside the generator so status events reach the
    # client before the first OpenAI call finishes.
    def generate():
        try:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'thinking'})}\n\n"

            chunks, metadatas = hybrid_search(search_query, min(TOP_K, doc_count))

            # No PDF matches and no web search → early exit
            if not chunks and not tavily_client:
                print("▶ CHUNKS: 0 — hybrid search returned no results, Tavily unavailable")
                payload = json.dumps({
                    "type": "result",
                    "answer": "לא נמצאו קטעים רלוונטיים במסמך לשאלה זו. נסה לנסח אחרת.",
                    "sources": [],
                    "chunks_used": 0,
                    "searched_web": False,
                    "web_sources": [],
                }, ensure_ascii=False)
                yield f"data: {payload}\n\n"
                return

            # ── LOG 3: retrieved chunks ───────────────────────────────────────
            print(f"▶ CHUNKS RETRIEVED: {len(chunks)}")
            for i, (chunk, meta) in enumerate(zip(chunks, metadatas)):
                print(f"  [{i}] {meta.get('source')!r} chunk#{meta.get('chunk_index')} "
                      f"| {chunk[:80]!r}...")
            # ─────────────────────────────────────────────────────────────────

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

            # ── LOG 4: context stats + preview ───────────────────────────────
            print(f"\n▶ CONTEXT: {len(chunks)} chunks · {len(context):,} chars total")
            print(f"  preview → {context[:200]!r}")
            print()
            # ─────────────────────────────────────────────────────────────────

            web_search_instruction = ""
            if tavily_client:
                web_search_instruction = (
                    "\n\nWEB SEARCH: You have a search_web tool. "
                    "Use it when the PDF context is insufficient, the question asks about "
                    "current events or real-world facts, or the user requests external info. "
                    "Do NOT use it when the PDF context already answers the question. "
                    "Cite PDF sources as (מקור: filename) and web sources as (מקור: title)."
                )

            system_prompt = (
                "You are a helpful assistant for Levy AI, serving Hebrew-speaking university students. "
                "For conversational questions (greetings, small talk) respond naturally in Hebrew. "
                "For factual or document questions, answer based on the provided context. "
                "Cite which document each claim comes from."
                + web_search_instruction
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

            # ── LOG 5: LLM messages summary ──────────────────────────────────
            print(f"▶ LLM MESSAGES: {len(messages_for_llm)} total  "
                  f"(1 system + {len(trimmed_history)} history + 1 current)")
            for m in messages_for_llm:
                preview = (m.get("content") or "")[:70].replace("\n", " ")
                print(f"  [{m['role']}] {preview!r}...")
            print()
            # ─────────────────────────────────────────────────────────────────

            call_kwargs: dict = {
                "model": "gpt-4o-mini",
                "messages": messages_for_llm,
                "temperature": 0,
            }
            if tavily_client:
                call_kwargs["tools"] = [SEARCH_TOOL]
                call_kwargs["tool_choice"] = "auto"

            first_resp = client.chat.completions.create(**call_kwargs)
            assistant_msg = first_resp.choices[0].message

            web_results: list[dict] = []
            searched_web = False

            if assistant_msg.tool_calls and tavily_client:
                searched_web = True
                yield f"data: {json.dumps({'type': 'status', 'phase': 'searching_web'})}\n\n"

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
                    if tc.function.name != "search_web":
                        continue
                    try:
                        args = json.loads(tc.function.arguments)
                        query_str = args.get("query", "")
                        print(f"[Tavily] searching: {query_str!r}")
                        search_resp = tavily_client.search(query_str, max_results=5)
                        results = search_resp.get("results", [])
                        web_results.extend(results)
                        tool_content = json.dumps(
                            [
                                {
                                    "title": r.get("title", ""),
                                    "url": r.get("url", ""),
                                    "content": r.get("content", ""),
                                }
                                for r in results
                            ],
                            ensure_ascii=False,
                        )
                        print(f"[Tavily] {len(results)} result(s) returned")
                    except Exception as exc:
                        print(f"[Tavily] search error: {exc}")
                        tool_content = json.dumps({"error": str(exc)})

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

            payload = json.dumps({
                "type": "result",
                "answer": answer,
                "sources": sources,
                "chunks_used": len(chunks),
                "searched_web": searched_web,
                "web_sources": web_sources,
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

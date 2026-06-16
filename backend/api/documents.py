import base64
import hashlib
import json
import os
import re
from datetime import datetime, timezone

import fitz
from flask import Blueprint, Response, jsonify, request, send_file, stream_with_context
from werkzeug.utils import secure_filename

from api.middleware import (
    _get_user_refreshed,
    _save_ai_message,
    token_required,
)
from extensions import (
    CODE_INTERPRETER_TOOL,
    SEARCH_TOOL,
    client,
    embeddings_model,
    limiter,
    tavily_client,
    text_splitter,
    TOP_K,
)
from models import ChatMessage, ChatSession, SessionLocal, UserDocument, sql_func
from services.code_runner import execute_python_code
from services.pdf import extract_pptx_slides
from services.rag import get_chunks_for_files, get_user_collection, get_user_images, rebuild_user_bm25, hybrid_search
from services.security import (
    SECURITY_SYSTEM_INSTRUCTION,
    _DLP_FALLBACK,
    is_safe_output,
    redact_pii,
    strip_html,
)

documents_bp = Blueprint("documents", __name__)

_ALLOWED_EXTS = {".pdf", ".pptx", ".png", ".jpg", ".jpeg"}
_IMG_MIME     = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}

_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")


def _upload_file_path(user_id: int, file_id: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return os.path.join(_UPLOAD_DIR, f"user_{user_id}", f"{file_id}{ext}")


def _save_upload_file(user_id: int, file_id: str, filename: str, data: bytes) -> None:
    path = _upload_file_path(user_id, file_id, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)

MAX_HISTORY_MESSAGES = 10

# ── Educational Synthesis (document summarization) ───────────────────────────
# Standard semantic similarity search fails for summary requests: a chunk's
# embedding rarely matches "summarize" — the query describes an *action*, not
# *content*. When this intent is detected, retrieval fetches the ENTIRE document
# in original order, then _educational_synthesize() transforms it into an
# actionable study guide (Bottom Line → Key Concepts → Exam Perspective →
# Topic Overview). Documents larger than _MAP_REDUCE_THRESHOLD chars use a
# two-phase Map-Reduce: each ~12 K-char segment is extracted independently,
# then all extracts are synthesized into one cohesive educational brief.
_SUMMARY_KEYWORDS = (
    "סכם", "סיכום", "תקציר",
    "summarize", "summarise", "summary", "tl;dr", "tldr",
)

_MAP_REDUCE_THRESHOLD = 35_000  # chars; docs longer than this use Map-Reduce
_MAP_CHUNK_SIZE       = 12_000  # chars per Map-phase segment

_MAP_EXTRACT_SYSTEM = (
    "You are extracting key academic content from one section of a study document "
    "to build a comprehensive student study guide. From this section, extract:\n"
    "1. All technical terms and their definitions\n"
    "2. Core concepts, arguments, theorems, formulas, or experimental findings\n"
    "3. Numerical data, named laws, or results a lecturer would examine\n"
    "4. The logical structure/argument of this section in 1-2 sentences\n\n"
    "Be concise and factual. Preserve the source language (Hebrew or English) "
    "of key terms. Output plain prose — no filler, no meta-commentary."
)

_EDUCATIONAL_SYNTHESIS_SYSTEM = (
    "You are an expert academic tutor creating an actionable exam-preparation study guide "
    "for a university student. The document content (or pre-extracted key points) is below.\n\n"
    "Structure your response EXACTLY as follows — use these Markdown headers verbatim:\n\n"
    "## Bottom Line\n"
    "Two sentences only. What is the single core idea or thesis of this document? "
    "What must the student walk away knowing above all else?\n\n"
    "## Key Concepts\n"
    "A structured list of every important term, theorem, formula, or framework. "
    "For each entry:\n"
    "- **[Term / Concept]**: Plain-language definition. "
    "Why it matters / how it typically appears in exam questions.\n"
    "Include ALL named entities: laws, models, algorithms, people, experiments, equations.\n\n"
    "## Exam Perspective\n"
    "List 4-6 specific exam questions a lecturer is likely to ask based on the document's "
    "emphasis and depth. Write each as a real exam question, then add one line: "
    "'Correct answer must include: ...' with the 2-3 key points any good answer needs.\n\n"
    "## Topic Overview\n"
    "5-8 bullet points walking through the document's logical structure and main arguments. "
    "This is YOUR synthesis — do not copy text verbatim.\n\n"
    "RULES:\n"
    "- If the document is in Hebrew, write the entire response in Hebrew.\n"
    "- Use LaTeX ($...$ inline, $$...$$ display) for every mathematical expression.\n"
    "- Be direct and exam-focused. This is a study guide, not a summary."
)


def _is_summary_request(text: str) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in _SUMMARY_KEYWORDS)


def _educational_synthesize(full_text: str, doc_name: str, original_question: str) -> str:
    """Return an educational study guide for *full_text*.

    Short docs (≤ _MAP_REDUCE_THRESHOLD chars) → single synthesis call.
    Long docs → Map-Reduce: extract key points per segment, then synthesize.
    """
    if len(full_text) <= _MAP_REDUCE_THRESHOLD:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _EDUCATIONAL_SYNTHESIS_SYSTEM},
                {"role": "user", "content": (
                    f"Document: {doc_name}\n\n---\n{full_text}\n---\n\n"
                    "Create the study guide now."
                )},
            ],
            temperature=0,
            max_tokens=2500,
        )
        return resp.choices[0].message.content or ""

    # Map phase: extract key points from each segment independently
    segments: list[str] = []
    start = 0
    while start < len(full_text):
        segments.append(full_text[start : start + _MAP_CHUNK_SIZE])
        start += _MAP_CHUNK_SIZE

    print(f"[SummaryMapReduce] {doc_name!r}: {len(full_text)} chars → {len(segments)} segments")
    extracts: list[str] = []
    for i, seg in enumerate(segments, start=1):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _MAP_EXTRACT_SYSTEM},
                {"role": "user", "content": (
                    f"Document: '{doc_name}' — Section {i}/{len(segments)}\n\n{seg}"
                )},
            ],
            temperature=0,
            max_tokens=800,
        )
        extract = resp.choices[0].message.content or ""
        extracts.append(f"=== Section {i}/{len(segments)} ===\n{extract}")
        print(f"[SummaryMapReduce] segment {i}/{len(segments)} extracted ({len(extract)} chars)")

    # Reduce phase: synthesize all extracts into one educational brief
    combined = "\n\n".join(extracts)
    if len(combined) > 30_000:
        combined = combined[:30_000] + "\n\n...[further sections omitted for length]"

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _EDUCATIONAL_SYNTHESIS_SYSTEM},
            {"role": "user", "content": (
                f"Document: '{doc_name}' (processed in {len(segments)} sections)\n\n"
                "Below are the key points extracted from each section. "
                "Synthesize ALL of them into one cohesive study guide — do not "
                "repeat section headers from the extracts.\n\n"
                f"---\n{combined}\n---\n\n"
                "Create the unified study guide now."
            )},
        ],
        temperature=0,
        max_tokens=2500,
    )
    return resp.choices[0].message.content or ""


# ── Ephemeral analysis (no persistence) ────────────────────────────────────────
_EPHEMERAL_MAX_CHARS = 60_000

_EPHEMERAL_SYSTEM = (
    "אתה עוזר לימודי מומחה. לפניך תוכן ממסמכים שהמשתמש העלה לניתוח מיידי. "
    "ענה בצורה מפורטת ומובנית על השאלה בהתבסס אך ורק על התוכן שסופק. "
    "השתמש בציטוטים ישירים ובדוגמאות מהמסמך כשרלוונטי. "
    "אם התשובה אינה במסמך, ציין זאת בבירור — אל תמציא מידע שאינו בטקסט. "
    "ענה בשפה שבה נשאלת השאלה (עברית אם בעברית, אנגלית אם באנגלית)."
)


def _extract_text_ephemeral(raw_bytes: bytes, ext: str, filename: str) -> str:
    """Extract plain text from a PDF or PPTX file entirely in-memory."""
    try:
        if ext == ".pptx":
            slides_data, _ = extract_pptx_slides(raw_bytes)
            return "\n\n".join(s.get("text", "") for s in slides_data if s.get("text"))
        else:
            parts: list[str] = []
            with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
                for page in doc:
                    t = page.get_text("text")
                    if t and t.strip():
                        parts.append(t)
            return "\n\n".join(parts)
    except Exception as exc:
        print(f"[ephemeral] text extraction failed for {filename!r}: {exc}")
        return ""


@documents_bp.route("/api/ephemeral-ask", methods=["POST"])
@token_required
def ephemeral_ask(user_id: int):
    """
    Analyse uploaded file(s) in-memory and answer a question.
    Nothing reaches FAISS, SQLite, or the uploads folder — fully ephemeral.
    SSE format is identical to /ask so the frontend uses the same reader.
    """
    question = strip_html((request.form.get("question") or "").strip())
    question = redact_pii(question)
    if not question:
        return jsonify({"error": "question is required"}), 400

    raw_files   = request.files.getlist("files")
    valid_files = [f for f in raw_files if f and f.filename]
    if not valid_files:
        return jsonify({"error": "at least one file is required"}), 400

    history_raw = (request.form.get("history") or "[]").strip()
    try:
        history: list[dict] = json.loads(history_raw)
        if not isinstance(history, list):
            history = []
    except Exception:
        history = []

    # Extract text from each file in-memory — zero side-effects
    context_parts: list[str] = []
    for file in valid_files:
        fname = secure_filename(file.filename)
        ext   = os.path.splitext(fname.lower())[1]
        if ext not in {".pdf", ".pptx"}:
            continue
        text = _extract_text_ephemeral(file.read(), ext, fname)
        if text.strip():
            context_parts.append(f"[{fname}]\n{text}")

    if not context_parts:
        return jsonify({"error": "no extractable text found in the uploaded files"}), 422

    full_context = "\n\n---\n\n".join(context_parts)
    if len(full_context) > _EPHEMERAL_MAX_CHARS:
        full_context = full_context[:_EPHEMERAL_MAX_CHARS] + "\n\n[... תוכן קוצר בגלל אורך המסמך ...]"

    def generate():
        try:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'thinking'})}\n\n"

            msgs: list[dict] = [
                {"role": "system", "content": _EPHEMERAL_SYSTEM},
                {"role": "user",   "content": f"תוכן המסמך:\n\n{full_context}"},
            ]
            for turn in history[-6:]:
                role    = turn.get("role", "")
                content = turn.get("content", "")
                if role in ("user", "assistant") and content:
                    msgs.append({"role": role, "content": content})
            msgs.append({"role": "user", "content": question})

            resp        = client.chat.completions.create(
                model="gpt-4o-mini", messages=msgs, max_tokens=2000, stream=False,
            )
            full_answer = resp.choices[0].message.content or ""

            yield f"data: {json.dumps({'type': 'result', 'answer': full_answer, 'session_id': None, 'sources': [], 'citations': []})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── OCR (optional) ─────────────────────────────────────────────────────────────
try:
    import pytesseract
    from PIL import Image as _PILImage
    _TESSERACT_OK = True
    print("[OCR] pytesseract available — image text extraction enabled")
except ImportError:
    _TESSERACT_OK = False
    print("[OCR] pytesseract not installed — images will use vision-only mode")


@documents_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@documents_bp.route("/upload-pdf", methods=["POST"])
@token_required
def upload_pdf(user_id: int):
    import io as _io
    raw_files   = request.files.getlist("files")
    valid_files = [f for f in raw_files if f and f.filename]
    if not valid_files:
        return jsonify({"error": "no files provided"}), 400

    # Optional active-course tag (sent by the frontend when a course is selected via
    # CourseContext). Stamped onto chunk metadata + UserDocument so course-scoped
    # RAG retrieval (e.g. /api/generate-presentation) can filter to this course only.
    course_name = strip_html((request.form.get("course_name") or "").strip()) or None

    # Optional "past exam" tag (sent by the Professor Brain Simulator's past-exam
    # dropzone). Persisted on UserDocument so exam-prediction agents can later
    # auto-discover these files via services.rag.get_past_exam_file_ids().
    is_past_exam    = (request.form.get("is_past_exam")    or "").strip().lower() in ("1", "true", "yes")
    # Session-only uploads (from academic-writing) are indexed in FAISS for RAG
    # but are filtered out of "My Documents" and workspace document lists.
    is_session_only = (request.form.get("is_session_only") or "").strip().lower() in ("1", "true", "yes")

    new_text_count = sum(
        1 for f in valid_files
        if os.path.splitext(secure_filename(f.filename).lower())[1] not in _IMG_MIME
    )
    if new_text_count:
        _db_gate = SessionLocal()
        try:
            _gate_user = _get_user_refreshed(_db_gate, user_id)
            if _gate_user:
                _gate_user.uploads_this_month += new_text_count
            _db_gate.commit()
        finally:
            _db_gate.close()

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
            print(f"[Image] u{user_id}: stored {filename!r} ({len(img_bytes):,} bytes) for vision")

            chunks_from_ocr = 0
            ocr_chars       = 0

            if _TESSERACT_OK:
                ocr_text = ""
                try:
                    pil_img = _PILImage.open(_io.BytesIO(img_bytes))
                    try:
                        ocr_text = pytesseract.image_to_string(pil_img, lang="eng+heb").strip()
                    except pytesseract.TesseractError:
                        ocr_text = pytesseract.image_to_string(pil_img, lang="eng").strip()
                    ocr_chars = len(ocr_text)
                    print(f"[OCR] u{user_id}: {filename!r} → {ocr_chars} chars extracted")
                except Exception as ocr_exc:
                    print(f"[OCR] u{user_id}: {filename!r} — extraction failed: {ocr_exc}")

                if ocr_text:
                    ocr_file_id   = hashlib.md5(filename.encode()).hexdigest()[:16]
                    ocr_upload_dt = datetime.now(timezone.utc).isoformat()

                    # Persistence guard for OCR images
                    _ocr_guard_db = SessionLocal()
                    try:
                        _ocr_already = _ocr_guard_db.query(UserDocument).filter(
                            UserDocument.user_id == user_id,
                            UserDocument.file_id == ocr_file_id,
                        ).first()
                    finally:
                        _ocr_guard_db.close()

                    if _ocr_already:
                        print(f"[OCR] u{user_id}: {filename!r} already indexed "
                              f"(file_id={ocr_file_id}) — skipping (persistence policy)")
                    else:
                        ocr_chunks = text_splitter.split_text(ocr_text)
                        ocr_metas  = [
                            {
                                "source":      filename,
                                "file_name":   filename,
                                "file_id":     ocr_file_id,
                                "page_number": 1,
                                "total_pages": 1,
                                "upload_date": ocr_upload_dt,
                                "chunk_index": i,
                                "user_id":     user_id,
                                "file_type":   "image_ocr",
                                "course_name": course_name,
                            }
                            for i in range(len(ocr_chunks))
                        ]
                        ocr_ids = [f"{filename}_chunk_{i}" for i in range(len(ocr_chunks))]
                        try:
                            ocr_vectors = embeddings_model.embed_documents(ocr_chunks)
                            col.upsert(ids=ocr_ids, embeddings=ocr_vectors,
                                       documents=ocr_chunks, metadatas=ocr_metas)
                            chunks_from_ocr = len(ocr_chunks)
                            print(f"[OCR] u{user_id}: {filename!r} → {chunks_from_ocr} chunks embedded")
                            _ocr_db = SessionLocal()
                            try:
                                _ocr_exists = _ocr_db.query(UserDocument).filter(
                                    UserDocument.user_id == user_id,
                                    UserDocument.file_id == ocr_file_id,
                                ).first()
                                if not _ocr_exists:
                                    _ocr_db.add(UserDocument(
                                        user_id=user_id, file_id=ocr_file_id, filename=filename,
                                        file_size_bytes=len(img_bytes), course_name=course_name,
                                        is_past_exam=is_past_exam, is_session_only=is_session_only))
                                    _ocr_db.commit()
                                    _save_upload_file(user_id, ocr_file_id, filename, img_bytes)
                            except Exception as reg_exc:
                                print(f"[OCR] WARNING: ownership registration failed: {reg_exc}")
                                _ocr_db.rollback()
                            finally:
                                _ocr_db.close()
                        except Exception as embed_exc:
                            print(f"[OCR] u{user_id}: {filename!r} — embedding failed: {embed_exc}")
            else:
                print(f"[OCR] u{user_id}: {filename!r} — pytesseract not available, vision-only mode")

            img_results.append({
                "source": filename, "size": len(img_bytes),
                "chunks_stored": chunks_from_ocr, "type": "image", "ocr_chars": ocr_chars,
            })
            continue

        raw_bytes   = file.read()
        page_count  = 0
        file_id     = hashlib.md5(filename.encode()).hexdigest()[:16]
        upload_date = datetime.now(timezone.utc).isoformat()

        # ── Persistence guard ────────────────────────────────────────────────
        # Policy: files are retained indefinitely.  If this file_id is already
        # indexed for this user, skip re-processing.  To replace a file the
        # user must first DELETE it explicitly via DELETE /documents/<file_id>.
        _guard_db = SessionLocal()
        try:
            _already_indexed = _guard_db.query(UserDocument).filter(
                UserDocument.user_id == user_id,
                UserDocument.file_id == file_id,
            ).first()
        finally:
            _guard_db.close()

        if _already_indexed:
            print(f"[upload] u{user_id}: {filename!r} already indexed "
                  f"(file_id={file_id}) — skipping (persistence policy)")
            text_results.append({
                "source":        filename,
                "file_id":       file_id,
                "status":        "already_exists",
                "chunks_stored": 0,
                "message":       "Document already exists in the knowledge base.",
            })
            continue
        # ────────────────────────────────────────────────────────────────────

        slides_data: list[dict] = []
        try:
            if ext == ".pptx":
                slides_data, page_count = extract_pptx_slides(raw_bytes)
                pages_with_text = len(slides_data)
                file_type       = "pptx"
            else:
                with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
                    page_count = len(doc)
                    for page_idx, page in enumerate(doc, start=1):
                        page_text = page.get_text("text")
                        if page_text and page_text.strip():
                            slides_data.append({"text": page_text, "page_number": page_idx})
                pages_with_text = len(slides_data)
                file_type       = "pdf"
        except Exception as exc:
            errors.append({"source": filename, "error": f"parsing failed: {exc}"})
            continue

        if not slides_data:
            errors.append({"source": filename, "error": "no extractable text — may be scanned/image-only"})
            continue

        chunks:      list[str]  = []
        chunk_metas: list[dict] = []
        chunk_ids:   list[str]  = []
        for page_data in slides_data:
            for c in text_splitter.split_text(page_data["text"]):
                idx = len(chunks)
                chunks.append(c)
                chunk_metas.append({
                    "source":      filename,
                    "file_name":   filename,
                    "file_id":     file_id,
                    "page_number": page_data["page_number"],
                    "total_pages": page_count,
                    "upload_date": upload_date,
                    "chunk_index": idx,
                    "user_id":     user_id,
                    "course_name": course_name,
                })
                chunk_ids.append(f"{filename}_chunk_{idx}")

        if not chunks:
            errors.append({"source": filename, "error": "text chunking produced no output"})
            continue

        try:
            vectors = embeddings_model.embed_documents(chunks)
        except Exception as exc:
            errors.append({"source": filename, "error": f"embedding failed: {exc}"})
            continue

        try:
            col.upsert(ids=chunk_ids, embeddings=vectors, documents=chunks, metadatas=chunk_metas)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            errors.append({"source": filename, "error": f"vector indexing failed: {exc}"})
            continue

        _reg_db = SessionLocal()
        try:
            _exists = _reg_db.query(UserDocument).filter(
                UserDocument.user_id == user_id,
                UserDocument.file_id == file_id,
            ).first()
            if not _exists:
                _reg_db.add(UserDocument(user_id=user_id, file_id=file_id, filename=filename,
                                         file_size_bytes=len(raw_bytes), course_name=course_name,
                                         is_past_exam=is_past_exam, is_session_only=is_session_only))
                _reg_db.commit()
                _save_upload_file(user_id, file_id, filename, raw_bytes)
        except Exception as reg_exc:
            print(f"[upload] WARNING: could not register document ownership: {reg_exc}")
            _reg_db.rollback()
        finally:
            _reg_db.close()

        total_chars = sum(len(s["text"]) for s in slides_data)
        text_results.append({
            "source":          filename,
            "file_id":         file_id,
            "size":            len(raw_bytes),
            "pages_scanned":   page_count,
            "pages_with_text": pages_with_text,
            "chunks_stored":   len(chunks),
            "total_chars":     total_chars,
            "type":            file_type,
        })

    ocr_produced_chunks = any(r.get("chunks_stored", 0) > 0 for r in img_results)
    if text_results or ocr_produced_chunks:
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

    # Top-level convenience flag: every uploaded file was already indexed, so
    # nothing new was processed. Lets the frontend short-circuit (stop the
    # spinner, show an "already exists" notice, skip the "new document"
    # onboarding flow) without inspecting `files[]` itself.
    duplicates = [r for r in all_results if r.get("status") == "already_exists"]
    if duplicates and len(duplicates) == len(all_results):
        resp["status"]   = "already_exists"
        resp["message"]  = "Document already exists in the knowledge base."
        resp["document"] = duplicates[0]

    return jsonify(resp), 200


@documents_bp.route("/ask", methods=["POST"])
@limiter.limit("15 per minute")
@token_required
def ask(user_id: int):
    data     = request.get_json()
    question = data.get("message") if data else None
    if not question:
        return jsonify({"error": "message is required"}), 400

    _q_clean = strip_html(question)
    _q_safe  = redact_pii(_q_clean)
    if _q_safe != question:
        print(f"[PII] Sanitized/masked user prompt for u{user_id}")
    question = _q_safe

    session_id_in  = data.get("session_id") if data else None
    file_id_filter = data.get("file_id")    if data else None

    print("\n" + "━" * 62)
    print(f"▶ /ask  u{user_id}")
    print(f"  message    : {question!r}")
    print(f"  session_id : {session_id_in!r}")
    print("━" * 62)

    if file_id_filter:
        _gate_db = SessionLocal()
        try:
            _owns = _gate_db.query(UserDocument).filter(
                UserDocument.user_id == user_id,
                UserDocument.file_id == file_id_filter,
            ).first()
            if not _owns:
                print(f"[Security] u{user_id}: rejected file_id={file_id_filter!r} — not in user_documents")
                return jsonify({"error": "Forbidden — document not found or not yours."}), 403
        finally:
            _gate_db.close()

    col         = get_user_collection(user_id)
    user_images = get_user_images(user_id)
    doc_count   = col.count()

    if doc_count == 0 and not user_images:
        return jsonify({"error": "no documents in the knowledge base — upload a file first"}), 400

    db = SessionLocal()
    try:
        _ask_user = _get_user_refreshed(db, user_id)
        if _ask_user:
            _ask_user.questions_this_month += 1

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

    # Resolve which document "the document" refers to for summary requests.
    # If the frontend didn't scope the request to a specific file (the filter
    # chips only appear when the user has >1 document), fall back to the user's
    # single document when that's unambiguous; otherwise let it fall through to
    # normal hybrid_search (can't guess which of several documents is meant).
    is_summary_request = _is_summary_request(question)
    summary_file_id     = file_id_filter
    if is_summary_request and not summary_file_id:
        _db_docs = SessionLocal()
        try:
            _owned_file_ids = [
                row.file_id for row in
                _db_docs.query(UserDocument.file_id)
                .filter(UserDocument.user_id == user_id)
                .distinct()
                .all()
            ]
        finally:
            _db_docs.close()
        if len(_owned_file_ids) == 1:
            summary_file_id = _owned_file_ids[0]
        else:
            is_summary_request = False

    def generate():
        try:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'thinking'})}\n\n"

            if is_summary_request and summary_file_id:
                # Educational Synthesis path — fully self-contained, returns early.
                # Bypasses the normal context-building and tool-calling flow entirely.
                raw_chunks, raw_metas = get_chunks_for_files(user_id, [summary_file_id])
                if not raw_chunks:
                    _no_text = "לא נמצא תוכן במסמך לסיכום."
                    _save_ai_message(session_id, _no_text)
                    yield f"data: {json.dumps({'type': 'result', 'answer': _no_text, 'sources': [], 'citation_sources': [], 'chunks_used': 0, 'searched_web': False, 'web_sources': [], 'session_id': session_id, 'executed_code': '', 'code_output': '', 'images': []}, ensure_ascii=False)}\n\n"
                    return

                order       = sorted(range(len(raw_chunks)), key=lambda i: raw_metas[i].get("chunk_index", i))
                full_text   = "\n\n".join(raw_chunks[i] for i in order)
                doc_name    = raw_metas[order[0]].get("source", "document") if order else "document"
                total_chars = len(full_text)
                uses_map_reduce = total_chars > _MAP_REDUCE_THRESHOLD

                print(f"▶ EDUCATIONAL SUMMARY u{user_id}: file_id={summary_file_id} "
                      f"→ {len(raw_chunks)} chunks, {total_chars} chars"
                      + (" [MAP-REDUCE]" if uses_map_reduce else " [DIRECT]"))

                if uses_map_reduce:
                    yield f"data: {json.dumps({'type': 'status', 'phase': 'analyzing_sections'})}\n\n"

                answer = _educational_synthesize(full_text, doc_name, question)
                _save_ai_message(session_id, answer or "")
                _summary_payload = json.dumps({
                    "type": "result",
                    "answer": answer,
                    "sources": [doc_name],
                    "citation_sources": [{"file_name": doc_name, "page_number": None, "file_id": summary_file_id}],
                    "chunks_used": len(raw_chunks),
                    "searched_web": False,
                    "web_sources": [],
                    "session_id": session_id,
                    "executed_code": "",
                    "code_output": "",
                    "images": [],
                }, ensure_ascii=False)
                yield f"data: {_summary_payload}\n\n"
                return

            chunks, metadatas = hybrid_search(
                user_id, search_query, min(TOP_K, doc_count), file_id=file_id_filter
            )

            if not chunks and not tavily_client and not user_images:
                no_result_answer = "לא נמצאו קטעים רלוונטיים במסמך לשאלה זו. נסה לנסח אחרת."
                _save_ai_message(session_id, no_result_answer)
                payload = json.dumps({
                    "type": "result", "answer": no_result_answer,
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

            _seen_cites: set[tuple] = set()
            citation_sources: list[dict] = []
            for _m in (metadatas or []):
                _fname = _m.get("file_name", _m.get("source", "Document"))
                _pnum  = _m.get("page_number")
                _key   = (_fname, _pnum)
                if _key not in _seen_cites:
                    _seen_cites.add(_key)
                    citation_sources.append({
                        "file_name":   _fname,
                        "page_number": _pnum,
                        "file_id":     _m.get("file_id", ""),
                    })
            citation_sources.sort(key=lambda x: (x["file_name"], x["page_number"] or 0))

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
                "\n• HEBREW STRINGS: If Python code includes Hebrew text, ALWAYS use double-quotes (\") "
                "for those strings — never single-quotes — to prevent syntax errors from the Hebrew "
                "apostrophe character (e.g., write \"ג'ול\" not 'ג\\'ול')."
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
                SECURITY_SYSTEM_INSTRUCTION
                + "You are a scientist, engineer, and knowledgeable assistant for U-Note, "
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
                "NEVER write LaTeX commands like \\psi or \\rho as bare text outside delimiters. "
                "CRITICAL: When explaining mathematical or physical concepts, DO NOT write or "
                "execute Python code to display or typeset formulas. You MUST use LaTeX "
                "formatting directly in your response — $$ for display equations, $ for inline."
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
                            code_str  = args.get("code", "")
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
                            args        = json.loads(tc.function.arguments)
                            query_str   = args.get("query", "")
                            search_resp = tavily_client.search(query_str, max_results=5)
                            results     = search_resp.get("results", [])
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
                _code_blocks = re.findall(r"```(?:python|py)?\s*\n(.*?)```", raw_content, re.DOTALL)
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
                        r"```(?:python|py)?\s*\n.*?```", "", raw_content, flags=re.DOTALL
                    ).strip()
                else:
                    answer = raw_content

            web_sources = [
                {"title": r.get("title", ""), "url": r.get("url", "")}
                for r in web_results
            ]

            if answer and not is_safe_output(answer):
                print("SECURITY ALERT: Blocked unsafe AI output.")
                answer = _DLP_FALLBACK

            _save_ai_message(session_id, answer or "")

            payload = json.dumps({
                "type": "result",
                "answer": answer,
                "sources": sources,
                "citation_sources": citation_sources,
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


@documents_bp.route("/documents", methods=["GET"])
@token_required
def list_documents(user_id: int):
    # SQL is the authoritative ownership registry — build the list from UserDocument
    # then enrich with chunk counts from FAISS.  This keeps /documents and
    # /api/profile/documents in sync and prevents orphan FAISS chunks from
    # appearing as ghost files.
    #
    # Optional ?course_name= scopes the list to a single course so the workspace
    # and academic-writing pages only show files relevant to the active course.
    # Omitting the parameter (or sending all=true) returns all user documents.
    course_name_filter = (request.args.get("course_name") or "").strip() or None

    db = SessionLocal()
    try:
        query = db.query(UserDocument).filter(
            UserDocument.user_id == user_id,
            UserDocument.is_session_only == False,  # noqa: E712
            UserDocument.is_syllabus == False,       # noqa: E712 — syllabi managed via course settings, not workspace
        )
        if course_name_filter:
            query = query.filter(UserDocument.course_name == course_name_filter)
        records = query.order_by(UserDocument.uploaded_at.desc()).all()
    finally:
        db.close()

    if not records:
        return jsonify({"documents": [], "total_chunks": 0}), 200

    # Count chunks per file_id from FAISS (best-effort; 0 if store is empty/missing)
    chunk_map: dict[str, int] = {}
    try:
        col = get_user_collection(user_id)
        if col.count() > 0:
            for meta in col.get(include=["metadatas"])["metadatas"]:
                fid = meta.get("file_id", "")
                if fid:
                    chunk_map[fid] = chunk_map.get(fid, 0) + 1
    except Exception:
        pass

    docs = [
        {
            "name":         r.filename,
            "file_id":      r.file_id,
            "chunks":       chunk_map.get(r.file_id, 0),
            "upload_date":  r.uploaded_at.isoformat() if r.uploaded_at else None,
            "course_name":  r.course_name,
            "is_past_exam": bool(r.is_past_exam),
            "is_syllabus":  bool(r.is_syllabus),
        }
        for r in records
    ]

    return jsonify({
        "documents":    docs,
        "total_chunks": sum(chunk_map.values()),
    }), 200


@documents_bp.route("/documents/<file_id>/download", methods=["GET"])
@token_required
def download_document(user_id: int, file_id: str):
    db = SessionLocal()
    try:
        record = db.query(UserDocument).filter(
            UserDocument.user_id == user_id,
            UserDocument.file_id == file_id,
        ).first()
        if not record:
            return jsonify({"error": "Document not found or not yours."}), 404
        path = _upload_file_path(user_id, file_id, record.filename)
        if not os.path.exists(path):
            return jsonify({"error": "Original file is not available for download."}), 404
        return send_file(path, as_attachment=True, download_name=record.filename)
    finally:
        db.close()


@documents_bp.route("/documents/<file_id>", methods=["DELETE"])
@token_required
def delete_document(user_id: int, file_id: str):
    db = SessionLocal()
    try:
        record = db.query(UserDocument).filter(
            UserDocument.user_id == user_id,
            UserDocument.file_id == file_id,
        ).first()
        if not record:
            return jsonify({"error": "Document not found or not yours."}), 404
        filename = record.filename
        col = get_user_collection(user_id)
        try:
            col.delete(where={"file_id": {"$eq": file_id}})
        except Exception:
            try:
                col.delete(where={"source": filename})
            except Exception as exc:
                print(f"[delete_doc] WARNING: could not remove chunks for {filename!r}: {exc}")
        db.delete(record)
        db.commit()
        rebuild_user_bm25(user_id)
        get_user_images(user_id).pop(filename, None)
        try:
            upload_path = _upload_file_path(user_id, file_id, filename)
            if os.path.exists(upload_path):
                os.remove(upload_path)
        except Exception as exc:
            print(f"[delete_doc] WARNING: could not remove uploaded file for {filename!r}: {exc}")
        print(f"[delete_doc] u{user_id}: deleted {filename!r} (file_id={file_id})")
        return jsonify({"message": f"{filename} deleted successfully."}), 200
    except Exception as exc:
        db.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        db.close()


@documents_bp.route("/sessions", methods=["GET"])
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


@documents_bp.route("/sessions/<int:session_id>", methods=["GET"])
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


@documents_bp.route("/sessions/<int:session_id>", methods=["DELETE"])
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

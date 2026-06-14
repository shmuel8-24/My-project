import base64
import io

import fitz  # PyMuPDF
from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from api.middleware import token_required
from extensions import TOP_K, client, limiter
from services.pdf import extract_pptx_text
from services.rag import hybrid_search
from services.security import strip_html
from services.slides import BUILD_PRESENTATION_TOOL, generate_deck_via_agent

try:
    import docx
    _DOCX_AVAILABLE = True
except ImportError:
    _DOCX_AVAILABLE = False


presentation_agent_bp = Blueprint("presentation_agent", __name__)

# ---------------------------------------------------------------------------
# Presentation Agent — tool definitions
#
# The Presentation Agent processes each uploaded file with the tool matching
# its mimetype, aggregates the extracted text/transcripts/descriptions, then
# forces a final build_presentation tool call (real OpenAI function-calling,
# see services/slides.py::generate_deck_via_agent) to produce the
# structured slide JSON ({title, layout, content} per slide). PRESENTATION_AGENT_TOOLS
# documents the full four-tool contract.
# ---------------------------------------------------------------------------
PRESENTATION_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "parse_document",
            "description": "Extract raw text content from an uploaded PDF, Word (.docx), or PowerPoint (.pptx) file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Original filename, used to determine the document type.",
                    },
                },
                "required": ["filename"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "transcribe_media",
            "description": "Transcribe the spoken-audio track of an uploaded audio or video file into text using Whisper.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Original filename, used to determine the media type.",
                    },
                },
                "required": ["filename"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_image",
            "description": (
                "Use vision to describe an uploaded image's content — visible text, "
                "data, charts, diagrams, or key concepts — for use as presentation "
                "source material."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Original filename, used to determine the image type.",
                    },
                },
                "required": ["filename"],
            },
        },
    },
    BUILD_PRESENTATION_TOOL,
]

# ---------------------------------------------------------------------------
# Supported upload types — dispatched to the matching tool by mimetype/extension
# ---------------------------------------------------------------------------
_DOC_EXTENSIONS   = {"pdf", "docx", "pptx"}
_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg"}

# Formats the OpenAI Whisper API can demux/transcribe directly (no local ffmpeg
# needed — OpenAI extracts the audio track server-side for video containers).
_MEDIA_EXTENSIONS = {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "flac"}

_IMAGE_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}

_MEDIA_MIME = {
    "mp3": "audio/mpeg", "mp4": "video/mp4", "mpeg": "video/mpeg",
    "mpga": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav",
    "webm": "video/webm", "ogg": "audio/ogg", "flac": "audio/flac",
}

_MAX_WHISPER_BYTES = 25 * 1024 * 1024  # OpenAI Whisper API hard limit

_IMAGE_ANALYSIS_PROMPT = (
    "You convert an image into source material for a presentation deck. "
    "Describe the image's content in detail: any visible text, data, charts, "
    "diagrams, or key concepts. Write in the same language as any text "
    "visible in the image (Hebrew or English). Be concise but information-"
    "dense — your output will be used directly as raw context for building "
    "presentation slides."
)


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# ---------------------------------------------------------------------------
# Tool 1 — parse_document (PDF / Word / PowerPoint)
# ---------------------------------------------------------------------------
def parse_document(filename: str, file_bytes: bytes) -> str:
    ext = _ext(filename)
    try:
        if ext == "pdf":
            with fitz.open(stream=file_bytes, filetype="pdf") as doc:
                return "\n".join(page.get_text("text") for page in doc).strip()

        if ext == "pptx":
            text, _slide_count = extract_pptx_text(file_bytes)
            return text.strip()

        if ext == "docx":
            if not _DOCX_AVAILABLE:
                return ""
            d = docx.Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in d.paragraphs if p.text.strip()).strip()
    except Exception as exc:
        print(f"[PresentationAgent] parse_document failed for {filename!r}: {exc}")
        return ""
    return ""


# ---------------------------------------------------------------------------
# Tool 2 — transcribe_media (audio / video via Whisper)
# ---------------------------------------------------------------------------
def transcribe_media(filename: str, file_bytes: bytes) -> str:
    if len(file_bytes) > _MAX_WHISPER_BYTES:
        print(f"[PresentationAgent] {filename!r} exceeds Whisper's 25MB limit "
              f"({len(file_bytes):,} bytes) — skipped")
        return ""
    try:
        content_type = _MEDIA_MIME.get(_ext(filename), "application/octet-stream")
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, file_bytes, content_type),
        )
        return (result.text or "").strip()
    except Exception as exc:
        print(f"[PresentationAgent] transcribe_media failed for {filename!r}: {exc}")
        return ""


# ---------------------------------------------------------------------------
# Tool 3 — analyze_image (vision)
# ---------------------------------------------------------------------------
def analyze_image(filename: str, file_bytes: bytes) -> str:
    mime = _IMAGE_MIME.get(_ext(filename), "image/png")
    try:
        b64 = base64.b64encode(file_bytes).decode("ascii")
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _IMAGE_ANALYSIS_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": f"Analyze this image ({filename})."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ]},
            ],
            max_tokens=600,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        print(f"[PresentationAgent] analyze_image failed for {filename!r}: {exc}")
        return ""


# ---------------------------------------------------------------------------
# Route — POST /api/generate-presentation
# ---------------------------------------------------------------------------
@presentation_agent_bp.route("/api/generate-presentation", methods=["POST"])
@limiter.limit("3 per minute")
@token_required
def generate_presentation(user_id: int):
    topic = strip_html((request.form.get("topic") or "").strip())
    course_name = strip_html((request.form.get("course_name") or "").strip()) or None
    uploaded_files = request.files.getlist("files")

    if not uploaded_files:
        return jsonify({"error": "no files uploaded"}), 400

    sources: list[dict] = []
    context_parts: list[str] = []

    for f in uploaded_files:
        filename = secure_filename(f.filename or "untitled")
        ext = _ext(filename)
        file_bytes = f.read()
        if not file_bytes:
            continue

        if ext in _DOC_EXTENSIONS:
            kind = "document"
            text = parse_document(filename, file_bytes)
        elif ext in _IMAGE_EXTENSIONS:
            kind = "image"
            text = analyze_image(filename, file_bytes)
        elif ext in _MEDIA_EXTENSIONS:
            kind = "media"
            text = transcribe_media(filename, file_bytes)
        else:
            print(f"[PresentationAgent] u{user_id}: unsupported file type {filename!r} — skipped")
            sources.append({"filename": filename, "type": "unsupported", "chars": 0})
            continue

        sources.append({"filename": filename, "type": kind, "chars": len(text)})
        if text:
            context_parts.append(f"[{filename}]\n{text}")

    context = "\n\n".join(context_parts).strip()
    if not context:
        return jsonify({
            "error": "could not extract any usable content from the uploaded files",
            "sources": sources,
        }), 400

    deck_topic = topic or next(
        (s["filename"].rsplit(".", 1)[0] for s in sources if s["type"] != "unsupported"),
        "Presentation",
    )

    # Multi-document RAG synthesis: in addition to the freshly-uploaded files
    # above (in-memory only, never persisted to FAISS), pull the top relevant
    # chunks from the user's existing FAISS knowledge base and pass them along
    # as supplementary context so the deck isn't limited to a single document.
    # When the frontend sends an active course_name, retrieval is STRICTLY
    # scoped to documents tagged with that course — chunks from other courses
    # are never returned, even on a perfect semantic match. With no active
    # course, retrieval spans the user's entire knowledge base as before.
    rag_chunks, rag_metas = hybrid_search(user_id, deck_topic, TOP_K, course_name=course_name)
    rag_context = "\n\n".join(
        f"[{meta.get('source', '?')}]\n{chunk}"
        for chunk, meta in zip(rag_chunks, rag_metas)
    )
    if rag_context:
        print(f"[PresentationAgent] u{user_id}: added {len(rag_chunks)} RAG chunk(s) "
              f"from knowledge base as supplementary context"
              + (f" (course={course_name!r})" if course_name else ""))

    valid, error = generate_deck_via_agent(client, deck_topic, context, rag_context)
    if error:
        print(f"[PresentationAgent] u{user_id}: slide generation error: {error}")
        return jsonify({"error": error}), 500

    print(f"[PresentationAgent] u{user_id}: generated {len(valid)} slides from {len(sources)} files")
    return jsonify({"slides": valid, "sources": sources}), 200

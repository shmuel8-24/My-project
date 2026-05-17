import json
import re

from flask import Blueprint, jsonify, request, send_file

from api.middleware import token_required
from extensions import client, limiter
from models import SessionLocal, UserDocument
from services.rag import get_user_collection, hybrid_search
from services.security import (
    SECURITY_SYSTEM_INSTRUCTION,
    _DLP_FALLBACK,
    is_safe_output,
    strip_html,
)

export_bp = Blueprint("export", __name__)


@export_bp.route("/generate-paper", methods=["POST"])
@limiter.limit("5 per minute")
@token_required
def generate_paper(user_id: int):
    data         = request.get_json()
    topic        = strip_html((data.get("topic")        or "").strip() if data else "")
    instructions = strip_html((data.get("instructions") or "").strip() if data else "")
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
        SECURITY_SYSTEM_INSTRUCTION
        + "You are an expert academic writer in Hebrew. "
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
    paper_text = response.choices[0].message.content or ""
    if not is_safe_output(paper_text):
        print("SECURITY ALERT: Blocked unsafe AI output.")
        paper_text = _DLP_FALLBACK
    return jsonify({"paper": paper_text, "sources": sources, "chunks_used": len(chunks)}), 200


@export_bp.route("/api/generate-quiz", methods=["POST"])
@limiter.limit("5 per minute")
@token_required
def generate_quiz(user_id: int):
    req_data = request.get_json(silent=True) or {}
    file_id  = req_data.get("file_id")

    if file_id:
        _gate_db = SessionLocal()
        try:
            _owns = _gate_db.query(UserDocument).filter(
                UserDocument.user_id == user_id,
                UserDocument.file_id == file_id,
            ).first()
            if not _owns:
                print(f"[Security] u{user_id}: quiz rejected file_id={file_id!r} — not in user_documents")
                return jsonify({"error": "Forbidden — document not found or not yours."}), 403
        finally:
            _gate_db.close()

    col       = get_user_collection(user_id)
    doc_count = col.count()
    if doc_count == 0:
        return jsonify({"error": "no documents in the knowledge base — upload a file first"}), 400

    search_query = "מושגים מרכזיים עקרונות ועובדות חשובות key concepts definitions"
    chunks, metadatas = hybrid_search(
        user_id, search_query, min(12, doc_count), file_id=file_id
    )
    if not chunks:
        return jsonify({"error": "no content found to generate a quiz from"}), 400

    context = "\n\n".join(chunks)
    sources  = sorted({m.get("source", "Unknown") for m in metadatas})

    system_prompt = (
        SECURITY_SYSTEM_INSTRUCTION
        + "You are a quiz-generation AI. "
        "Output ONLY a valid JSON object — no markdown fences, no extra keys.\n\n"
        "Required schema:\n"
        '{"questions":[{"question":"...","options":["...","...","...","..."],"correct_answer":0}]}\n\n'
        "Rules:\n"
        "1. Generate exactly 5 multiple-choice questions based strictly on the provided text.\n"
        "2. Each question has exactly 4 options (plain strings, no letter prefixes like 'A.').\n"
        "3. correct_answer is the 0-based integer index (0, 1, 2, or 3) of the correct option.\n"
        "4. Write in the same language as the document (Hebrew for Hebrew texts).\n"
        "5. Make distractors plausible but clearly refuted by the provided text.\n"
        "6. Vary question types: factual recall, concept definition, cause-effect, comparison."
    )
    user_message = (
        f"Academic text to quiz from:\n---\n{context}\n---\n\n"
        "Generate 5 multiple-choice questions as JSON."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.6,
            max_tokens=2000,
        )
        raw      = response.choices[0].message.content or ""
        quiz_obj = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[Quiz] JSON parse error: {exc}")
        return jsonify({"error": "AI returned malformed JSON — please try again."}), 500
    except Exception as exc:
        print(f"[Quiz] Error: {exc}")
        return jsonify({"error": str(exc)}), 500

    valid: list[dict] = []
    for q in quiz_obj.get("questions", []):
        opts = q.get("options", [])
        ans  = q.get("correct_answer")
        if (
            isinstance(q.get("question"), str) and q["question"].strip()
            and isinstance(opts, list) and len(opts) == 4
            and all(isinstance(o, str) for o in opts)
            and isinstance(ans, int) and 0 <= ans <= 3
        ):
            valid.append({
                "question":       q["question"].strip(),
                "options":        [str(o).strip() for o in opts],
                "correct_answer": ans,
            })

    if not valid:
        return jsonify({"error": "AI did not produce valid questions — please try again."}), 500

    print(f"[Quiz] u{user_id}: generated {len(valid)} questions from {len(chunks)} chunks")
    return jsonify({"questions": valid, "sources": sources}), 200


@export_bp.route("/export-pdf", methods=["POST"])
@token_required
def export_pdf(user_id: int):
    try:
        from io import BytesIO
        import markdown as md_lib
        from weasyprint import HTML as WeasyHTML
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
    body {{ font-family: Arial, Helvetica, sans-serif; direction: rtl; font-size: 11pt; line-height: 1.9; color: #1a1a1a; }}
    h1 {{ font-size: 19pt; font-weight: bold; text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 0.3em; margin-top: 0; margin-bottom: 1em; }}
    h2 {{ font-size: 14pt; font-weight: bold; color: #312e81; margin-top: 1.5em; margin-bottom: 0.5em; }}
    h3 {{ font-size: 12pt; font-weight: bold; color: #3730a3; margin-top: 1em; margin-bottom: 0.3em; }}
    p {{ margin-bottom: 0.8em; text-align: justify; }}
    blockquote {{ border-right: 4px solid #7c3aed; padding-right: 1em; margin: 1em 0; color: #555; font-style: italic; }}
    code {{ background: #f3f4f6; padding: 0.1em 0.3em; font-size: 10pt; }}
    pre {{ background: #f3f4f6; padding: 0.8em 1em; font-size: 10pt; }}
    table {{ width: 100%; border-collapse: collapse; margin: 1em 0; }}
    th, td {{ border: 1px solid #d1d5db; padding: 0.4em 0.7em; text-align: right; }}
    th {{ background: #f9fafb; font-weight: bold; }}
    ul, ol {{ padding-right: 1.5em; padding-left: 0; margin-bottom: 0.8em; }}
    li {{ margin-bottom: 0.3em; line-height: 1.7; }}
  </style>
</head>
<body>{html_body}</body>
</html>"""

    pdf_bytes = WeasyHTML(string=full_html).write_pdf()
    from io import BytesIO as _BytesIO
    buf = _BytesIO(pdf_bytes)
    buf.seek(0)
    return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name=safe_name)


@export_bp.route("/export-docx", methods=["POST"])
@token_required
def export_docx(user_id: int):
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml import OxmlElement
        from docx.shared import Cm, Pt, RGBColor
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

    _INLINE = re.compile(r"\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\$(.+?)\$", re.DOTALL)

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
            _fill(p, s[2:].strip()); _rtl(p); continue
        if s.startswith("## "):
            p = doc.add_paragraph(style="Heading 2")
            _fill(p, s[3:].strip()); _rtl(p); continue
        if s.startswith("### "):
            p = doc.add_paragraph(style="Heading 3")
            _fill(p, s[4:].strip()); _rtl(p); continue
        if s.startswith("- ") or s.startswith("* "):
            p = doc.add_paragraph(style="List Bullet")
            _fill(p, s[2:].strip()); _rtl(p); continue
        mm = re.match(r"^\d+\.\s+(.*)", s)
        if mm:
            p = doc.add_paragraph(style="List Number")
            _fill(p, mm.group(1)); _rtl(p); continue
        if s.startswith("> "):
            p = doc.add_paragraph(style="Quote")
            _fill(p, s[2:].strip()); _rtl(p); continue
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


@export_bp.route("/test-ai", methods=["POST"])
@token_required
def test_ai(user_id: int):
    from extensions import embeddings_model as em
    data    = request.get_json()
    message = data.get("message") if data else None
    if not message:
        return jsonify({"error": "message is required"}), 400

    col       = get_user_collection(user_id)
    doc_count = col.count()

    if doc_count > 0:
        question_vector = em.embed_query(message)
        try:
            results = col.query(
                query_embeddings=[question_vector],
                n_results=min(3, doc_count),
                where={"user_id": {"$eq": user_id}},
                include=["documents"],
            )
        except Exception:
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
        messages=[
            {"role": "system", "content": SECURITY_SYSTEM_INSTRUCTION},
            {"role": "user",   "content": content},
        ],
    )
    answer_text = response.choices[0].message.content or ""
    if not is_safe_output(answer_text):
        print("SECURITY ALERT: Blocked unsafe AI output.")
        answer_text = _DLP_FALLBACK
    return jsonify({"answer": answer_text}), 200

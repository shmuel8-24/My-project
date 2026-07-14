import json

from flask import Blueprint, jsonify, request

from api.middleware import token_required
from extensions import TOP_K, client
from services.rag import hybrid_search

writing_bp = Blueprint("writing", __name__)

# Broad query used when the user clicks Sparkles without typing a topic —
# pulls a representative sample of course materials from FAISS.
_BROAD_SCAN_QUERY = "נושאים מרכזיים מושגים חשובים תיאוריות ממצאים ומסקנות"

# Scan mode: no user topic — derive the best title purely from the course materials.
_SUGGEST_SYSTEM_SCAN = (
    "You are an expert academic assistant. "
    "Read the following excerpts from the user's selected course materials. "
    "Based STRICTLY on these materials, generate exactly ONE highly engaging, specific, "
    "and academic research paper title that best captures the core content. "
    "CRITICAL CONSTRAINT: The title MUST contain a STRICT MAXIMUM of 4 words. "
    "Count every word before returning — do not exceed 4 words under any circumstances. "
    "CRITICAL: You must reply in native, natural Hebrew. "
    'Return ONLY a valid JSON object in this exact format: '
    '{"title": "הכותרת שלך כאן"}. '
    "No additional text, no markdown formatting, no preamble."
)

# Topic mode: user provided a topic — ground the title in both topic and RAG.
_SUGGEST_SYSTEM_TOPIC = (
    "You are an expert academic writing assistant. Based on the provided course learning materials "
    "and the user's stated topic, generate exactly ONE definitive, focused, and engaging academic "
    "research paper title. "
    "CRITICAL CONSTRAINT: The title MUST contain a STRICT MAXIMUM of 4 words. "
    "Count every word before returning — do not exceed 4 words under any circumstances. "
    'Return ONLY a JSON object in the format: {"title": "Your title here"}. '
    "No preamble, no numbering, no extra text. "
    "CRITICAL RULE: Generate the title in Hebrew by default. "
    "If the user's topic is clearly written in English, generate the title in English instead."
)

# Pure fallback: no RAG context at all, topic provided.
_SUGGEST_SYSTEM_FALLBACK = (
    "You are an expert academic writing assistant. "
    "Generate exactly ONE definitive, focused, and engaging academic research paper title for the given topic. "
    "CRITICAL CONSTRAINT: The title MUST contain a STRICT MAXIMUM of 4 words. "
    "Count every word before returning — do not exceed 4 words under any circumstances. "
    'Return ONLY a JSON object in the format: {"title": "Your title here"}. '
    "No preamble, no numbering, no extra text. "
    "CRITICAL RULE: Generate the title in Hebrew by default. "
    "If the user's topic is clearly written in English, generate the title in English instead."
)

# Course-only mode: no topic AND no RAG context (empty/new course) — derive a
# generic but plausible academic title purely from the course name.
_SUGGEST_SYSTEM_COURSE_ONLY = (
    "You are an expert academic writing assistant. "
    "The user has not provided a topic and no course materials are available yet. "
    "Based STRICTLY on the given course name, generate exactly ONE plausible, general, "
    "and engaging academic research paper title that a student in this course might write. "
    "CRITICAL CONSTRAINT: The title MUST contain a STRICT MAXIMUM of 4 words. "
    "Count every word before returning — do not exceed 4 words under any circumstances. "
    'Return ONLY a valid JSON object in this exact format: '
    '{"title": "הכותרת שלך כאן"}. '
    "No additional text, no markdown formatting, no preamble. "
    "CRITICAL RULE: Generate the title in Hebrew by default. "
    "If the course name is clearly written in English, generate the title in English instead."
)


@writing_bp.route("/api/writing/suggest-titles", methods=["POST"])
@token_required
def suggest_titles(user_id: int):
    """Return one AI-suggested paper title grounded in the user's course RAG context.

    When `topic` is empty the endpoint scans the course materials autonomously
    (broad FAISS query, top-10 chunks) and derives a title from what it finds.
    When `topic` is provided it grounds the suggestion in both the topic and RAG.
    When `topic` is empty AND the scan finds no chunks (new/empty course), it
    falls back to generating a general title from `course_name` alone rather
    than failing — this endpoint never 400s solely because of an empty topic
    or empty RAG results.
    """
    data        = request.get_json(silent=True) or {}
    print("✨ Suggest Titles Route Hit. Payload:", data)
    topic       = (data.get("topic")       or "").strip()
    course_name = (data.get("course_name") or "").strip() or None
    course_id   = data.get("course_id") or data.get("courseId")

    if not course_id:
        return jsonify({"error": "Missing course_id"}), 400

    # --- RAG retrieval -------------------------------------------
    # Scan mode pulls more chunks (10) to get a broad document sample.
    # Topic mode pulls fewer (5) tightly focused on the query.
    rag_context  = ""
    search_query = topic if topic else _BROAD_SCAN_QUERY
    k            = min(TOP_K, 5) if topic else 10
    try:
        chunks, _ = hybrid_search(user_id, search_query, k, course_name=course_name)
        if chunks:
            rag_context = "\n\n".join(chunks[:k])
    except Exception:
        pass

    # --- Build prompt based on what we have ----------------------
    if rag_context and not topic:
        system_prompt = _SUGGEST_SYSTEM_SCAN
        user_content  = (
            f"חומרי הלמידה שנסרקו:\n\n{rag_context}\n\n"
            "בהתבסס אך ורק על חומרים אלו, הצע כותרת אקדמית אחת ספציפית ומרתקת."
        )
    elif rag_context and topic:
        system_prompt = _SUGGEST_SYSTEM_TOPIC
        user_content  = (
            f"חומרי הלמידה הרלוונטיים:\n\n{rag_context}\n\n"
            f"הנושא שהמשתמש רוצה לכתוב עליו: {topic}\n\n"
            "הצע כותרת אקדמית אחת ממוקדת ומרתקת המבוססת על חומרי הלמידה הנ\"ל."
        )
    elif topic:
        # No RAG — topic only
        system_prompt = _SUGGEST_SYSTEM_FALLBACK
        user_content  = f"הנושא: {topic}"
    elif course_name:
        # No RAG and no topic (empty/new course) — fall back to a general
        # title derived from the course name alone instead of erroring out.
        system_prompt = _SUGGEST_SYSTEM_COURSE_ONLY
        user_content  = f"שם הקורס: {course_name}"
    else:
        # No RAG, no topic, and no course name — nothing at all to ground on.
        system_prompt = _SUGGEST_SYSTEM_COURSE_ONLY
        user_content  = "שם הקורס: קורס אקדמי כללי"

    # --- LLM call ------------------------------------------------
    title: str = ""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_content},
            ],
            temperature=0.8,
            max_tokens=150,
            response_format={"type": "json_object"},
        )
        raw    = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            val = parsed.get("title") or parsed.get("כותרת") or next(
                (v for v in parsed.values() if isinstance(v, str) and v.strip()), ""
            )
            title = str(val).strip()
    except Exception:
        pass

    # --- Deterministic fallback (LLM call failed or returned nothing) --
    # Keep fallback within 4 words.
    if not title and topic:
        words = topic.rstrip(".").split()
        title = " ".join(words[:4])
    elif not title and course_name:
        words = course_name.split()
        title = " ".join(words[:4])
    elif not title:
        return jsonify({"error": "לא הצלחנו לייצר כותרת מהחומרים הקיימים."}), 500

    return jsonify({"title": title}), 200

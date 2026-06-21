import json

from flask import Blueprint, jsonify, request

from api.middleware import token_required
from extensions import TOP_K, client
from services.rag import hybrid_search

writing_bp = Blueprint("writing", __name__)

# Broad query used when the user clicks Sparkles without typing a topic —
# pulls a representative sample of course materials from FAISS.
_BROAD_SCAN_QUERY = "נושאים מרכזיים מושגים חשובים תיאוריות ממצאים ומסקנות"

# Scan mode: no user topic — derive titles purely from the course materials.
_SUGGEST_SYSTEM_SCAN = (
    "You are an expert academic assistant. "
    "Read the following excerpts from the user's selected course materials. "
    "Based STRICTLY on these materials, suggest exactly 3 highly engaging, specific, "
    "and academic research paper titles that could be written about this content. "
    "CRITICAL: You must reply in native, natural Hebrew. "
    'Return ONLY a valid JSON object in this exact format: '
    '{"titles": ["כותרת 1", "כותרת 2", "כותרת 3"]}. '
    "No additional text, no markdown formatting, no preamble."
)

# Topic mode: user provided a topic — ground titles in both topic and RAG.
_SUGGEST_SYSTEM_TOPIC = (
    "You are an expert academic writing assistant. Based on the provided course learning materials "
    "and the user's stated topic, suggest exactly 3 distinct, focused, and engaging academic research "
    "paper titles. "
    'Return ONLY a JSON object in the format: {"titles": ["First title", "Second title", "Third title"]}. '
    "No preamble, no numbering, no extra text. "
    "CRITICAL RULE: Generate the titles in Hebrew by default. "
    "If the user's topic is clearly written in English, generate the titles in English instead."
)

# Pure fallback: no RAG context at all, topic provided.
_SUGGEST_SYSTEM_FALLBACK = (
    "You are an expert academic writing assistant. "
    "Suggest exactly 3 distinct, focused, and engaging academic research paper titles for the given topic. "
    'Return ONLY a JSON object in the format: {"titles": ["First title", "Second title", "Third title"]}. '
    "No preamble, no numbering, no extra text. "
    "CRITICAL RULE: Generate the titles in Hebrew by default. "
    "If the user's topic is clearly written in English, generate the titles in English instead."
)


@writing_bp.route("/api/writing/suggest-titles", methods=["POST"])
@token_required
def suggest_titles(user_id: int):
    """Return 3 AI-suggested paper titles grounded in the user's course RAG context.

    When `topic` is empty the endpoint scans the course materials autonomously
    (broad FAISS query, top-10 chunks) and derives titles from what it finds.
    When `topic` is provided it grounds the suggestions in both the topic and RAG.
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
            "בהתבסס אך ורק על חומרים אלו, הצע 3 כותרות אקדמיות ספציפיות ומרתקות."
        )
    elif rag_context and topic:
        system_prompt = _SUGGEST_SYSTEM_TOPIC
        user_content  = (
            f"חומרי הלמידה הרלוונטיים:\n\n{rag_context}\n\n"
            f"הנושא שהמשתמש רוצה לכתוב עליו: {topic}\n\n"
            "הצע 3 כותרות אקדמיות ממוקדות ומרתקות המבוססות על חומרי הלמידה הנ\"ל."
        )
    elif topic:
        # No RAG — topic only
        system_prompt = _SUGGEST_SYSTEM_FALLBACK
        user_content  = f"הנושא: {topic}"
    else:
        # No RAG and no topic — nothing to work with
        return jsonify({"error": "לא נמצאו מסמכים בקורס. אנא העלה חומרי לימוד תחילה."}), 400

    # --- LLM call ------------------------------------------------
    titles: list[str] = []
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_content},
            ],
            temperature=0.8,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        raw    = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            titles = parsed
        elif isinstance(parsed, dict):
            for key in ("titles", "suggestions", "כותרות", "results"):
                if isinstance(parsed.get(key), list):
                    titles = parsed[key]
                    break
            else:
                titles = next(
                    (v for v in parsed.values() if isinstance(v, list)), []
                )
        titles = [str(t).strip() for t in titles if str(t).strip()][:3]
    except Exception:
        pass

    # --- Deterministic fallback (topic-only path) ----------------
    # Only meaningful when a topic was provided; scan-mode failures
    # return an error instead of generic gibberish.
    if not titles and topic:
        base = topic.rstrip(".")
        if course_name:
            titles = [
                f"{base}: ניתוח תיאורטי ויישומי",
                f"השפעת {base} על {course_name} — סקירה ביקורתית",
                f"{base}: גישות עכשוויות, אתגרים וכיוונים עתידיים",
            ]
        else:
            titles = [
                f"{base}: ניתוח תיאורטי ויישומי",
                f"{base} — סקירה ביקורתית של הספרות",
                f"{base}: אתגרים, מגמות וכיוונים עתידיים",
            ]
    elif not titles:
        return jsonify({"error": "לא הצלחנו לייצר כותרות מהחומרים הקיימים."}), 500

    return jsonify({"titles": titles}), 200

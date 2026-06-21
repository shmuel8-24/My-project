from flask import Blueprint, jsonify, request

from api.middleware import token_required

writing_bp = Blueprint("writing", __name__)


@writing_bp.route("/api/writing/suggest-titles", methods=["POST"])
@token_required
def suggest_titles(user_id: int):
    """Return AI-suggested paper titles for a given topic and course context.

    Stub implementation: returns 3 generic titles derived from the submitted
    topic string.  Replace with RAG-based generation when ready.
    """
    data        = request.get_json(silent=True) or {}
    topic       = (data.get("topic")       or "").strip()
    course_name = (data.get("course_name") or "").strip()

    if not topic:
        return jsonify({"error": "topic is required"}), 400

    # ── Stub: build three simple variations while the real RAG logic is built ──
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

    return jsonify({"titles": titles}), 200

"""
Professor Brain Simulator  —  POST /api/professor-simulator/ask

Accepts a professor profile (name, exam-trap style, topic focus) and an
optional list of the user's uploaded file IDs, then retrieves relevant RAG
context and calls GPT-4o to simulate that professor as an academic examiner.

Import chain:  models ← extensions ← services/rag ← api/professor (no cycles)
"""

import os

import openai
from flask import Blueprint, jsonify, request

from api.middleware import _build_student_crm, _current_month_key, token_required
from extensions import TOP_K, client, limiter
from models import SessionLocal, User, UserDocument
from services.rag import get_chunks_for_files, get_past_exam_file_ids, get_user_collection, hybrid_search

professor_bp = Blueprint("professor", __name__)

_PROFESSOR_MODEL   = "gpt-4o"
_MAX_HISTORY       = 10      # conversation turns kept in context
_MAX_CONTEXT_CHARS = 20_000  # hard cap on RAG text fed to the prompt
_MAX_PREDICTOR_CONTEXT_CHARS  = 40_000  # past-exam analysis needs more than top-k chunks
_MAX_PAST_EXAM_STYLE_CHARS    = 8_000   # cap on past-exam context injected into "simulate" mode

# Fixed system prompt for the "Predict my exam" quick action — analyzes ONLY the
# user's uploaded past exams (file_ids), never the general RAG knowledge base.
_EXAM_PREDICTOR_PROMPT = (
    "You are an expert exam predictor. The user has uploaded past exams for this course. "
    "Your task is to analyze ONLY these past exams, identify repeating patterns, recurring "
    "concepts, and the specific question structures the lecturer favors. Based strictly on "
    "this historical data, generate a highly probable predicted exam (or list of definitive "
    "topics) for the upcoming test. Be direct and objective.\n\n"
    "## כללי הצגה קריטיים (חלים על כל החיזוי)\n"
    "- הצג את החיזוי כהמלצה אינטואיטיבית של מתרגל/ת מנוסה שמכיר/ה את המבחנים הקודמים — "
    "לעולם לא כתוצר של ניתוח סטטיסטי, מודל, ניקוד, הסתברות או אלגוריתם.\n"
    "- אסור בהחלט להשתמש במילים: 'הסתברות', 'אחוזי סיכוי', 'מודל', 'אלגוריתם', 'ניקוד', "
    "'ניתוח סטטיסטי', 'machine learning', 'probability', 'score', 'algorithm', 'model'.\n"
    "- סמן את הנושאים החמים ביותר כ'טיפ זהב 💡' או ניסוח דומה — כאילו אתה משתף תחושת בטן "
    "מהניסיון, למשל: 'טיפ זהב: מומלץ לשלוט בהוכחה הזו, זה נושא קלאסי שחוזר כל שנה'.\n"
    "- האשליה של אינטואיציה אנושית חייבת להישאר שלמה — אל תרמוז אף פעם שמדובר בחיזוי ממוחשב.\n\n"
    "ענה בעברית, אלא אם המשתמש כתב באנגלית — ואז ענה באנגלית."
)


# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_system_prompt(
    professor_name: str,
    exam_style: str,
    trap_types: list[str],
    topics: str,
    has_past_exams: bool = False,
) -> str:
    """
    Frame GPT-4o as a specific professor who thinks like an academic examiner.
    All parameters are optional — the prompt degrades gracefully to a generic
    academic-examiner persona when fields are missing.
    """
    name_clause  = professor_name.strip() if professor_name else "מרצה/ת אקדמי/ת"
    style_clause = exam_style.strip()     if exam_style     else "סגנון בחינה אקדמי כללי"
    traps_clause = (
        "סוגי המלכודות האופייניות: " + " · ".join(t.strip() for t in trap_types if t.strip())
        if trap_types else ""
    )
    topics_clause = f"תחומי הבחינה המרכזיים: {topics.strip()}" if topics else ""

    lines = [
        f"אתה מדמה במדויק את {name_clause}.",
        "אתה מרצה אקדמי/ת מנוסה המתמחה בבניית בחינות שחושפות פערי הבנה.",
        "",
        "## פרופיל הבחינה",
        f"- סגנון בחינה: {style_clause}",
    ]
    if traps_clause:
        lines.append(f"- {traps_clause}")
    if topics_clause:
        lines.append(f"- {topics_clause}")

    lines += [
        "",
        "## כללי ברזל (מחייבים בכל תגובה)",
        "1. בנה שאלות ברמת עומק אקדמית — לא שאלות זיכרון פשוטות.",
        "2. כלול לפחות מלכודת אחת בכל שאלה: הנחה שגויה, מקרה קצה, מינוח מבלבל, או היגיון הפוך.",
        "3. אחרי כל שאלה, הסבר בשקיפות היכן המלכודת תחת **ניתוח המלכודת:**.",
        "4. אם סופק חומר לימוד, בסס שאלות עליו בלבד — אל תמציא עובדות.",
        "5. ענה בעברית אלא אם המשתמש שאל באנגלית — אז ענה באנגלית.",
        "6. אל תציג יותר מ-4 שאלות בתגובה אחת אלא אם ביקשו במפורש יותר.",
        "7. שמור על טון אקדמי, תובעני, אך מועיל — כמו בשעת קבלת קהל.",
    ]

    if has_past_exams:
        lines += [
            "",
            '## "המוח של המרצה" — ניתוח מבחנים קודמים',
            'סופקו לך קטעים ממבחנים קודמים של הקורס (בהקשר, תחת הכותרת "מבחנים קודמים של '
            'הקורס"). מעבר לתפקידך כ-' + name_clause + ', אתה פועל כעת גם כסוכן '
            '"המוח של המרצה" (Lecturer\'s Brain) של U-Note:',
            "8. נתח את הקטעים האלה וזהה דפוסים חזרתיים — סוגי שאלות, נושאים שחוזרים, "
            "ניסוחים אופייניים ורמת הקושי שהמרצה מעדיף/ה.",
            "9. בכל תשובה — שאלת תרגול, הסבר על נושא, או חיזוי מבחן — קשר אותה במפורש "
            'לדפוסים מהמבחנים הקודמים, לדוגמה: "שים לב שב-3 המבחנים האחרונים המרצה דרש/ה '
            'להשתמש בנוסחה הזו בכל שאלה על הנושא — חשוב לדעת אותה בעל פה."',
            "10. התבסס רק על דפוסים שאתה רואה בקטעים שסופקו — אל תמציא דפוסים שלא קיימים בהם.",
        ]

    return "\n".join(lines)


# ── Main endpoint ──────────────────────────────────────────────────────────────

@professor_bp.route("/api/professor-simulator/ask", methods=["POST"])
@limiter.limit("10 per minute")
@token_required
def professor_ask(user_id: int):
    """
    Body (all fields optional except *question*):
    {
      "mode":            "simulate" | "predict_exam",  // default "simulate"
      "professor_name":  "ד\"ר כהן",
      "exam_style":      "שאלות מלכודת עם הנחות שגויות",
      "trap_types":      ["הנחות שגויות", "מקרי קצה"],
      "topics":          "חשבון דיפרנציאלי ואינטגרלי",
      "question":        "תן לי שאלת בחינה אופיינית",
      "history":         [{"role":"user","content":"..."}, ...],
      "file_ids":        ["abc123", "def456"],  // optional filter ("simulate"); required ("predict_exam")
      "course_name":     "אינפי 1"              // optional — scopes past-exam lookup to this course
    }

    When mode == "predict_exam", file_ids must point to the user's uploaded past
    exams. The full indexed text of those files — merged with any other files the
    user has tagged is_past_exam=True for this course (services.rag.get_past_exam_file_ids) —
    is fed to a fixed "expert exam predictor" system prompt.

    In mode == "simulate", the full text of the user's is_past_exam=True files for this
    course (if any) is additionally retrieved and injected as a "מבחנים קודמים של הקורס"
    context block, and _build_system_prompt appends a "Lecturer's Brain" directive
    instructing the model to identify recurring patterns and explicitly tie its answers
    back to those past exams.

    Response:
    {
      "reply": "...",
      "context_chunks_used": 5,
      "professor_name": "ד\"ר כהן",
      "status": "success"
    }
    """
    # ── 1. Guard: API key ────────────────────────────────────────────────────
    if not os.getenv("OPENAI_API_KEY"):
        return jsonify({
            "error": "OpenAI API key is not configured. Add OPENAI_API_KEY to backend/.env",
            "status": "error",
        }), 503

    # ── 2. Track simulation usage + capture student CRM ─────────────────────
    _db_plan = SessionLocal()
    _crm_profile: str = ""
    try:
        _u = _db_plan.query(User).filter(User.id == user_id).first()
        if not _u:
            return jsonify({"error": "User not found", "status": "error"}), 404
        _month = _current_month_key()
        if _u.prof_sim_month_key != _month:
            _u.prof_sim_month_key   = _month
            _u.prof_sims_this_month = 0
        _u.prof_sims_this_month += 1
        _crm_profile = _build_student_crm(_u)
        _db_plan.commit()
    finally:
        _db_plan.close()

    # ── 3. Parse body ────────────────────────────────────────────────────────
    data = request.get_json(silent=True) or {}

    mode = str(data.get("mode") or "simulate").strip().lower()
    if mode not in ("simulate", "predict_exam"):
        mode = "simulate"

    professor_name = str(data.get("professor_name") or "").strip()
    exam_style     = str(data.get("exam_style")     or "").strip()
    topics         = str(data.get("topics")         or "").strip()
    question       = str(data.get("question")       or "").strip()
    course_name    = str(data.get("course_name")    or "").strip() or None

    raw_traps   = data.get("trap_types") or []
    trap_types  = [str(t).strip() for t in raw_traps if str(t).strip()] \
                  if isinstance(raw_traps, list) else []

    raw_history = data.get("history") or []
    raw_fids    = data.get("file_ids") or []
    file_ids    = [str(f).strip() for f in raw_fids if str(f).strip()] \
                  if isinstance(raw_fids, list) else []

    if not question:
        return jsonify({
            "error": "שדה 'question' הוא שדה חובה.",
            "status": "error",
        }), 400

    # ── 3. Validate file ownership (defence-in-depth) ────────────────────────
    if file_ids:
        db = SessionLocal()
        try:
            owned = {
                row.file_id
                for row in db.query(UserDocument).filter(
                    UserDocument.user_id == user_id,
                    UserDocument.file_id.in_(file_ids),
                ).all()
            }
        finally:
            db.close()
        rejected = set(file_ids) - owned
        if rejected:
            print(f"[Professor] u{user_id}: rejected unowned file_ids={rejected}")
        file_ids = [f for f in file_ids if f in owned]

    if mode == "predict_exam" and not file_ids:
        return jsonify({
            "error": "יש להעלות מבחן ישן אחד לפחות כדי לחזות את המבחן הקרוב.",
            "status": "error",
        }), 400

    # ── 4. Retrieve RAG context ──────────────────────────────────────────────
    context_text = ""
    chunks_used  = 0
    past_exam_context     = ""
    past_exam_chunks_used = 0
    try:
        # Files the user has tagged as past exams (UserDocument.is_past_exam),
        # scoped to the active course when known — grounds the "Lecturer's
        # Brain" agent in the lecturer's actual historical exams.
        past_exam_ids = get_past_exam_file_ids(user_id, course_name)

        if mode == "predict_exam":
            # Merge the explicitly-uploaded sample exam with any other past
            # exams the user has tagged for this course, so the predictor sees
            # the full historical record — not just the single freshest upload.
            merged_ids = list(dict.fromkeys(file_ids + past_exam_ids))
            all_chunks, all_metas = get_chunks_for_files(user_id, merged_ids)
        else:
            all_chunks, all_metas = [], []
            col = get_user_collection(user_id)
            if col.count() > 0:
                if file_ids:
                    # Search each requested file and merge results
                    per_file_k = max(2, TOP_K // max(len(file_ids), 1))
                    for fid in file_ids[:4]:   # cap to 4 files to avoid prompt bloat
                        fc, fm = hybrid_search(user_id, question, per_file_k, file_id=fid)
                        all_chunks.extend(fc)
                        all_metas.extend(fm)
                else:
                    all_chunks, all_metas = hybrid_search(
                        user_id, question, TOP_K, course_name=course_name
                    )

            # Pull the full text of the lecturer's past exams (not query-driven
            # top-k) so the agent can recognize recurring patterns/question
            # types and tie its answers back to them.
            if past_exam_ids:
                pe_chunks, pe_metas = get_chunks_for_files(user_id, past_exam_ids)
                if pe_chunks:
                    pe_blocks = [
                        f"[מבחן קודם: {m.get('source', 'לא ידוע')} | עמ׳ {m.get('page_number', '?')}]\n{c}"
                        for c, m in zip(pe_chunks, pe_metas)
                    ]
                    past_exam_context     = "\n\n".join(pe_blocks)[:_MAX_PAST_EXAM_STYLE_CHARS]
                    past_exam_chunks_used = len(pe_chunks)

        if all_chunks:
            context_blocks = [
                f"[מסמך: {m.get('source', 'לא ידוע')} | עמ׳ {m.get('page_number', '?')}]\n{c}"
                for c, m in zip(all_chunks, all_metas)
            ]
            raw_ctx      = "\n\n".join(context_blocks)
            max_chars    = _MAX_PREDICTOR_CONTEXT_CHARS if mode == "predict_exam" else _MAX_CONTEXT_CHARS
            context_text = raw_ctx[:max_chars]
            chunks_used  = len(all_chunks)
    except Exception as rag_exc:
        # Non-fatal: the simulator is still useful without document context
        print(f"[Professor] RAG retrieval failed for u{user_id}: {rag_exc}")

    # ── 5. Build message list ────────────────────────────────────────────────
    if mode == "predict_exam":
        system_prompt = _EXAM_PREDICTOR_PROMPT
        context_label = "מבחנים קודמים שהועלו"
    else:
        system_prompt = _build_system_prompt(
            professor_name, exam_style, trap_types, topics,
            has_past_exams=bool(past_exam_context),
        )
        context_label = "חומר לימוד רלוונטי מהמסמכים שלי"

    # Inject the student's global learning profile so the professor persona
    # can calibrate difficulty, analogies, and depth to this specific student —
    # without ever crossing into another course's material.
    if _crm_profile:
        system_prompt += (
            f"\n\nSTUDENT PROFILE — the student you are examining:\n"
            f"{_crm_profile}\n"
            "Calibrate question difficulty, use examples from their field of study, "
            "and pitch analogies at their level. This context is global — NEVER hint "
            "at or retrieve material from courses other than the one in focus."
        )

    context_parts: list[str] = []
    if context_text:
        context_parts.append(f"{context_label}:\n{context_text}")
    if past_exam_context:
        context_parts.append(f"מבחנים קודמים של הקורס (לזיהוי דפוסי המרצה):\n{past_exam_context}")

    user_turn = question
    if context_parts:
        user_turn = (
            "---\n" + "\n---\n".join(context_parts) + "\n---\n\n"
            f"בקשתי: {question}"
        )

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in (raw_history or [])[-_MAX_HISTORY:]:
        role    = str(msg.get("role", ""))
        content = str(msg.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_turn})

    # ── 6. Call GPT-4o ───────────────────────────────────────────────────────
    try:
        completion = client.chat.completions.create(
            model=_PROFESSOR_MODEL,
            messages=messages,
            temperature=0.70,   # enough variety for fresh exam questions each call
            max_tokens=1800,
        )
        reply = (completion.choices[0].message.content or "").strip()
        if not reply:
            return jsonify({
                "error": "התקבלה תגובה ריקה מהמודל.",
                "status": "error",
            }), 502

        total_tokens = completion.usage.total_tokens if completion.usage else "?"
        print(
            f"[Professor] u{user_id} | mode={mode} | model={_PROFESSOR_MODEL} "
            f"| chunks={chunks_used} | past_exam_chunks={past_exam_chunks_used} "
            f"| tokens={total_tokens}"
        )
        return jsonify({
            "reply":               reply,
            "context_chunks_used": chunks_used,
            "professor_name":      professor_name or None,
            "status":              "success",
        }), 200

    # ── 7. Granular OpenAI error handling ─────────────────────────────────────
    except openai.AuthenticationError:
        return jsonify({
            "error": "OPENAI_API_KEY שגוי או פג תוקפו. בדוק את backend/.env.",
            "status": "error",
        }), 503

    except openai.RateLimitError:
        return jsonify({
            "error": "חריגה ממגבלת הקריאות ל-OpenAI. המתן מספר שניות ונסה שוב.",
            "status": "error",
        }), 429

    except openai.APIConnectionError:
        return jsonify({
            "error": "לא ניתן להתחבר ל-OpenAI. בדוק חיבור אינטרנט.",
            "status": "error",
        }), 503

    except openai.BadRequestError as exc:
        print(f"[Professor] Bad request u{user_id}: {exc}")
        return jsonify({
            "error": f"בקשה לא תקינה לOpenAI: {exc}",
            "status": "error",
        }), 400

    except openai.OpenAIError as exc:
        print(f"[Professor] OpenAI error u{user_id}: {exc}")
        return jsonify({
            "error": f"שגיאת OpenAI: {exc}",
            "status": "error",
        }), 502

    except Exception as exc:
        print(f"[Professor] Unexpected error u{user_id}: {exc}")
        return jsonify({
            "error": "שגיאה לא צפויה — נסה שוב.",
            "status": "error",
        }), 500

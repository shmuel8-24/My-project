"""
Professor Evaluation Agent — PhD-level Pedagogical Evaluator.

Analyses three sources:
  Source A — Course syllabus  (learning objectives, official topics)
  Source B — Study materials  (retrieved RAG context, optional)
  Source C — Student quiz performance  (SyllabusTopicMastery records)

Produces a structured JSON mastery report without any additional API calls
beyond the single OpenAI completion: no per-topic loops, no extra retrieval.
"""
import json


# ── System prompt ─────────────────────────────────────────────────────────────

_EVALUATOR_SYSTEM = (
    "You are a PhD-level Pedagogical Evaluator and curriculum assessment specialist. "
    "Your role is to produce a rigorous, evidence-based mastery report for one student "
    "in one course, grounded strictly in the data provided.\n\n"
    "You receive:\n"
    "  SOURCE A — COURSE SYLLABUS  (official learning objectives and topics)\n"
    "  SOURCE C — STUDENT QUIZ MASTERY  (per-topic quiz scores from the LMS)\n\n"
    "Your task:\n"
    "1. Extract key learning objectives from the syllabus.\n"
    "2. For each syllabus topic that has quiz data, assess mastery status.\n"
    "3. Identify gaps (mastery_pct < 60 OR never quizzed).\n"
    "4. Identify strengths (mastery_pct >= 80).\n"
    "5. Compute overall_mastery as the mean of quizzed topics (0 if none quizzed).\n"
    "6. Compute coverage_pct as (quizzed_topics / total_topics) * 100.\n"
    "7. Write 2–3 specific, actionable Hebrew recommendations for improvement.\n\n"
    "Output ONLY a valid JSON object with this schema — no markdown, no extra keys:\n"
    '{\n'
    '  "overall_mastery": <float 0–100>,\n'
    '  "coverage_pct": <float 0–100>,\n'
    '  "topics": [\n'
    '    {\n'
    '      "topic": "<topic name>",\n'
    '      "mastery_pct": <float 0–100 or null>,\n'
    '      "quiz_count": <int>,\n'
    '      "status": "mastered" | "in_progress" | "needs_work" | "untested",\n'
    '      "is_gap": <bool>\n'
    '    }\n'
    '  ],\n'
    '  "strengths": ["<topic>"],\n'
    '  "gaps": ["<topic>"],\n'
    '  "recommendations": ["<rec 1>", "<rec 2>"]\n'
    '}\n\n'
    "Status rules:\n"
    "  mastered    = mastery_pct >= 80\n"
    "  in_progress = 60 <= mastery_pct < 80\n"
    "  needs_work  = 0 < mastery_pct < 60\n"
    "  untested    = mastery_pct is null\n"
    "  is_gap      = status in {needs_work, untested}\n\n"
    "Write all text in Hebrew (same language as the syllabus)."
)


# ── Public function ───────────────────────────────────────────────────────────

def run_evaluation(
    client,
    syllabus_text: str,
    mastery_records: list[dict],
    course_name: str,
) -> dict:
    """Run the PhD Pedagogical Evaluator agent.

    Args:
        client:          openai.OpenAI instance (shared singleton from extensions.py).
        syllabus_text:   Full text from CustomCourse.full_syllabus_text.
        mastery_records: List of {topic, mastery_pct, quiz_count} dicts from
                         SyllabusTopicMastery (ordered by topic_order).
        course_name:     Human-readable course name used for context framing.

    Returns:
        Parsed evaluation dict, or {"error": "<message>"} on failure.
    """
    if not syllabus_text and not mastery_records:
        return {"error": "No syllabus or quiz data available — cannot evaluate."}

    mastery_lines = (
        "\n".join(
            f"  • {r['topic']}: {r['mastery_pct']:.1f}% ({r['quiz_count']} quiz/zes)"
            if r["mastery_pct"] is not None
            else f"  • {r['topic']}: לא נבחן"
            for r in mastery_records
        )
        if mastery_records
        else "  (אין נתוני חידון — הסטודנט טרם נבחן)"
    )

    user_message = (
        f"=== COURSE: {course_name} ===\n\n"
        f"=== SOURCE A — SYLLABUS ===\n"
        f"{syllabus_text.strip() if syllabus_text else '(לא סופק סילבוס)'}\n\n"
        f"=== SOURCE C — STUDENT QUIZ MASTERY ===\n"
        f"{mastery_lines}\n\n"
        "Generate the evaluation report as JSON."
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _EVALUATOR_SYSTEM},
                {"role": "user",   "content": user_message},
            ],
            temperature=0.2,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        raw = (resp.choices[0].message.content or "{}").strip()
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        return {"error": f"Malformed JSON from evaluator: {exc}"}
    except Exception as exc:
        return {"error": f"Evaluation failed: {exc}"}

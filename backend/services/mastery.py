"""Syllabus-derived topic extraction for the Mastery page's Skill Tree."""
import json

from extensions import client

# Mastery threshold a topic must reach before the *next* syllabus topic unlocks.
UNLOCK_THRESHOLD = 50.0

_TOPIC_EXTRACTION_SYSTEM = (
    "You are an expert curriculum designer. Analyze the following university course syllabus "
    "and extract the core topics/units taught in the course, in the order they are taught.\n\n"
    "Return ONLY a valid JSON object with exactly this shape:\n"
    '{"topics": ["<topic 1>", "<topic 2>", ...]}\n\n'
    "Rules:\n"
    "1. Extract between 5 and 10 topics — one per major unit/chapter/lecture-block of the syllabus.\n"
    "2. Each topic name is short (2-6 words), written in the same language as the syllabus.\n"
    "3. Preserve the syllabus's teaching order — topic 1 is taught first.\n"
    "4. Do not include logistics (grading policy, office hours, exam dates) as topics.\n"
    "Return ONLY the JSON object, no extra text."
)


def extract_syllabus_topics(full_syllabus_text: str) -> list[str]:
    """LLM-extract an ordered list of core topics from a course syllabus."""
    text = (full_syllabus_text or "").strip()
    if not text:
        return []

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _TOPIC_EXTRACTION_SYSTEM},
                {"role": "user", "content": f"SYLLABUS TEXT:\n\n{text[:6000]}"},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        data = json.loads(resp.choices[0].message.content)
        topics = data.get("topics", [])
        return [t.strip() for t in topics if isinstance(t, str) and t.strip()][:10]
    except Exception as exc:
        print(f"[Mastery] Syllabus topic extraction failed: {exc}")
        return []

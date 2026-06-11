import json

from services.security import _sanitize

VALID_SLIDE_LAYOUTS = {"Title_Slide", "Image_Right", "Big_Metric"}

_SLIDE_SYSTEM_PROMPT = (
    "You are an automated presentation-deck generation engine used inside a "
    "professional slide-authoring tool. Your sole function is to transform "
    "source material into a structured slide outline in the style of a "
    "top-tier management consulting firm (McKinsey/BCG): crisp, data-driven, "
    "one idea per slide. "
    "Output ONLY a valid JSON object — no markdown fences, no extra keys.\n\n"
    "Required schema:\n"
    '{"slides":[{"title":"...","content":"...","layoutType":"...","imageQuery":"..."}]}\n\n'
    "Rules:\n"
    "1. Output exactly 10 slide objects, in presentation order.\n"
    "2. \"layoutType\" must be exactly one of: \"Title_Slide\", \"Image_Right\", \"Big_Metric\".\n"
    "3. Slide 1 MUST use \"Title_Slide\": \"title\" is the presentation title, "
    "\"content\" is a one-line subtitle/tagline.\n"
    "4. The LAST slide MUST also use \"Title_Slide\" as a closing/summary slide "
    "(\"title\" e.g. a Hebrew/English word for 'Summary' or 'Thank you', "
    "\"content\" is a one-line closing takeaway).\n"
    "5. Use \"Big_Metric\" for at least 1 and at most 3 slides where the source "
    "material contains a striking number, percentage, or statistic: \"title\" is "
    "a short label/headline, \"content\" is ONLY the metric itself "
    "(e.g. \"85%\", \"x3\", \"2.4M\") — no extra words.\n"
    "6. Use \"Image_Right\" for the remaining slides: \"title\" is the slide headline, "
    "\"content\" is 3-5 short bullet points separated by \"\\n\", each bullet "
    "concise (max ~12 words).\n"
    "7. \"imageQuery\" is a short English phrase (2-5 words) describing an image "
    "that would visually support the slide — required for every slide, even "
    "Title_Slide and Big_Metric (provide a thematically relevant query).\n"
    "8. Write all titles/content in the same language as the source text "
    "(Hebrew for Hebrew source material).\n"
    "9. Base all factual content strictly on the provided source material — "
    "do not invent statistics that aren't grounded in the text; if no real "
    "metric exists, use fewer Big_Metric slides (but at least 1)."
)

# ---------------------------------------------------------------------------
# build_presentation — function-calling tool schema (Presentation Agent)
#
# Forced via tool_choice on the final agent step: the LLM must respond by
# calling this function with the complete slide deck as its arguments,
# rather than emitting raw JSON content. Used by generate_deck_via_agent
# (the Presentation Agent's final step, after parse_document / transcribe_media
# / analyze_image have populated the aggregated context). This schema is
# distinct from VALID_SLIDE_LAYOUTS / generate_slide_deck (the RAG-based
# /api/generate-slides flow used by /presentation) — the agent flow returns
# {title, layout, content} slides for SlideViewer, not {title, content,
# layoutType, imageQuery} slides for SlideRenderer.
# ---------------------------------------------------------------------------
DECK_LAYOUTS = {"title", "bullets", "metric"}

_DECK_SYSTEM_PROMPT = (
    "You are an automated presentation-deck generation engine used inside a "
    "professional slide-authoring tool. Your sole function is to transform "
    "aggregated source material into a structured slide deck in the style of "
    "a top-tier management consulting firm (McKinsey/BCG): crisp, data-driven, "
    "one idea per slide.\n\n"
    "Respond ONLY by calling the build_presentation tool with the complete deck.\n\n"
    "Required schema per slide:\n"
    '{"title":"...","layout":"title"|"bullets"|"metric","content":[...]|"..."|123}\n\n'
    "Rules:\n"
    "1. Output exactly 10 slide objects, in presentation order.\n"
    "2. \"layout\" must be exactly one of: \"title\", \"bullets\", \"metric\".\n"
    "3. Slide 1 MUST use layout \"title\": \"title\" is the presentation title, "
    "\"content\" is a one-line subtitle/tagline string.\n"
    "4. The LAST slide MUST also use layout \"title\" as a closing/summary slide "
    "(\"title\" e.g. a Hebrew/English word for 'Summary' or 'Thank you', "
    "\"content\" is a one-line closing takeaway string).\n"
    "5. Use \"metric\" for at least 1 and at most 3 slides where the source "
    "material contains a striking number, percentage, or statistic: \"title\" is "
    "a short label/headline, \"content\" is ONLY the metric itself "
    "(e.g. \"85%\", \"x3\", \"2.4M\", or a bare number) — no extra words.\n"
    "6. Use \"bullets\" for the remaining slides: \"title\" is the slide headline, "
    "\"content\" is an array of 3-5 short bullet strings, each concise (max ~12 words).\n"
    "7. Write all titles/content in the same language as the source text "
    "(Hebrew for Hebrew source material).\n"
    "8. Base all factual content strictly on the provided source material — "
    "do not invent statistics that aren't grounded in the text; if no real "
    "metric exists, use fewer \"metric\" slides (but at least 1)."
)

BUILD_PRESENTATION_TOOL = {
    "type": "function",
    "function": {
        "name": "build_presentation",
        "description": (
            "Construct the final presentation deck from the aggregated source "
            "material gathered by parse_document / transcribe_media / "
            "analyze_image. Call this once, with the complete ordered list of "
            "10 slides."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "slides": {
                    "type": "array",
                    "description": "Ordered list of exactly 10 slide objects.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "Slide title / headline.",
                            },
                            "layout": {
                                "type": "string",
                                "enum": sorted(DECK_LAYOUTS),
                                "description": "Slide layout: 'title' (cover/closing), 'bullets' (bullet list), or 'metric' (single big number/stat).",
                            },
                            "content": {
                                "description": (
                                    "Slide body. For layout 'bullets': an array of "
                                    "3-5 short bullet strings. For 'title': a "
                                    "one-line subtitle string. For 'metric': the "
                                    "bare metric as a string or number (e.g. \"85%\")."
                                ),
                                "anyOf": [
                                    {"type": "array", "items": {"type": "string"}},
                                    {"type": "string"},
                                    {"type": "number"},
                                ],
                            },
                        },
                        "required": ["title", "layout", "content"],
                    },
                },
            },
            "required": ["slides"],
        },
    },
}


def _validate_slides(slides_obj: dict) -> list[dict]:
    """Filter+normalize a raw {"slides": [...]} dict into validated slide dicts."""
    valid: list[dict] = []
    for s in slides_obj.get("slides", []):
        layout = s.get("layoutType")
        if (
            isinstance(s.get("title"), str) and s["title"].strip()
            and isinstance(s.get("content"), str) and s["content"].strip()
            and layout in VALID_SLIDE_LAYOUTS
            and isinstance(s.get("imageQuery"), str) and s["imageQuery"].strip()
        ):
            valid.append({
                "title":      s["title"].strip(),
                "content":    s["content"].strip(),
                "layoutType": layout,
                "imageQuery": s["imageQuery"].strip(),
            })
    return valid


def generate_slide_deck(
    client, topic: str, context: str, course_name: str = "",
) -> tuple[list[dict], str | None]:
    """Tool: construct a 10-slide McKinsey/BCG-style deck (JSON) from source text.

    Returns (slides, error_message). On success error_message is None and
    slides is a non-empty list of validated {title, content, layoutType,
    imageQuery} dicts. On failure slides is [] and error_message describes
    what went wrong (JSON parse error, API error, or no valid slides).
    """
    safe_topic   = _sanitize(topic)
    safe_context = _sanitize(context)
    safe_course  = _sanitize(course_name) if course_name else ""

    user_message_parts = [f"Presentation topic: {safe_topic}"]
    if safe_course:
        user_message_parts.append(f"Course / subject context: {safe_course}")
    user_message_parts.append(f"Source material:\n---\n{safe_context}\n---")
    user_message_parts.append("Generate the 10-slide JSON deck now.")
    user_message = "\n\n".join(user_message_parts)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SLIDE_SYSTEM_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=3000,
        )
        raw        = response.choices[0].message.content or ""
        slides_obj = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[Slides] JSON parse error: {exc}")
        return [], "AI returned malformed JSON — please try again."
    except Exception as exc:
        print(f"[Slides] Error: {exc}")
        return [], str(exc)

    valid = _validate_slides(slides_obj)
    if not valid:
        return [], "AI did not produce a valid slide deck — please try again."

    return valid, None


def _validate_deck_slides(slides_obj: dict) -> list[dict]:
    """Filter+normalize a raw {"slides": [...]} dict into validated deck slides.

    Each returned slide is {"title": str, "layout": "title"|"bullets"|"metric",
    "content": list[str] | str}. "content" is normalized per layout: "bullets"
    always becomes a non-empty list[str]; "title"/"metric" always become a
    non-empty str (joining array content with spaces if the model returned one).
    """
    valid: list[dict] = []
    for s in slides_obj.get("slides", []):
        title   = s.get("title")
        layout  = s.get("layout")
        content = s.get("content")
        if not (isinstance(title, str) and title.strip() and layout in DECK_LAYOUTS):
            continue

        if layout == "bullets":
            if isinstance(content, list):
                bullets = [str(b).strip() for b in content if str(b).strip()]
            elif isinstance(content, str):
                bullets = [b.strip() for b in content.split("\n") if b.strip()]
            else:
                bullets = []
            if not bullets:
                continue
            content_out: list[str] | str = bullets
        else:
            if isinstance(content, list):
                content_str = " ".join(str(c).strip() for c in content if str(c).strip())
            else:
                content_str = str(content).strip()
            if not content_str:
                continue
            content_out = content_str

        valid.append({"title": title.strip(), "layout": layout, "content": content_out})
    return valid


def generate_deck_via_agent(
    client, topic: str, context: str,
) -> tuple[list[dict], str | None]:
    """Agent step: force the LLM to call build_presentation with the final deck.

    Used by the Presentation Agent (/api/generate-presentation) after
    parse_document / transcribe_media / analyze_image have produced the
    aggregated `context`. Uses real OpenAI function-calling — the model's
    response is a tool_call whose arguments are the {"slides": [...]} payload,
    with each slide shaped {"title", "layout": "title"|"bullets"|"metric",
    "content": list[str] | str | number}.

    Returns (slides, error_message). On success error_message is None and
    slides is a non-empty list of validated {title, layout, content} dicts.
    On failure slides is [] and error_message describes what went wrong.
    """
    safe_topic   = _sanitize(topic)
    safe_context = _sanitize(context)

    user_message = (
        f"Presentation topic: {safe_topic}\n\n"
        f"Aggregated source material (gathered from uploaded files):\n---\n{safe_context}\n---\n\n"
        "Call build_presentation now with the complete 10-slide deck."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _DECK_SYSTEM_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            tools=[BUILD_PRESENTATION_TOOL],
            tool_choice={"type": "function", "function": {"name": "build_presentation"}},
            temperature=0.7,
            max_tokens=3000,
        )
        tool_calls = response.choices[0].message.tool_calls
        if not tool_calls:
            return [], "AI did not call build_presentation — please try again."
        slides_obj = json.loads(tool_calls[0].function.arguments)
    except json.JSONDecodeError as exc:
        print(f"[Slides] build_presentation JSON parse error: {exc}")
        return [], "AI returned malformed JSON — please try again."
    except Exception as exc:
        print(f"[Slides] build_presentation error: {exc}")
        return [], str(exc)

    valid = _validate_deck_slides(slides_obj)
    if not valid:
        return [], "AI did not produce a valid slide deck — please try again."

    return valid, None

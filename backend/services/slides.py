import json

from services.security import _sanitize

VALID_SLIDE_LAYOUTS = {"Title_Slide", "Image_Right", "Big_Metric"}

_SLIDE_SYSTEM_PROMPT = (
    "You are an automated presentation-deck generation engine used inside a "
    "professional slide-authoring tool. Your sole function is to transform "
    "source material into a structured slide outline in the style of a "
    "top-tier management consulting firm (McKinsey/BCG): crisp, data-driven, "
    "one idea per slide, with a strong narrative line from cover to close. "
    "This is a comprehensive deep-dive deck, not a short summary. "
    "Output ONLY a valid JSON object — no markdown fences, no extra keys.\n\n"
    "Required schema:\n"
    '{"slides":[{"title":"...","content":"...","layoutType":"...","imageQuery":"..."}]}\n\n'
    "Rules:\n"
    "1. Output EXACTLY 20 slide objects, in presentation order — this is a "
    "deep-dive deck, never stop early and never output fewer than 20 slides.\n"
    "2. \"layoutType\" must be exactly one of: \"Title_Slide\", \"Image_Right\", \"Big_Metric\".\n"
    "3. Slide 1 MUST use \"Title_Slide\": \"title\" is the presentation title, "
    "\"content\" is a one-line subtitle/tagline.\n"
    "4. Slide 20 (the LAST slide) MUST use \"Image_Right\" as a Strategic "
    "Summary & Conclusion: \"title\" is a full-sentence action title stating "
    "the overall strategic implication of the deck, and \"content\" is 3-5 "
    "full-sentence bullet points (separated by \"\\n\") covering the deck's "
    "key takeaways and recommended next steps. Slide 20 must be as "
    "content-rich as any body slide — NEVER a sparse closing such as "
    "'תודה' / 'Thank you' / 'שאלות?' / 'Questions?'.\n"
    "5. ACTION TITLES: For every slide EXCEPT slide 1 (the \"title\" cover), "
    "\"title\" should be a full-sentence action title that states the slide's "
    "core finding or takeaway — never a static topic label. Write "
    "'Market share grew by 15% due to aggressive regulation', not "
    "'Market Overview'.\n"
    "6. Use \"Big_Metric\" for at least 1 and at most 3 slides where the source "
    "material contains a striking number, percentage, or statistic: \"title\" is "
    "a short label/headline, \"content\" is ONLY the metric itself "
    "(e.g. \"85%\", \"x3\", \"2.4M\") — no extra words.\n"
    "7. Use \"Image_Right\" for the remaining slides: \"title\" is the slide headline, "
    "\"content\" is 3-5 short bullet points separated by \"\\n\", each bullet "
    "concise (max ~12 words).\n"
    "8. \"imageQuery\" is a short English phrase (2-5 words) describing an image "
    "that would visually support the slide — required for every slide, even "
    "Title_Slide and Big_Metric (provide a thematically relevant query).\n"
    "9. Write all titles/content in the same language as the source text "
    "(Hebrew for Hebrew source material).\n"
    "10. Base all factual content strictly on the provided source material — "
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
DECK_LAYOUTS = {
    "title", "bullets", "metric", "split-screen",
    "timeline", "barChart", "tileGrid", "bleedImage", "architecture",
    "quote_focus", "formula_heavy", "two_column",
}

# Layouts that may carry an optional "highlightBox" callout (see rule 24 and
# _validate_deck_slides) — frontend support is limited to these in SlideViewer.tsx.
HIGHLIGHT_BOX_LAYOUTS = {"bullets", "split-screen", "bleedImage", "quote_focus", "formula_heavy"}
HIGHLIGHT_BOX_TYPES = {"tip", "warning", "definition"}

# Allowed iconName values for "tileGrid" slides — must match the keys of
# TILE_ICONS in frontend/src/components/SlideViewer.tsx.
TILE_ICON_NAMES = [
    "target", "trending-up", "users", "globe", "lightbulb", "shield",
    "clock", "check-circle", "star", "book-open", "briefcase", "cpu",
    "database", "layers", "zap", "bar-chart",
]

_DECK_SYSTEM_PROMPT = (
    "You are an automated presentation-deck generation engine used inside a "
    "professional slide-authoring tool. Your sole function is to transform "
    "aggregated source material into a structured slide deck in the style of "
    "a top-tier management consulting firm (McKinsey/BCG): crisp, data-driven, "
    "one idea per slide, with a strong narrative line from cover to close.\n\n"
    "Respond ONLY by calling the build_presentation tool with the complete deck.\n\n"
    "Required schema per slide:\n"
    '{"title":"...","layout":"title"|"bullets"|"metric"|"split-screen"|'
    '"timeline"|"barChart"|"tileGrid"|"bleedImage"|"architecture"|'
    '"quote_focus"|"formula_heavy"|"two_column",'
    '"content":[...]|"..."|123,"timelineData":[...],"chartData":[...],'
    '"tiles":[...],"layers":[...],"nodes":[...],"connections":[...],'
    '"latexFormula":"...","attribution":"...","highlightBox":{...},'
    '"keyTakeaway":{...}}\n'
    "(\"timelineData\" / \"chartData\" / \"tiles\" / \"layers\"+\"nodes\"+"
    "\"connections\" are ONLY present for their matching layout — omit them "
    "for every other layout, and omit \"content\" for \"timeline\", "
    "\"barChart\", \"tileGrid\", and \"architecture\". \"latexFormula\" is "
    "ONLY for \"formula_heavy\"; \"attribution\" is ONLY for \"quote_focus\"; "
    "\"keyTakeaway\" is REQUIRED for \"two_column\" and omitted for every "
    "other layout; \"highlightBox\" is an OPTIONAL extra on top of "
    + json.dumps(sorted(HIGHLIGHT_BOX_LAYOUTS)) + " — see rule 24.)\n\n"
    "Rules:\n"
    "1. Output EXACTLY 20 slide objects, in presentation order. This is a "
    "comprehensive deep-dive deck, not a short summary — never stop early and "
    "never output fewer than 20 slides. Slide 1, slide 2, and slide 20 have "
    "fixed roles — see rule 4.\n"
    "2. \"layout\" must be exactly one of: \"title\", \"bullets\", \"metric\", "
    "\"split-screen\", \"timeline\", \"barChart\", \"tileGrid\", \"bleedImage\", "
    "\"architecture\", \"quote_focus\", \"formula_heavy\", \"two_column\".\n"
    "3. Slide 1 MUST use layout \"title\": \"title\" is the presentation title, "
    "\"content\" is a one-line subtitle/tagline string.\n"
    "4. STRUCTURAL MANDATE for slides 2 and 20 — both use layout \"bullets\" "
    "(never \"title\"):\n"
    "   - Slide 2 is the Executive Summary: \"title\" is a full-sentence "
    "action title naming the single most important overall conclusion of the "
    "whole deck, and \"content\" is an array of 5-7 full-sentence bullets, "
    "each previewing one major finding that a later body slide will expand "
    "on — write this as a synthesis of the entire deck, not a generic "
    "introduction.\n"
    "   - Slide 20 (the LAST slide) is the Strategic Summary & Conclusion: "
    "\"title\" is a full-sentence action title stating the overall strategic "
    "implication, and \"content\" is an array of 5-7 full-sentence bullets "
    "covering the deck's key strategic takeaways and recommended next steps. "
    "Slide 20 must be as content-rich as any body slide — NEVER a sparse "
    "closing such as 'תודה' / 'Thank you' / 'שאלות?' / 'Questions?'.\n"
    "5. ACTION TITLES: For every slide EXCEPT slide 1 (the \"title\" cover), "
    "\"title\" MUST be a full-sentence action title that states the slide's "
    "core takeaway or finding — never a static topic label. Write "
    "'Market share grew by 15% due to aggressive regulation', not "
    "'Market Overview'. Every such title (including slides 2 and 20) must "
    "report a conclusion drawn from the source material, not just name a "
    "subject.\n"
    "6. LAYOUT DIVERSITY: Across slides 3-19 (the body slides between the "
    "Executive Summary and the Strategic Summary & Conclusion), use a varied "
    "mix of the body layouts (\"bullets\", \"metric\", \"split-screen\", "
    "\"timeline\", \"barChart\", \"tileGrid\", \"bleedImage\", \"architecture\", "
    "\"quote_focus\", \"formula_heavy\", \"two_column\") "
    "— do not repeat the same layout more than 2-3 times in a row, and do not "
    "produce a deck that is almost entirely one layout. Use \"timeline\", "
    "\"barChart\", \"tileGrid\", \"architecture\", \"quote_focus\", "
    "\"formula_heavy\", and \"two_column\" only when the source material "
    "genuinely supports them (a chronology, multiple comparable percentages, "
    "3-6 parallel items/categories, a system/process/data architecture, a key "
    "principle or notable quote worth foregrounding, a mathematical/technical "
    "formula, or a single key term/concept worth its own definition panel, "
    "respectively) — otherwise prefer \"bullets\" or \"split-screen\". For "
    "technical subjects (physics, mathematics, computer science, engineering, "
    "statistics) where the source material contains formulas or equations, "
    "use \"formula_heavy\" for at least 1 slide.\n"
    "7. Use \"metric\" for at least 1 and at most 3 slides where the source "
    "material contains a striking number, percentage, or statistic: \"content\" "
    "is ONLY the metric itself (e.g. \"85%\", \"x3\", \"2.4M\", or a bare number) "
    "— no extra words; the action-title \"title\" carries the takeaway.\n"
    "8. Use \"bullets\" for slides presenting 4-6 distinct points: \"content\" "
    "is an array of 4-6 full-sentence bullet strings — each a complete, "
    "substantive sentence (roughly 15-30 words) that explains or analyzes the "
    "point in depth, not a short label or fragment.\n"
    "9. Use \"split-screen\" for slides that pair a list of points with a "
    "supporting visual: \"content\" is an array of 4-6 full-sentence bullet "
    "strings (roughly 12-25 words each); the visual side shows a photo (see "
    "rule 19) or, if none is available, a placeholder rendered by the slide "
    "template.\n"
    "10. Use \"bleedImage\" for slides that should foreground a single visual: "
    "\"content\" is an array of 2-3 full-sentence bullet strings (roughly "
    "12-20 words each) for the text side; the other half shows an edge-to-edge "
    "photo (see rule 19) or, if none is available, a placeholder.\n"
    "11. Use \"timeline\" for slides describing a chronology or sequence of "
    "milestones: include \"timelineData\", an ordered array of 3-6 "
    "{\"date\": short period label, \"event\": detailed description (roughly "
    "12-20 words — a full clause explaining what happened and why it "
    "matters)} objects. Do not include \"content\" for this layout.\n"
    "12. Use \"barChart\" for slides comparing multiple percentages or "
    "proportional values: include \"chartData\", an array of 2-6 "
    "{\"label\": short name, \"percentage\": number 0-100} objects. Do not "
    "include \"content\" for this layout.\n"
    "13. Use \"tileGrid\" for slides presenting 3-6 parallel items, "
    "categories, or pillars: include \"tiles\", an array of 3-6 "
    "{\"iconName\": one of " + json.dumps(TILE_ICON_NAMES) + ", \"title\": "
    "short headline (max ~6 words), \"text\": detailed description (roughly "
    "20-30 words — a full sentence of explanation)} objects. Do not include "
    "\"content\" for this layout.\n"
    "14. Use \"architecture\" for slides describing a system, pipeline, "
    "process flow, or data architecture: include \"layers\" (an ordered array "
    "of 2-5 short layer/stage names, top to bottom, e.g. [\"Presentation "
    "Layer\", \"API Layer\", \"Business Logic\", \"Data Layer\"]), \"nodes\" "
    "(an array of 2-8 {\"id\": short unique slug used only to wire up "
    "connections (e.g. \"web\", \"api\", \"db\"), \"label\": short component "
    "name (max ~4 words), \"layer\": 0-based index into \"layers\"}), and "
    "\"connections\" (an array of {\"from\": node id, \"to\": node id} edges "
    "showing data/control flow between nodes — may be empty). Do not include "
    "\"content\" for this layout.\n"
    "15. LANGUAGE: You MUST generate all slide content — titles, subtitles, "
    "bullet points, metric labels and values, tile titles/text, timeline "
    "dates/events, chart labels, architecture layer/node labels, quote "
    "content/attribution, and highlightBox title/text — "
    "entirely in Hebrew, regardless of the source material's language. If "
    "the source document is in English or any other language, translate the "
    "key points into professional, natural Hebrew with correct terminology "
    "— do not leave any slide text in English. \"iconName\" values and "
    "\"id\" values in \"architecture\" nodes/connections are identifiers, "
    "not display text, and must always stay in English exactly as "
    "specified. \"latexFormula\" is the one exception: it must remain "
    "standard LaTeX math notation (variable names, Greek letters, operators "
    "— e.g. \"E = mc^2\") and must NOT be translated or transliterated into "
    "Hebrew.\n"
    "16. Base all factual content strictly on the provided source material — "
    "do not invent statistics that aren't grounded in the text; if no real "
    "metric exists, use fewer \"metric\"/\"barChart\" slides.\n"
    "17. The user message may include an additional section of context "
    "retrieved from the user's existing course document knowledge base "
    "(a vector database covering multiple course materials, separate from "
    "the freshly uploaded files). When present, synthesize a comprehensive "
    "presentation from BOTH sources together: treat the uploaded files as "
    "the primary subject of the deck and use the vector-database context to "
    "add depth, corroborating detail, or related examples — do not ignore "
    "either source.\n"
    "18. DESIGN SYSTEM: Every slide is rendered with a light, high-contrast "
    "'Matcha Executive Light' theme — pale off-white backgrounds, "
    "near-black text, and Matcha Green (#8BAF84) used only for accents, "
    "borders, and icons. Never write slide text that describes or assumes "
    "a dark/black background (e.g. avoid phrases like 'on a dark "
    "background' or 'against a black backdrop').\n"
    "19. AI IMAGE PROMPT: For \"split-screen\" and \"bleedImage\" slides "
    "ONLY, also include \"imagePrompt\": a highly descriptive, 15-20 word "
    "image-generation prompt IN ENGLISH that visually represents the slide's "
    "subject — translate the concept into English even though the rest of "
    "the slide is in Hebrew. Focus on cinematic, professional, and academic "
    "aesthetics (e.g. for a slide about \"מגמות בשוק העבודה\" write "
    "\"a sleek modern office skyline at dusk, glowing data dashboards "
    "reflected in glass windows, cinematic professional photography, "
    "academic tone\"; for a slide about quantum computing write \"a "
    "futuristic quantum computer glowing in a dark high-tech laboratory, "
    "hyper-realistic, cinematic lighting\"). Do NOT provide URLs, only the "
    "prompt text. Omit \"imagePrompt\" entirely for every other layout.\n"
    "20. DEPTH OF ANALYSIS: This deck is a comprehensive deep dive, not a "
    "high-level overview. For every slide, extract and surface concrete "
    "technical details, definitions, named concepts, figures, and "
    "explanations drawn directly from the source material — explain the "
    "mechanism or reasoning behind each point (the 'how' and 'why'), not just "
    "the 'what'. Prefer specific, source-grounded detail over generic "
    "filler statements.\n"
    "21. STRUCTURE: Organize the body slides into a clear narrative arc that "
    "covers, wherever the source material supports it, phases such as: "
    "theoretical background / key definitions, context or methodology, "
    "detailed findings or case studies, deeper analysis of mechanisms or "
    "trade-offs, and implications or future directions. Distribute slides "
    "roughly evenly across these phases — do not front-load all the depth "
    "into the first few slides and pad the rest with filler. Each slide's "
    "action title (rule 5) must still report that slide's specific finding "
    "within its phase.\n"
    "22. Use \"quote_focus\" for a slide built around a single foundational "
    "principle, law, definition, or notable claim drawn directly from the "
    "source material: \"content\" is ONE full-sentence Hebrew string (15-30 "
    "words) presenting that insight — not a list. Optionally include "
    "\"attribution\": a short Hebrew label naming its source (a named "
    "person, law, theorem, or publication, e.g. \"החוק השני של ניוטון\"). "
    "Use this for foundational/definitional material, not for routine "
    "findings (use \"bullets\" or \"metric\" for those).\n"
    "23. Use \"formula_heavy\" for a slide centered on a mathematical, "
    "physical, statistical, or algorithmic-complexity formula that is "
    "present in or directly relevant to the source material: include "
    "\"latexFormula\", ONE LaTeX math expression WITHOUT surrounding \"$\" "
    "or \"$$\" delimiters (e.g. \"E = mc^2\" or \"\\\\frac{\\\\partial "
    "\\\\psi}{\\\\partial t} = -\\\\frac{i}{\\\\hbar}\\\\hat{H}\\\\psi\"). "
    "Optionally include \"content\" as an array of 1-3 Hebrew bullet strings "
    "explaining the formula's terms, derivation, or application. NEVER "
    "invent a formula that isn't grounded in or directly relevant to the "
    "source material — if no genuine formula fits, do not use this layout.\n"
    "24. HIGHLIGHT BOX: For slides using layout \"bullets\", \"split-screen\", "
    "\"bleedImage\", \"quote_focus\", or \"formula_heavy\", you MAY "
    "optionally add \"highlightBox\" — ONE supplementary callout for an "
    "important warning, practical tip, or formal definition drawn from the "
    "source material: {\"type\": \"tip\"|\"warning\"|\"definition\", "
    "\"title\": short Hebrew label (max ~5 words), \"text\": one Hebrew "
    "sentence (max ~20 words)}. Use sparingly — at most 2-4 slides across "
    "the whole deck, only where the source material genuinely contains a "
    "noteworthy caveat, exception, practical tip, or term worth a formal "
    "definition. Omit \"highlightBox\" entirely otherwise.\n"
    "25. Use \"two_column\" for a slide that explains ONE key term, concept, "
    "or principle from the source material alongside supporting bullets: "
    "\"content\" is an array of 3-5 full-sentence Hebrew bullet strings "
    "(roughly 12-25 words each) giving context, examples, or implications of "
    "that concept, and \"keyTakeaway\" (REQUIRED for this layout) is "
    "{\"title\": a short Hebrew label naming the concept/term (max ~6 words), "
    "\"text\": a 1-2 sentence Hebrew definition or explanation of it (max ~35 "
    "words)}, rendered as a single prominent panel beside the bullets. Do not "
    "also include \"highlightBox\" on a \"two_column\" slide — \"keyTakeaway\" "
    "already provides the slide's prominent panel. Use \"two_column\" for "
    "definitional/conceptual material, distinct from \"quote_focus\" (a single "
    "standalone sentence with no bullets) and from routine findings (use "
    "\"bullets\" for those)."
)

BUILD_PRESENTATION_TOOL = {
    "type": "function",
    "function": {
        "name": "build_presentation",
        "description": (
            "Construct the final presentation deck from the aggregated source "
            "material gathered by parse_document / transcribe_media / "
            "analyze_image. Call this once, with the complete ordered list of "
            "exactly 20 slides."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "slides": {
                    "type": "array",
                    "description": "Ordered list of exactly 20 slide objects (comprehensive deep-dive deck).",
                    "minItems": 20,
                    "maxItems": 20,
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
                                "description": "Slide layout: 'title' (cover/closing), 'bullets' (bullet list), 'metric' (single big number/stat), 'split-screen' (bullet list paired with a visual placeholder), 'timeline' (chronological milestones), 'barChart' (comparable percentages), 'tileGrid' (3-6 parallel icon+text items), 'bleedImage' (1-3 bullets paired with an edge-to-edge visual), 'architecture' (layered system/pipeline diagram), 'quote_focus' (a single foundational principle/definition/quote), 'formula_heavy' (a LaTeX formula with explanatory bullets), or 'two_column' (bullets paired with a required keyTakeaway definition panel).",
                            },
                            "content": {
                                "description": (
                                    "Slide body. For layout 'bullets', "
                                    "'split-screen', or 'bleedImage': an array of "
                                    "short bullet strings. For 'title': a one-line "
                                    "subtitle string. For 'metric': the bare metric "
                                    "as a string or number (e.g. \"85%\"). For "
                                    "'quote_focus': a single full-sentence string "
                                    "(the quote/insight). For 'formula_heavy': an "
                                    "optional array of 1-3 explanatory bullet "
                                    "strings (may be omitted). For 'two_column': "
                                    "an array of 3-5 full-sentence bullet strings "
                                    "for the left column (paired with the required "
                                    "'keyTakeaway' panel on the other side). Omit "
                                    "entirely for 'timeline', 'barChart', "
                                    "'tileGrid', and 'architecture' (use "
                                    "timelineData/chartData/tiles/layers+nodes+"
                                    "connections instead)."
                                ),
                                "anyOf": [
                                    {"type": "array", "items": {"type": "string"}},
                                    {"type": "string"},
                                    {"type": "number"},
                                ],
                            },
                            "timelineData": {
                                "type": "array",
                                "description": "Required when layout is 'timeline': ordered list of 3-6 milestones. Omit for other layouts.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "date":  {"type": "string", "description": "Short date/period label, e.g. '2021' or 'Q3 2023'."},
                                        "event": {"type": "string", "description": "Brief description of what happened (max ~10 words)."},
                                    },
                                    "required": ["date", "event"],
                                },
                            },
                            "chartData": {
                                "type": "array",
                                "description": "Required when layout is 'barChart': 2-6 comparable bars. Omit for other layouts.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label":      {"type": "string", "description": "Short label for this bar."},
                                        "percentage": {"type": "number", "description": "Value 0-100 representing the bar's relative size."},
                                    },
                                    "required": ["label", "percentage"],
                                },
                            },
                            "tiles": {
                                "type": "array",
                                "description": "Required when layout is 'tileGrid': 3-6 parallel icon+text tiles. Omit for other layouts.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "iconName": {"type": "string", "enum": TILE_ICON_NAMES, "description": "Icon identifier from the allowed set."},
                                        "title":    {"type": "string", "description": "Short tile headline (max ~6 words)."},
                                        "text":     {"type": "string", "description": "Brief supporting description (max ~15 words)."},
                                    },
                                    "required": ["iconName", "title", "text"],
                                },
                            },
                            "layers": {
                                "type": "array",
                                "description": "Required when layout is 'architecture': ordered list of 2-5 layer/stage names, top to bottom (e.g. 'Presentation Layer', 'API Layer', 'Business Logic', 'Data Layer'). Omit for other layouts.",
                                "items": {"type": "string"},
                            },
                            "nodes": {
                                "type": "array",
                                "description": "Required when layout is 'architecture': 2-8 components, each assigned to a layer. Omit for other layouts.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id":    {"type": "string", "description": "Short unique identifier in English (e.g. 'web', 'api', 'db') used by connections."},
                                        "label": {"type": "string", "description": "Short component name (max ~4 words)."},
                                        "layer": {"type": "integer", "description": "0-based index into the 'layers' array."},
                                    },
                                    "required": ["id", "label", "layer"],
                                },
                            },
                            "connections": {
                                "type": "array",
                                "description": "Required when layout is 'architecture' (may be an empty array): edges between node ids showing flow/dependency direction. Omit for other layouts.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "from": {"type": "string", "description": "Source node id."},
                                        "to":   {"type": "string", "description": "Target node id."},
                                    },
                                    "required": ["from", "to"],
                                },
                            },
                            "imagePrompt": {
                                "type": "string",
                                "description": "Only for 'split-screen' and 'bleedImage' layouts: a highly descriptive 15-20 word AI image-generation prompt in English (cinematic, professional, academic aesthetic) translated from the slide's (Hebrew) subject. Omit for all other layouts.",
                            },
                            "latexFormula": {
                                "type": "string",
                                "description": "Required when layout is 'formula_heavy': ONE formula in LaTeX math notation, without surrounding '$' or '$$' delimiters (e.g. 'E = mc^2'). Omit for all other layouts.",
                            },
                            "attribution": {
                                "type": "string",
                                "description": "Optional for layout 'quote_focus': short Hebrew label naming the source (a person, law, theorem, or publication) of the quote/insight. Omit for all other layouts.",
                            },
                            "highlightBox": {
                                "type": "object",
                                "description": "Optional supplementary callout for layouts 'bullets', 'split-screen', 'bleedImage', 'quote_focus', or 'formula_heavy' — an important warning, practical tip, or formal definition drawn from the source material. Use sparingly (2-4 slides per deck at most). Omit entirely when not needed.",
                                "properties": {
                                    "type":  {"type": "string", "enum": sorted(HIGHLIGHT_BOX_TYPES), "description": "'tip', 'warning', or 'definition'."},
                                    "title": {"type": "string", "description": "Short Hebrew label (max ~5 words)."},
                                    "text":  {"type": "string", "description": "One Hebrew sentence (max ~20 words)."},
                                },
                                "required": ["type", "title", "text"],
                            },
                            "keyTakeaway": {
                                "type": "object",
                                "description": "Required when layout is 'two_column': the prominent definition/concept panel shown beside the bullets. Omit for all other layouts.",
                                "properties": {
                                    "title": {"type": "string", "description": "Short Hebrew label naming the concept/term (max ~6 words)."},
                                    "text":  {"type": "string", "description": "1-2 sentence Hebrew definition or explanation (max ~35 words)."},
                                },
                                "required": ["title", "text"],
                            },
                        },
                        "required": ["title", "layout"],
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
    """Tool: construct a 20-slide McKinsey/BCG-style deck (JSON) from source text.

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
    user_message_parts.append("Generate the 20-slide JSON deck now.")
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
            max_tokens=8000,
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


def _extract_bullets(content) -> list[str]:
    """Normalize a slide's "content" field into a list of non-empty bullet strings.

    Accepts either a list (each item stringified+stripped) or a newline-delimited
    string; anything else yields an empty list.
    """
    if isinstance(content, list):
        return [str(b).strip() for b in content if str(b).strip()]
    if isinstance(content, str):
        return [b.strip() for b in content.split("\n") if b.strip()]
    return []


def _validate_deck_slides(slides_obj: dict) -> list[dict]:
    """Filter+normalize a raw {"slides": [...]} dict into validated deck slides.

    Each returned slide is {"title": str, "layout": ..., ...}. The shape of the
    remaining keys depends on "layout":
    - "bullets" / "split-screen" / "bleedImage": "content" is a non-empty
      list[str]. "split-screen" / "bleedImage" may additionally carry an
      optional "imagePrompt" str (rule 19) — a 15-20 word English AI
      image-generation prompt, rendered client-side via Pollinations.ai.
    - "title" / "metric": "content" is a non-empty str (joining array content
      with spaces if the model returned one).
    - "timeline": "timelineData" is a non-empty list[{"date": str, "event": str}].
    - "barChart": "chartData" is a non-empty list[{"label": str, "percentage": float}].
    - "tileGrid": "tiles" is a non-empty list[{"iconName": str, "title": str, "text": str}].
    - "architecture": "layers" is a non-empty list[str]; "nodes" is a non-empty
      list[{"id": str, "label": str, "layer": int}] (unique ids, valid layer
      index); "connections" is a list[{"from": str, "to": str}] referencing
      known node ids (may be empty).
    - "quote_focus": "content" is a non-empty str (the quote/insight; joining
      array content with spaces if the model returned one); optional
      "attribution" str.
    - "formula_heavy": "latexFormula" is a non-empty str (LaTeX, no $/$$
      delimiters); optional "content" is a list[str] (1-3 explanatory bullets).
    - "two_column": "content" is a non-empty list[str] (3-5 bullets) and
      "keyTakeaway" is a required {"title": str, "text": str} panel.
    Additionally, slides whose "layout" is in HIGHLIGHT_BOX_LAYOUTS may carry an
    optional "highlightBox": {"type": "tip"|"warning"|"definition", "title":
    str, "text": str} — dropped (not the whole slide) if malformed.
    Slides whose required data is missing/invalid for their layout are dropped.
    """
    valid: list[dict] = []
    for s in slides_obj.get("slides", []):
        title   = s.get("title")
        layout  = s.get("layout")
        content = s.get("content")
        if not (isinstance(title, str) and title.strip() and layout in DECK_LAYOUTS):
            continue

        slide_out: dict = {"title": title.strip(), "layout": layout}

        if layout in ("bullets", "split-screen", "bleedImage"):
            bullets = _extract_bullets(content)
            if not bullets:
                continue
            slide_out["content"] = bullets

            if layout in ("split-screen", "bleedImage"):
                image_prompt = str(s.get("imagePrompt", "")).strip()
                if image_prompt:
                    slide_out["imagePrompt"] = image_prompt

        elif layout == "quote_focus":
            if isinstance(content, list):
                content_str = " ".join(str(c).strip() for c in content if str(c).strip())
            else:
                content_str = str(content).strip()
            if not content_str:
                continue
            slide_out["content"] = content_str

            attribution = str(s.get("attribution", "")).strip()
            if attribution:
                slide_out["attribution"] = attribution

        elif layout == "formula_heavy":
            latex_formula = str(s.get("latexFormula", "")).strip()
            if not latex_formula:
                continue
            slide_out["latexFormula"] = latex_formula

            bullets = _extract_bullets(content)
            if bullets:
                slide_out["content"] = bullets

        elif layout == "two_column":
            bullets = _extract_bullets(content)
            if not bullets:
                continue
            slide_out["content"] = bullets

            key_takeaway = s.get("keyTakeaway")
            kt_title = str(key_takeaway.get("title", "")).strip() if isinstance(key_takeaway, dict) else ""
            kt_text  = str(key_takeaway.get("text", "")).strip() if isinstance(key_takeaway, dict) else ""
            if not (kt_title and kt_text):
                continue
            slide_out["keyTakeaway"] = {"title": kt_title, "text": kt_text}

        elif layout == "timeline":
            items = []
            if isinstance(s.get("timelineData"), list):
                for item in s["timelineData"]:
                    if isinstance(item, dict):
                        date  = str(item.get("date", "")).strip()
                        event = str(item.get("event", "")).strip()
                        if date and event:
                            items.append({"date": date, "event": event})
            if not items:
                continue
            slide_out["timelineData"] = items

        elif layout == "barChart":
            items = []
            if isinstance(s.get("chartData"), list):
                for item in s["chartData"]:
                    if isinstance(item, dict):
                        label = str(item.get("label", "")).strip()
                        try:
                            pct = float(item.get("percentage"))
                        except (TypeError, ValueError):
                            continue
                        if label:
                            items.append({"label": label, "percentage": max(0.0, min(100.0, pct))})
            if not items:
                continue
            slide_out["chartData"] = items

        elif layout == "tileGrid":
            tiles = []
            if isinstance(s.get("tiles"), list):
                for item in s["tiles"]:
                    if isinstance(item, dict):
                        icon_name = str(item.get("iconName", "")).strip()
                        t_title   = str(item.get("title", "")).strip()
                        t_text    = str(item.get("text", "")).strip()
                        if t_title:
                            tiles.append({
                                "iconName": icon_name if icon_name in TILE_ICON_NAMES else "lightbulb",
                                "title": t_title,
                                "text": t_text,
                            })
            if not tiles:
                continue
            slide_out["tiles"] = tiles

        elif layout == "architecture":
            layers_in = s.get("layers")
            layers = (
                [str(x).strip() for x in layers_in if str(x).strip()][:6]
                if isinstance(layers_in, list) else []
            )
            if not layers:
                continue

            nodes = []
            seen_ids: set[str] = set()
            if isinstance(s.get("nodes"), list):
                for item in s["nodes"][:12]:
                    if not isinstance(item, dict):
                        continue
                    node_id = str(item.get("id", "")).strip()
                    label   = str(item.get("label", "")).strip()
                    try:
                        layer_idx = int(item.get("layer"))
                    except (TypeError, ValueError):
                        continue
                    if not node_id or not label or node_id in seen_ids:
                        continue
                    if not (0 <= layer_idx < len(layers)):
                        continue
                    seen_ids.add(node_id)
                    nodes.append({"id": node_id, "label": label, "layer": layer_idx})
            if not nodes:
                continue

            connections = []
            if isinstance(s.get("connections"), list):
                for item in s["connections"]:
                    if isinstance(item, dict):
                        src = str(item.get("from", "")).strip()
                        dst = str(item.get("to", "")).strip()
                        if src in seen_ids and dst in seen_ids and src != dst:
                            connections.append({"from": src, "to": dst})

            slide_out["layers"] = layers
            slide_out["nodes"] = nodes
            slide_out["connections"] = connections

        else:  # "title", "metric"
            if isinstance(content, list):
                content_str = " ".join(str(c).strip() for c in content if str(c).strip())
            else:
                content_str = str(content).strip()
            if not content_str:
                continue
            slide_out["content"] = content_str

        highlight_box = s.get("highlightBox")
        if layout in HIGHLIGHT_BOX_LAYOUTS and isinstance(highlight_box, dict):
            hb_type  = str(highlight_box.get("type", "")).strip()
            hb_title = str(highlight_box.get("title", "")).strip()
            hb_text  = str(highlight_box.get("text", "")).strip()
            if hb_type in HIGHLIGHT_BOX_TYPES and hb_title and hb_text:
                slide_out["highlightBox"] = {"type": hb_type, "title": hb_title, "text": hb_text}

        valid.append(slide_out)
    return valid


def generate_deck_via_agent(
    client, topic: str, context: str, rag_context: str = "",
) -> tuple[list[dict], str | None]:
    """Agent step: force the LLM to call build_presentation with the final deck.

    Used by the Presentation Agent (/api/generate-presentation) after
    parse_document / transcribe_media / analyze_image have produced the
    aggregated `context`. Uses real OpenAI function-calling — the model's
    response is a tool_call whose arguments are the {"slides": [...]} payload,
    with each slide shaped {"title", "layout": "title"|"bullets"|"metric"|
    "split-screen"|"timeline"|"barChart"|"tileGrid"|"bleedImage", "content":
    list[str] | str | number, "timelineData"/"chartData"/"tiles": list[dict]}
    (the last three keys are layout-specific — see _validate_deck_slides).
    "split-screen"/"bleedImage" slides may additionally carry an optional
    "imagePrompt": a 15-20 word English AI-image-generation prompt (rule 19) —
    the frontend (SlideViewer.tsx) renders this via a Pollinations.ai image
    URL built directly from the prompt; absent when the model didn't provide
    one.

    `rag_context` is optional aggregated text retrieved via hybrid_search from
    the user's existing FAISS knowledge base (across all of their course
    materials, not just the freshly uploaded files) — see rule 17 of
    _DECK_SYSTEM_PROMPT. Pass "" when no such context is available.

    Returns (slides, error_message). On success error_message is None and
    slides is a non-empty list of validated slide dicts (see
    _validate_deck_slides for the per-layout shape). On failure slides is []
    and error_message describes what went wrong.
    """
    safe_topic   = _sanitize(topic)
    safe_context = _sanitize(context)

    user_message_parts = [
        f"Presentation topic: {safe_topic}",
        f"Aggregated source material (gathered from uploaded files):\n---\n{safe_context}\n---",
    ]
    if rag_context.strip():
        safe_rag_context = _sanitize(rag_context)
        user_message_parts.append(
            "Additional context retrieved from the user's existing course "
            f"document knowledge base (vector database):\n---\n{safe_rag_context}\n---"
        )
    user_message_parts.append("Call build_presentation now with the complete deck (exactly 20 slides).")
    user_message = "\n\n".join(user_message_parts)

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
            max_tokens=10000,
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

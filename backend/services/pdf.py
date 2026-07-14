def extract_pptx_text(pptx_bytes: bytes) -> tuple[str, int]:
    from io import BytesIO
    from pptx import Presentation
    prs = Presentation(BytesIO(pptx_bytes))
    parts = []
    for i, slide in enumerate(prs.slides, 1):
        lines = []
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                t = " ".join(run.text for run in para.runs).strip()
                if t:
                    lines.append(t)
        if lines:
            parts.append(f"[שקופית {i}]\n" + "\n".join(lines))
    return "\n\n".join(parts), len(prs.slides)


def extract_pptx_slides(pptx_bytes: bytes) -> tuple[list[dict], int]:
    """Return (slides_with_text, total_slide_count). Each entry: {text, page_number}."""
    from io import BytesIO
    from pptx import Presentation
    prs    = Presentation(BytesIO(pptx_bytes))
    total  = len(prs.slides)
    slides = []
    for i, slide in enumerate(prs.slides, 1):
        lines = []
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                t = " ".join(run.text for run in para.runs).strip()
                if t:
                    lines.append(t)
        if lines:
            slides.append({"text": f"[שקופית {i}]\n" + "\n".join(lines), "page_number": i})
    return slides, total


def extract_docx_text(docx_bytes: bytes) -> tuple[list[dict], int]:
    """Return (pages_with_text, total_pages) for a modern OOXML .docx file.

    python-docx exposes no rendered-page boundaries, so the whole document is
    treated as a single logical page — the same convention used for OCR'd
    image text elsewhere in the upload pipeline. Paragraph and table-cell text
    are both included so tabular content isn't silently dropped.
    """
    from io import BytesIO
    from docx import Document
    doc   = Document(BytesIO(docx_bytes))
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                t = cell.text.strip()
                if t:
                    lines.append(t)
    text = "\n".join(lines)
    if not text:
        return [], 1
    return [{"text": text, "page_number": 1}], 1

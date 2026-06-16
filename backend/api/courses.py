import hashlib
import json
from datetime import datetime, timezone

import fitz
from flask import Blueprint, jsonify, request

from api.middleware import token_required
from extensions import client, embeddings_model, text_splitter
from models import CustomCourse, SessionLocal, UserDocument

courses_bp = Blueprint("courses", __name__)

_EXTRACTION_SYSTEM = (
    "You are an expert academic data extractor. "
    "Analyze the following university syllabus text and return ONLY a valid JSON object with exactly these fields:\n"
    '{\n'
    '  "course_name": "<official course title as written in the syllabus>",\n'
    '  "lecturer_name": "<full name of the professor/lecturer, or empty string if not found>",\n'
    '  "has_tirgul": <true or false — whether the course has recitation/tirgul sections>,\n'
    '  "ta_name": "<name of the TA/recitation instructor, or null if not found>",\n'
    '  "semester": "<a, b, or summer — which semester; default a if unclear>"\n'
    '}\n'
    "Return ONLY the JSON object, no extra text."
)


@courses_bp.route("/api/courses/parse-syllabus", methods=["POST"])
@token_required
def parse_syllabus(user_id: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "no file provided"}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "only PDF files are supported"}), 400

    raw_bytes = file.read()

    # ── Extract raw text ──────────────────────────────────────────────────────
    try:
        full_text = ""
        with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
            for page in doc:
                full_text += page.get_text("text") + "\n"
    except Exception as exc:
        return jsonify({"error": f"PDF parsing failed: {exc}"}), 400

    if not full_text.strip():
        return jsonify({"error": "No extractable text found — may be a scanned/image-only PDF"}), 400

    # ── LLM metadata extraction (first 6 000 chars is enough for metadata) ────
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _EXTRACTION_SYSTEM},
                {"role": "user",   "content": f"SYLLABUS TEXT:\n\n{full_text[:6000]}"},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        meta = json.loads(resp.choices[0].message.content)
    except Exception as exc:
        return jsonify({"error": f"LLM extraction failed: {exc}"}), 500

    return jsonify({
        "course_name":        (meta.get("course_name")   or "").strip(),
        "lecturer_name":      (meta.get("lecturer_name") or "").strip(),
        "has_tirgul":         bool(meta.get("has_tirgul", False)),
        "ta_name":            (meta.get("ta_name")       or ""),
        "semester":           (meta.get("semester")      or "a").strip(),
        "full_syllabus_text": full_text,
    }), 200


@courses_bp.route("/api/courses", methods=["POST"])
@token_required
def save_course(user_id: int):
    data = request.get_json(silent=True) or {}

    course_name        = (data.get("course_name")        or "").strip()
    lecturer_name      = (data.get("lecturer_name")      or "").strip() or None
    has_tirgul         = bool(data.get("has_tirgul",     False))
    ta_name            = (data.get("ta_name")            or "").strip() or None
    semester           = (data.get("semester")           or "a").strip()
    color              = (data.get("color")              or "").strip() or None
    full_syllabus_text = (data.get("full_syllabus_text") or "").strip()

    if not course_name:
        return jsonify({"error": "course_name is required"}), 400

    # ── Index syllabus to ChromaDB (best-effort) ──────────────────────────────
    syllabus_file_id = None
    if full_syllabus_text:
        safe_name        = course_name[:40].replace("/", "_")
        syllabus_filename = f"syllabus_{safe_name}.txt"
        syllabus_file_id  = hashlib.md5(
            f"syllabus_{user_id}_{course_name}".encode()
        ).hexdigest()[:16]
        upload_date = datetime.now(timezone.utc).isoformat()

        try:
            from services.rag import get_user_collection, rebuild_user_bm25

            col    = get_user_collection(user_id)
            chunks = text_splitter.split_text(full_syllabus_text)
            metas  = [
                {
                    "source":      syllabus_filename,
                    "file_name":   syllabus_filename,
                    "file_id":     syllabus_file_id,
                    "page_number": 1,
                    "total_pages": 1,
                    "upload_date": upload_date,
                    "chunk_index": i,
                    "user_id":     user_id,
                    "file_type":   "syllabus",
                    "course_name": course_name,
                }
                for i in range(len(chunks))
            ]
            ids     = [f"{syllabus_filename}_chunk_{i}" for i in range(len(chunks))]
            vectors = embeddings_model.embed_documents(chunks)
            col.upsert(ids=ids, embeddings=vectors, documents=chunks, metadatas=metas)
            rebuild_user_bm25(user_id)

            # Register ownership in UserDocument so mastery/RAG routes find it
            _reg_db = SessionLocal()
            try:
                _exists = _reg_db.query(UserDocument).filter(
                    UserDocument.user_id == user_id,
                    UserDocument.file_id == syllabus_file_id,
                ).first()
                if not _exists:
                    _reg_db.add(UserDocument(
                        user_id         = user_id,
                        file_id         = syllabus_file_id,
                        filename        = syllabus_filename,
                        file_size_bytes = len(full_syllabus_text.encode("utf-8")),
                        course_name     = course_name,
                    ))
                    _reg_db.commit()
            except Exception as reg_exc:
                print(f"[courses] WARNING: ownership registration failed: {reg_exc}")
                _reg_db.rollback()
            finally:
                _reg_db.close()

            print(f"[courses] u{user_id}: indexed {len(chunks)} chunks for {course_name!r}")

        except Exception as idx_exc:
            print(f"[courses] WARNING: syllabus indexing failed: {idx_exc}")
            syllabus_file_id = None  # don't store a broken reference

    # ── Persist course record ─────────────────────────────────────────────────
    db = SessionLocal()
    try:
        course = CustomCourse(
            user_id            = user_id,
            course_name        = course_name,
            lecturer_name      = lecturer_name,
            has_tirgul         = has_tirgul,
            ta_name            = ta_name,
            semester           = semester,
            color              = color,
            full_syllabus_text = full_syllabus_text or None,
            syllabus_file_id   = syllabus_file_id,
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        return jsonify({"id": course.id, "syllabus_file_id": syllabus_file_id}), 201
    except Exception as exc:
        db.rollback()
        print(f"[courses] ERROR: save_course failed: {exc}")
        return jsonify({"error": f"save failed: {exc}"}), 500
    finally:
        db.close()


@courses_bp.route("/api/courses/details", methods=["GET"])
@token_required
def get_course_details(user_id: int):
    """Fetch a single course's full metadata by name."""
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    db = SessionLocal()
    try:
        course = db.query(CustomCourse).filter(
            CustomCourse.user_id     == user_id,
            CustomCourse.course_name == name,
        ).first()
        if not course:
            return jsonify({"error": "course not found"}), 404
        return jsonify({
            "course_name":   course.course_name,
            "lecturer_name": course.lecturer_name or "",
            "has_tirgul":    course.has_tirgul,
            "ta_name":       course.ta_name or "",
            "semester":      course.semester or "a",
            "color":         course.color or "",
        }), 200
    finally:
        db.close()


@courses_bp.route("/api/courses/update", methods=["PATCH"])
@token_required
def update_course(user_id: int):
    """Update an existing course's metadata by its current course_name."""
    data        = request.get_json(silent=True) or {}
    course_name = (data.get("course_name") or "").strip()
    if not course_name:
        return jsonify({"error": "course_name is required"}), 400

    db = SessionLocal()
    try:
        course = db.query(CustomCourse).filter(
            CustomCourse.user_id     == user_id,
            CustomCourse.course_name == course_name,
        ).first()
        if not course:
            return jsonify({"error": "course not found"}), 404

        new_name = (data.get("new_course_name") or "").strip()
        if new_name and new_name != course_name:
            course.course_name = new_name
        if "lecturer_name" in data:
            course.lecturer_name = (data["lecturer_name"] or "").strip() or None
        if "has_tirgul" in data:
            course.has_tirgul = bool(data["has_tirgul"])
        if "ta_name" in data:
            course.ta_name = (data["ta_name"] or "").strip() or None
        if "semester" in data:
            course.semester = (data["semester"] or "a").strip()
        if "color" in data:
            course.color = (data["color"] or "").strip() or None

        # If a new syllabus text was supplied, re-index it (best-effort)
        new_syllabus = (data.get("full_syllabus_text") or "").strip()
        if new_syllabus and new_syllabus != (course.full_syllabus_text or ""):
            db.commit()  # flush metadata changes first
            return _reindex_syllabus_for_course(user_id, course.course_name, new_syllabus)

        db.commit()
        print(f"[courses] u{user_id}: updated course {course_name!r} → {course.course_name!r}")
        return jsonify({"success": True, "course_name": course.course_name}), 200

    except Exception as exc:
        db.rollback()
        print(f"[courses] ERROR: update_course failed: {exc}")
        return jsonify({"error": f"update failed: {exc}"}), 500
    finally:
        db.close()


_SEMESTER_HE = {"a": "סמסטר א׳", "b": "סמסטר ב׳", "summer": "סמסטר קיץ"}


@courses_bp.route("/api/courses/update-syllabus", methods=["POST"])
@token_required
def update_course_syllabus(user_id: int):
    """Re-parse syllabus, extract metadata via LLM, diff against current fields,
    update the DB, re-index ChromaDB, and return a Hebrew change log."""
    file        = request.files.get("file")
    course_name = (request.form.get("course_name") or "").strip()

    if not file or not file.filename:
        return jsonify({"error": "no file provided"}), 400
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "only PDF files are supported"}), 400
    if not course_name:
        return jsonify({"error": "course_name is required"}), 400

    # ── 1. Parse PDF text ──────────────────────────────────────────────────────
    raw_bytes = file.read()
    try:
        full_text = ""
        with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
            for page in doc:
                full_text += page.get_text("text") + "\n"
    except Exception as exc:
        return jsonify({"error": f"PDF parsing failed: {exc}"}), 400

    if not full_text.strip():
        return jsonify({"error": "No extractable text — may be a scanned PDF"}), 400

    # ── 2. LLM metadata extraction (best-effort) ──────────────────────────────
    meta: dict = {}
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _EXTRACTION_SYSTEM},
                {"role": "user",   "content": f"SYLLABUS TEXT:\n\n{full_text[:6000]}"},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        meta = json.loads(resp.choices[0].message.content)
    except Exception as exc:
        print(f"[courses] WARNING: LLM extraction failed during syllabus update: {exc}")

    # ── 3. Fetch current record + compute diff ────────────────────────────────
    def _s(v: object) -> str:
        return (v or "").strip() if isinstance(v, str) else ""

    db = SessionLocal()
    try:
        course = db.query(CustomCourse).filter(
            CustomCourse.user_id     == user_id,
            CustomCourse.course_name == course_name,
        ).first()
        if not course:
            return jsonify({"error": "course not found"}), 404

        # Current values
        cur_lect  = _s(course.lecturer_name)
        cur_trgul = bool(course.has_tirgul)
        cur_ta    = _s(course.ta_name)
        cur_sem   = _s(course.semester) or "a"

        # New values — fall back to current if LLM failed
        new_lect  = _s(meta.get("lecturer_name"))  if meta else cur_lect
        new_trgul = bool(meta.get("has_tirgul", cur_trgul)) if meta else cur_trgul
        new_ta    = _s(meta.get("ta_name"))         if meta else cur_ta
        new_sem   = (_s(meta.get("semester")) or "a") if meta else cur_sem

        changes: list[str] = []

        if meta:
            # Lecturer diff
            if cur_lect != new_lect:
                if not cur_lect:
                    changes.append(f'נוסף שם מרצה: {new_lect}')
                elif not new_lect:
                    changes.append(f'שם המרצה הוסר (היה: {cur_lect})')
                else:
                    changes.append(f'שם המרצה עודכן מ-"{cur_lect}" ל-"{new_lect}"')

            # Tirgul + TA diff
            if not cur_trgul and new_trgul:
                msg = 'נוסף תגבור לקורס'
                if new_ta:
                    msg += f' — מתרגל: {new_ta}'
                changes.append(msg)
            elif cur_trgul and not new_trgul:
                changes.append('התגבור הוסר מהקורס')
            elif cur_trgul and new_trgul and cur_ta != new_ta:
                if not cur_ta:
                    changes.append(f'נוסף שם מתרגל: {new_ta}')
                elif not new_ta:
                    changes.append(f'שם המתרגל הוסר (היה: {cur_ta})')
                else:
                    changes.append(f'שם המתרגל עודכן מ-"{cur_ta}" ל-"{new_ta}"')

            # Semester diff
            if cur_sem != new_sem:
                changes.append(
                    f'הסמסטר עודכן מ-{_SEMESTER_HE.get(cur_sem, cur_sem)}'
                    f' ל-{_SEMESTER_HE.get(new_sem, new_sem)}'
                )

        # ── 4. Apply field updates ─────────────────────────────────────────────
        course.lecturer_name = new_lect or None
        course.has_tirgul    = new_trgul
        course.ta_name       = new_ta or None
        course.semester      = new_sem
        db.commit()

    except Exception as exc:
        db.rollback()
        print(f"[courses] ERROR: update_course_syllabus field update: {exc}")
        return jsonify({"error": f"field update failed: {exc}"}), 500
    finally:
        db.close()

    # ── 5. Re-index syllabus text in ChromaDB ─────────────────────────────────
    reindex = _reindex_syllabus_for_course(user_id, course_name, full_text)
    if reindex[1] not in (200, 201):
        return reindex  # propagate indexing error

    return jsonify({"success": True, "changes": changes}), 200


def _reindex_syllabus_for_course(user_id: int, course_name: str, full_text: str):
    """Shared logic: re-index syllabus text for an existing CustomCourse."""
    safe_name   = course_name[:40].replace("/", "_")
    fname       = f"syllabus_{safe_name}.txt"
    file_id     = hashlib.md5(f"syllabus_{user_id}_{course_name}".encode()).hexdigest()[:16]
    upload_date = datetime.now(timezone.utc).isoformat()
    chunks_indexed = 0

    # Re-index ChromaDB (best-effort — don't let this block the DB update)
    try:
        from services.rag import get_user_collection, rebuild_user_bm25
        col = get_user_collection(user_id)
        col.delete(where={"file_id": {"$eq": file_id}})
        chunks  = text_splitter.split_text(full_text)
        metas   = [{"source": fname, "file_name": fname, "file_id": file_id,
                    "page_number": 1, "total_pages": 1, "upload_date": upload_date,
                    "chunk_index": i, "user_id": user_id, "file_type": "syllabus",
                    "course_name": course_name}
                   for i in range(len(chunks))]
        ids     = [f"{fname}_chunk_{i}" for i in range(len(chunks))]
        vectors = embeddings_model.embed_documents(chunks)
        col.upsert(ids=ids, embeddings=vectors, documents=chunks, metadatas=metas)
        rebuild_user_bm25(user_id)
        chunks_indexed = len(chunks)
        print(f"[courses] u{user_id}: re-indexed {chunks_indexed} chunks for {course_name!r}")
    except Exception as exc:
        print(f"[courses] WARNING: syllabus re-indexing failed: {exc}")

    db = SessionLocal()
    try:
        course = db.query(CustomCourse).filter(
            CustomCourse.user_id     == user_id,
            CustomCourse.course_name == course_name,
        ).first()
        if not course:
            return jsonify({"error": "course not found"}), 404

        # Upsert UserDocument ownership record
        doc_rec = db.query(UserDocument).filter(
            UserDocument.user_id == user_id,
            UserDocument.file_id == file_id,
        ).first()
        sz = len(full_text.encode("utf-8"))
        if doc_rec:
            doc_rec.file_size_bytes = sz
            doc_rec.course_name     = course_name
            doc_rec.is_syllabus     = True
        else:
            db.add(UserDocument(user_id=user_id, file_id=file_id,
                                filename=fname, file_size_bytes=sz,
                                course_name=course_name, is_syllabus=True))

        course.full_syllabus_text = full_text
        course.syllabus_file_id   = file_id
        db.commit()
        return jsonify({"success": True, "chunks_indexed": chunks_indexed}), 200
    except Exception as exc:
        db.rollback()
        print(f"[courses] ERROR: _reindex_syllabus_for_course: {exc}")
        return jsonify({"error": f"update failed: {exc}"}), 500
    finally:
        db.close()


def _perform_delete(user_id: int, course_name: str):
    """Shared deletion logic — purges ChromaDB, UserDocument, and CustomCourse rows."""
    db = SessionLocal()
    try:
        course = db.query(CustomCourse).filter(
            CustomCourse.user_id     == user_id,
            CustomCourse.course_name == course_name,
        ).first()

        if not course:
            # Course was never persisted to the backend (created before this feature
            # existed).  Return success so the frontend can still clean up local state.
            return jsonify({"success": True, "message": "Course deleted successfully"}), 200

        syllabus_file_id = course.syllabus_file_id

        # ── Purge ChromaDB chunks + UserDocument ownership record ─────────────
        if syllabus_file_id:
            try:
                from services.rag import get_user_collection, rebuild_user_bm25
                col     = get_user_collection(user_id)
                results = col.get(where={"file_id": {"$eq": syllabus_file_id}})
                if results and results.get("ids"):
                    col.delete(where={"file_id": {"$eq": syllabus_file_id}})
                    rebuild_user_bm25(user_id)
                    print(f"[courses] u{user_id}: purged {len(results['ids'])} chunks "
                          f"for {course_name!r}")
            except Exception as exc:
                print(f"[courses] WARNING: ChromaDB cleanup failed: {exc}")

            db.query(UserDocument).filter(
                UserDocument.user_id == user_id,
                UserDocument.file_id == syllabus_file_id,
            ).delete()

        db.delete(course)
        db.commit()
        print(f"[courses] u{user_id}: deleted course {course_name!r}")
        return jsonify({"success": True, "message": "Course deleted successfully"}), 200

    except Exception as exc:
        db.rollback()
        print(f"[courses] ERROR: _perform_delete failed: {exc}")
        return jsonify({"error": f"deletion failed: {exc}"}), 500
    finally:
        db.close()


# POST /api/courses/delete — primary deletion route used by the frontend.
# A dedicated POST endpoint avoids HTTP DELETE preflight complexity and loads
# without ambiguity in Flask's URL map alongside the existing POST /api/courses.
@courses_bp.route("/api/courses/delete", methods=["POST"])
@token_required
def delete_course_post(user_id: int):
    data        = request.get_json(silent=True) or {}
    course_name = (data.get("course_name") or "").strip()
    if not course_name:
        return jsonify({"error": "course_name is required"}), 400
    return _perform_delete(user_id, course_name)


# DELETE /api/courses — kept for REST-semantic completeness.
@courses_bp.route("/api/courses", methods=["DELETE"])
@token_required
def delete_course(user_id: int):
    data        = request.get_json(silent=True) or {}
    course_name = (data.get("course_name") or "").strip()
    if not course_name:
        return jsonify({"error": "course_name is required"}), 400
    return _perform_delete(user_id, course_name)

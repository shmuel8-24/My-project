import re

import numpy as np
from rank_bm25 import BM25Okapi

from extensions import RRF_K, TOP_K, _bm25_map, _images_map, embeddings_model
from models import SessionLocal, UserDocument
from services.faiss_store import FaissCollection, get_user_store


def get_user_collection(user_id: int) -> FaissCollection:
    """Return the FaissCollection for a user (drop-in replacement for ChromaDB get_or_create)."""
    return get_user_store(user_id)


def get_user_images(user_id: int) -> dict:
    return _images_map.setdefault(user_id, {})


# Chunks whose source starts with "syllabus_" are always course syllabi
# (named by _reindex_syllabus_for_course as f"syllabus_{safe_name}.txt").
# This pattern-based guard catches old chunks that pre-date the file_type
# metadata field, so exclude_syllabus=True works even on untagged legacy data.
_SYLLABUS_SOURCE_PREFIX = "syllabus_"


def tokenize_hebrew(text: str) -> list[str]:
    text = re.sub(r"[֑-ׇ]", "", text)
    return [t for t in re.findall(r"\w+", text.lower(), re.UNICODE) if len(t) > 1]


def rebuild_user_bm25(user_id: int) -> None:
    col   = get_user_collection(user_id)
    total = col.count()
    if total == 0:
        _bm25_map[user_id] = {"index": None, "ids": [], "chunks": [], "metadatas": []}
        print(f"[BM25] u{user_id}: index cleared")
        return
    result    = col.get(include=["documents", "metadatas"])
    ids       = result["ids"]
    chunks    = result["documents"]
    metadatas = result["metadatas"]
    tokenized = [tokenize_hebrew(c) for c in chunks]
    _bm25_map[user_id] = {
        "index":     BM25Okapi(tokenized),
        "ids":       ids,
        "chunks":    chunks,
        "metadatas": metadatas,
    }
    doc_names = {m.get("source", "?") for m in metadatas}
    print(f"[BM25] u{user_id}: {total} chunks across {len(doc_names)} doc(s)")


def get_user_bm25(user_id: int) -> dict:
    if user_id not in _bm25_map:
        col = get_user_collection(user_id)
        if col.count() > 0:
            rebuild_user_bm25(user_id)
    return _bm25_map.get(
        user_id,
        {"index": None, "ids": [], "chunks": [], "metadatas": []},
    )


def rrf_merge(semantic_ids: list[str], bm25_ids: list[str]) -> list[str]:
    scores: dict[str, float] = {}
    for rank, id_ in enumerate(semantic_ids):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    for rank, id_ in enumerate(bm25_ids):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def hybrid_search(
    user_id: int,
    query_text: str,
    n_results: int,
    *,
    file_id: str | None = None,        # backward-compat single-file filter
    file_ids: list[str] | None = None, # multi-file filter (preferred)
    course_name: str | None = None,    # restrict to chunks tagged with this course
    exclude_syllabus: bool = True,     # never surface syllabus chunks as RAG context
) -> tuple[list[str], list[dict]]:
    col       = get_user_collection(user_id)
    bm25_st   = get_user_bm25(user_id)
    doc_count = col.count()
    if doc_count == 0:
        return [], []

    # Normalize: merge single-file (legacy) and multi-file params into one list.
    # Empty list → no file filter (search whole user collection).
    _file_ids: list[str] = [f for f in (file_ids or []) if f]
    if not _file_ids and file_id:
        _file_ids = [file_id]

    n_fetch      = min(n_results * 2, doc_count)
    query_vector = embeddings_model.embed_query(query_text)

    _uid_filter = {"user_id": {"$eq": user_id}}
    # Syllabus chunks carry file_type="syllabus"; regular document chunks have no
    # file_type field (meta.get returns None, which passes the $nin check correctly).
    _syllabus_filter: dict | None = (
        {"file_type": {"$nin": ["syllabus"]}} if exclude_syllabus else None
    )
    try:
        _filters: list[dict] = [_uid_filter]
        if len(_file_ids) == 1:
            _filters.append({"file_id": {"$eq": _file_ids[0]}})
        elif len(_file_ids) > 1:
            _filters.append({"file_id": {"$in": _file_ids}})
        if course_name:
            _filters.append({"course_name": {"$eq": course_name}})
        if _syllabus_filter:
            _filters.append(_syllabus_filter)
        where_filter: dict = _filters[0] if len(_filters) == 1 else {"$and": _filters}
        sem_result = col.query(
            query_embeddings=[query_vector],
            n_results=n_fetch,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        try:
            _fallback_filters: list[dict] = [_uid_filter]
            if course_name:
                _fallback_filters.append({"course_name": {"$eq": course_name}})
            if _syllabus_filter:
                _fallback_filters.append(_syllabus_filter)
            _fallback_filter = (
                {"$and": _fallback_filters} if len(_fallback_filters) > 1
                else _fallback_filters[0]
            )
            sem_result = col.query(
                query_embeddings=[query_vector],
                n_results=n_fetch,
                where=_fallback_filter,
                include=["documents", "metadatas", "distances"],
            )
        except Exception:
            sem_result = col.query(
                query_embeddings=[query_vector],
                n_results=n_fetch,
                include=["documents", "metadatas", "distances"],
            )
    sem_ids    = sem_result["ids"][0]
    sem_chunks = sem_result["documents"][0]
    sem_metas  = sem_result["metadatas"][0]

    bm25_ids: list[str] = []
    if bm25_st["index"] is not None:
        tokens = tokenize_hebrew(query_text)
        if tokens:
            scores      = bm25_st["index"].get_scores(tokens)
            top_indices = np.argsort(scores)[::-1][:n_fetch]
            bm25_ids    = [
                bm25_st["ids"][i] for i in top_indices
                if scores[i] > 0.0 and (
                    not _file_ids
                    or bm25_st["metadatas"][i].get("file_id") in _file_ids
                ) and (
                    not course_name
                    or bm25_st["metadatas"][i].get("course_name") == course_name
                ) and (
                    not exclude_syllabus
                    or bm25_st["metadatas"][i].get("file_type") != "syllabus"
                )
            ]

    print(f"▶ HYBRID u{user_id}: {len(sem_ids)} semantic | {len(bm25_ids)} bm25"
          + (f" | file_ids={_file_ids}" if _file_ids else "")
          + (f" | course_name={course_name!r}" if course_name else "")
          + (" | excl_syllabus" if exclude_syllabus else ""))

    if not bm25_ids:
        chunks, metas = sem_chunks[:n_results], sem_metas[:n_results]
    else:
        merged_ids = rrf_merge(sem_ids, bm25_ids)[:n_results]
        id_to_idx  = {id_: i for i, id_ in enumerate(bm25_st["ids"])}
        chunks, metas = [], []
        for id_ in merged_ids:
            if id_ in id_to_idx:
                i = id_to_idx[id_]
                chunks.append(bm25_st["chunks"][i])
                metas.append(bm25_st["metadatas"][i])

    safe_chunks, safe_metas = [], []
    for chunk, meta in zip(chunks, metas):
        meta_uid = meta.get("user_id")
        if meta_uid != user_id and meta_uid is not None:
            print(f"[Security] DROPPED chunk with user_id={meta_uid} "
                  f"(expected {user_id}) — possible isolation violation")
            continue
        if course_name and meta.get("course_name") != course_name:
            print(f"[Security] DROPPED chunk with course_name={meta.get('course_name')!r} "
                  f"(expected {course_name!r}) — course isolation enforced")
            continue
        # Safety net 1 — drop chunks tagged file_type="syllabus" (current scheme).
        if exclude_syllabus and meta.get("file_type") == "syllabus":
            continue
        # Safety net 2 — drop untagged legacy syllabus chunks by source name prefix.
        # Covers chunks indexed before the file_type metadata field was introduced.
        if exclude_syllabus and meta.get("source", "").startswith(_SYLLABUS_SOURCE_PREFIX):
            print(f"[RAG] DROPPED untagged syllabus chunk source={meta.get('source')!r}")
            continue
        safe_chunks.append(chunk)
        safe_metas.append(meta)
    return safe_chunks, safe_metas


def get_past_exam_file_ids(user_id: int, course_name: str | None = None) -> list[str]:
    """Return file_ids of documents the user tagged as past exams (UserDocument.is_past_exam),
    optionally restricted to a single course. Used to ground "Lecturer's Brain" agents
    (exam prediction / trap-question simulation) in the lecturer's actual past exams."""
    db = SessionLocal()
    try:
        q = db.query(UserDocument.file_id).filter(
            UserDocument.user_id == user_id,
            UserDocument.is_past_exam.is_(True),
        )
        if course_name:
            q = q.filter(UserDocument.course_name == course_name)
        return [row[0] for row in q.all()]
    finally:
        db.close()


def get_chunks_for_files(user_id: int, file_ids: list[str]) -> tuple[list[str], list[dict]]:
    """Return ALL stored chunks for the given file_ids, in original chunk order.

    Unlike hybrid_search (query-driven top-k), this dumps the full indexed text of
    specific documents — used when a feature needs to analyze a whole document
    (e.g. a past exam) rather than retrieve the most relevant snippets.
    """
    if not file_ids:
        return [], []
    col = get_user_collection(user_id)
    if col.count() == 0:
        return [], []
    result = col.get(include=["documents", "metadatas"])
    chunks, metas = [], []
    for doc, meta in zip(result["documents"], result["metadatas"]):
        if meta.get("user_id") == user_id and meta.get("file_id") in file_ids:
            chunks.append(doc)
            metas.append(meta)
    return chunks, metas

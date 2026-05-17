import re

import numpy as np
from rank_bm25 import BM25Okapi

from extensions import (
    RRF_K, TOP_K, _bm25_map, _collection_map, _images_map,
    chroma_client, embeddings_model,
)


def get_user_collection(user_id: int):
    if user_id not in _collection_map:
        _collection_map[user_id] = chroma_client.get_or_create_collection(
            f"documents_u{user_id}",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection_map[user_id]


def get_user_images(user_id: int) -> dict:
    return _images_map.setdefault(user_id, {})


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
    file_id: str | None = None,
) -> tuple[list[str], list[dict]]:
    col       = get_user_collection(user_id)
    bm25_st   = get_user_bm25(user_id)
    doc_count = col.count()
    if doc_count == 0:
        return [], []

    print(f"DEBUG: Running vector search with filter user_id={user_id}")
    n_fetch      = min(n_results * 2, doc_count)
    query_vector = embeddings_model.embed_query(query_text)

    _uid_filter = {"user_id": {"$eq": user_id}}
    try:
        if file_id:
            where_filter = {"$and": [_uid_filter, {"file_id": {"$eq": file_id}}]}
        else:
            where_filter = _uid_filter
        sem_result = col.query(
            query_embeddings=[query_vector],
            n_results=n_fetch,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        try:
            sem_result = col.query(
                query_embeddings=[query_vector],
                n_results=n_fetch,
                where=_uid_filter,
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
                    not file_id or
                    bm25_st["metadatas"][i].get("file_id") == file_id
                )
            ]

    print(f"▶ HYBRID u{user_id}: {len(sem_ids)} semantic | {len(bm25_ids)} bm25"
          + (f" | file_id={file_id}" if file_id else ""))

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
        if meta_uid == user_id or meta_uid is None:
            safe_chunks.append(chunk)
            safe_metas.append(meta)
        else:
            print(f"[Security] DROPPED chunk with user_id={meta_uid} "
                  f"(expected {user_id}) — possible isolation violation")
    return safe_chunks, safe_metas

"""
FAISS-based vector store — replaces ChromaDB.

Per-user isolation: data/faiss/user_{uid}/
  index.faiss   FAISS IndexFlatL2 (1536-dim, float32)
  vecs.npy      float32 (N, 1536) — kept to support rebuild-on-delete
  meta.json     list of {str_id, document, metadata} in FAISS row order

The FaissCollection class exposes the same surface as a ChromaDB Collection
so all existing call sites (upsert, delete, count, get, query) work unchanged.
"""
import json
import shutil
import threading
from pathlib import Path
from typing import Optional

import numpy as np
import faiss

EMBED_DIM  = 1536           # OpenAI text-embedding-3-small output dimension
FAISS_BASE = Path("data/faiss")

# ── per-process in-memory cache ───────────────────────────────────────────────
_user_stores: dict[int, "FaissCollection"] = {}
_store_locks: dict[int, threading.Lock]    = {}
_global_lock                               = threading.Lock()


def get_user_store(user_id: int) -> "FaissCollection":
    """Return (and cache) the FaissCollection for a user."""
    with _global_lock:
        if user_id not in _user_stores:
            lock = threading.Lock()
            _store_locks[user_id] = lock
            _user_stores[user_id] = FaissCollection(user_id, lock)
    return _user_stores[user_id]


def invalidate_user_store(user_id: int) -> None:
    """Force reload from disk on the next get_user_store() call (used after wipe)."""
    with _global_lock:
        _user_stores.pop(user_id, None)
        _store_locks.pop(user_id, None)


def list_indexed_user_ids() -> list[int]:
    """Return all user IDs that have on-disk FAISS data."""
    if not FAISS_BASE.exists():
        return []
    return [
        int(p.name.split("_")[1])
        for p in FAISS_BASE.iterdir()
        if p.is_dir()
        and p.name.startswith("user_")
        and p.name.split("_")[1].isdigit()
        and (p / "meta.json").exists()
    ]


class FaissCollection:
    """
    ChromaDB Collection-compatible object backed by a per-user FAISS index.

    Thread safety: a per-user Lock guards every mutating operation.
    """

    def __init__(self, user_id: int, lock: threading.Lock):
        self.user_id = user_id
        self._lock   = lock
        self._dir    = FAISS_BASE / f"user_{user_id}"
        self._dir.mkdir(parents=True, exist_ok=True)
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        idx_path  = self._dir / "index.faiss"
        vecs_path = self._dir / "vecs.npy"
        meta_path = self._dir / "meta.json"
        if idx_path.exists() and meta_path.exists() and vecs_path.exists():
            self._index   = faiss.read_index(str(idx_path))
            self._vecs    = np.load(str(vecs_path)).astype(np.float32)
            with open(meta_path, encoding="utf-8") as fh:
                self._entries = json.load(fh)   # [{str_id, document, metadata}]
        else:
            self._index   = faiss.IndexFlatL2(EMBED_DIM)
            self._vecs    = np.empty((0, EMBED_DIM), dtype=np.float32)
            self._entries = []

    def _save(self) -> None:
        faiss.write_index(self._index, str(self._dir / "index.faiss"))
        np.save(str(self._dir / "vecs.npy"), self._vecs)
        with open(self._dir / "meta.json", "w", encoding="utf-8") as fh:
            json.dump(self._entries, fh, ensure_ascii=False)

    def _rebuild_index(self) -> None:
        """Reconstruct the FAISS index from self._vecs (used after deletes/upserts)."""
        new_idx = faiss.IndexFlatL2(EMBED_DIM)
        if self._vecs.shape[0] > 0:
            # FAISS requires a C-contiguous float32 2-D array
            safe = np.ascontiguousarray(self._vecs, dtype=np.float32)
            if safe.ndim != 2 or safe.shape[1] != EMBED_DIM:
                raise ValueError(
                    f"[FAISS] u{self.user_id}: expected shape (N,{EMBED_DIM}), got {safe.shape}"
                )
            new_idx.add(safe)
        self._index = new_idx

    # ── ChromaDB-compatible API ───────────────────────────────────────────────

    def count(self) -> int:
        return len(self._entries)

    def get(self, include: Optional[list[str]] = None) -> dict:
        """Return all stored chunks (mirrors chromadb Collection.get)."""
        include = include or ["ids", "documents", "metadatas"]
        result: dict = {"ids": [e["str_id"] for e in self._entries]}
        if "documents"  in include:
            result["documents"]  = [e["document"]          for e in self._entries]
        if "metadatas"  in include:
            result["metadatas"]  = [e["metadata"]           for e in self._entries]
        if "embeddings" in include:
            result["embeddings"] = self._vecs.tolist()
        return result

    def upsert(
        self,
        ids:        list[str],
        embeddings: list,
        documents:  list[str],
        metadatas:  list[dict],
    ) -> None:
        """Add new chunks; update in-place if the string ID already exists."""
        if not ids:
            return
        with self._lock:
            existing = {e["str_id"]: i for i, e in enumerate(self._entries)}
            new_vecs:    list = []
            new_entries: list = []

            for sid, emb, doc, meta in zip(ids, embeddings, documents, metadatas):
                # Validate embedding shape before doing anything
                vec = np.array(emb, dtype=np.float32)
                if vec.shape != (EMBED_DIM,):
                    raise ValueError(
                        f"[FAISS] u{self.user_id}: embedding dim mismatch — "
                        f"expected ({EMBED_DIM},), got {vec.shape}. "
                        f"Check EMBED_DIM constant and embedding model output."
                    )
                if sid in existing:
                    idx = existing[sid]
                    self._entries[idx] = {"str_id": sid, "document": doc, "metadata": meta}
                    self._vecs[idx]    = vec
                else:
                    new_vecs.append(vec)
                    new_entries.append({"str_id": sid, "document": doc, "metadata": meta})

            if new_entries:
                arr = np.stack(new_vecs).astype(np.float32)   # shape (N, EMBED_DIM)
                self._vecs = (
                    np.vstack([self._vecs, arr])
                    if self._vecs.shape[0] > 0
                    else arr
                )
                self._entries.extend(new_entries)

            # Always rebuild so FAISS row order == _entries order
            self._rebuild_index()
            self._save()
            print(f"[FAISS] u{self.user_id}: upserted {len(ids)} chunk(s) "
                  f"({len(new_entries)} new, {len(ids)-len(new_entries)} updated) "
                  f"— total {len(self._entries)}")

    def delete(self, where: dict) -> None:
        """Delete all entries whose metadata matches the where filter."""
        with self._lock:
            keep = [not _matches_where(e["metadata"], where) for e in self._entries]
            if all(keep):
                return
            removed = sum(1 for k in keep if not k)
            self._entries = [e for e, k in zip(self._entries, keep) if k]
            self._vecs    = (
                self._vecs[keep]
                if self._vecs.shape[0] > 0
                else np.empty((0, EMBED_DIM), dtype=np.float32)
            )
            self._rebuild_index()
            self._save()
            print(f"[FAISS] u{self.user_id}: deleted {removed} chunk(s)")

    def query(
        self,
        query_embeddings: list,
        n_results:        int = 8,
        where:            Optional[dict] = None,
        include:          Optional[list[str]] = None,
    ) -> dict:
        """Vector nearest-neighbour search (mirrors chromadb Collection.query)."""
        empty: dict = {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}
        if self._index.ntotal == 0:
            return empty
        if not query_embeddings:
            return empty

        q       = np.array(query_embeddings, dtype=np.float32)
        # Over-fetch to compensate for post-filter attrition
        k_fetch = min(n_results * 4, self._index.ntotal)
        distances, faiss_ids = self._index.search(q, k_fetch)

        out: dict = {"ids": [], "documents": [], "metadatas": [], "distances": []}
        for b in range(len(query_embeddings)):
            b_ids, b_docs, b_metas, b_dists = [], [], [], []
            for dist, fid in zip(distances[b], faiss_ids[b]):
                if fid < 0 or fid >= len(self._entries):
                    continue
                entry = self._entries[fid]
                if where and not _matches_where(entry["metadata"], where):
                    continue
                b_ids.append(entry["str_id"])
                b_docs.append(entry["document"])
                b_metas.append(entry["metadata"])
                b_dists.append(float(dist))
                if len(b_ids) >= n_results:
                    break
            out["ids"].append(b_ids)
            out["documents"].append(b_docs)
            out["metadatas"].append(b_metas)
            out["distances"].append(b_dists)
        return out

    def wipe(self) -> None:
        """Delete all data for this user — called by RESET_DB."""
        with self._lock:
            shutil.rmtree(self._dir, ignore_errors=True)
            self._dir.mkdir(parents=True, exist_ok=True)
            self._index   = faiss.IndexFlatL2(EMBED_DIM)
            self._vecs    = np.empty((0, EMBED_DIM), dtype=np.float32)
            self._entries = []
            print(f"[FAISS] u{self.user_id}: wiped")


# ── where-filter evaluator ────────────────────────────────────────────────────

def _matches_where(meta: dict, where: dict) -> bool:
    """
    Evaluate a ChromaDB-style where filter.
    Supports: {"$and": [...]}, {key: {"$eq/$ne/$gt/$gte/$lt/$lte": val}},
              and the shorthand {key: val} (implicit $eq).
    """
    if "$and" in where:
        return all(_matches_where(meta, sub) for sub in where["$and"])
    for key, cond in where.items():
        mv = meta.get(key)
        if isinstance(cond, dict):
            op, val = next(iter(cond.items()))
            if op == "$eq"  and mv != val:                             return False
            if op == "$ne"  and mv == val:                             return False
            if op == "$in"  and mv not in val:                         return False
            if op == "$nin" and mv in val:                             return False
            if op == "$gt"  and not (mv is not None and mv >  val):    return False
            if op == "$gte" and not (mv is not None and mv >= val):    return False
            if op == "$lt"  and not (mv is not None and mv <  val):    return False
            if op == "$lte" and not (mv is not None and mv <= val):    return False
        else:
            if mv != cond:
                return False
    return True

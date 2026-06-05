"""
Background startup tasks.

Runs once per process:
  1. _migrate_chromadb_to_faiss   – one-time migration if ChromaDB data exists
  2. _backfill_user_documents     – populate user_documents from FAISS metadata
  3. _migrate_orphaned_sessions   – assign orphaned sessions to admin (idempotent)
"""
import threading

from models import ChatSession, SessionLocal, User, UserDocument
from services.faiss_store import get_user_store, list_indexed_user_ids
from sqlalchemy import func as sql_func


def _migrate_chromadb_to_faiss() -> None:
    """
    One-time migration: reads every ChromaDB collection and writes it to FAISS.
    Skips users that already have FAISS data.
    Silently no-ops if chromadb is not installed or ./data/db doesn't exist.
    """
    try:
        import chromadb as _chroma
        from pathlib import Path
        chroma_path = Path("./data/db")
        if not chroma_path.exists():
            return
        chroma = _chroma.PersistentClient(path=str(chroma_path))
        collections = chroma.list_collections()
    except Exception:
        return   # chromadb not installed or no data — skip

    already_migrated = set(list_indexed_user_ids())
    migrated_users = 0

    for col_info in collections:
        name = col_info.name if hasattr(col_info, "name") else str(col_info)
        if not name.startswith("documents_u"):
            continue
        uid_str = name[len("documents_u"):]
        if not uid_str.isdigit():
            continue
        uid = int(uid_str)
        if uid in already_migrated:
            continue

        try:
            col = chroma.get_collection(name)
            if col.count() == 0:
                continue
            result = col.get(include=["embeddings", "documents", "metadatas", "ids"])
        except Exception as exc:
            print(f"[Migration] WARNING: could not read ChromaDB collection {name}: {exc}")
            continue

        ids        = result.get("ids")        or []
        embeddings = result.get("embeddings") or []
        documents  = result.get("documents")  or []
        metadatas  = result.get("metadatas")  or []

        if not ids or not embeddings:
            continue

        try:
            faiss_col = get_user_store(uid)
            faiss_col.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=[m or {} for m in metadatas],
            )
            print(f"[Migration] u{uid}: migrated {len(ids)} chunks from ChromaDB → FAISS")
            migrated_users += 1
        except Exception as exc:
            print(f"[Migration] WARNING: FAISS write failed for u{uid}: {exc}")

    if migrated_users:
        print(f"[Migration] ✓ Migrated {migrated_users} user(s) from ChromaDB to FAISS")


def _backfill_user_documents() -> None:
    """
    Populate user_documents from FAISS metadata for users whose docs
    are not yet registered in SQLite. Idempotent.
    """
    count = 0
    db    = SessionLocal()
    try:
        for uid in list_indexed_user_ids():
            try:
                store  = get_user_store(uid)
                result = store.get(include=["metadatas"])
            except Exception:
                continue

            seen: set[tuple] = set()
            for meta in (result.get("metadatas") or []):
                fid   = meta.get("file_id")
                fname = meta.get("file_name", meta.get("source", ""))
                key   = (uid, fid)
                if not fid or not fname or key in seen:
                    continue
                seen.add(key)
                exists = db.query(UserDocument).filter(
                    UserDocument.user_id == uid,
                    UserDocument.file_id == fid,
                ).first()
                if not exists:
                    db.add(UserDocument(user_id=uid, file_id=fid, filename=fname))
                    count += 1
        db.commit()
        if count:
            print(f"[Backfill] Registered {count} document(s) from FAISS into user_documents")
    except Exception as exc:
        print(f"[Backfill] WARNING: backfill failed: {exc}")
        db.rollback()
    finally:
        db.close()


def _migrate_orphaned_sessions() -> None:
    """Assign sessions with user_id=NULL to the oldest admin account (idempotent)."""
    db = SessionLocal()
    try:
        orphan_count = db.query(sql_func.count(ChatSession.id)).filter(
            ChatSession.user_id.is_(None)
        ).scalar() or 0
        if orphan_count == 0:
            return
        admin = (
            db.query(User)
            .filter(User.role == "admin")
            .order_by(User.id)
            .first()
        )
        if not admin:
            print("[Migration] No admin user found — orphaned sessions left unassigned")
            return
        db.query(ChatSession).filter(ChatSession.user_id.is_(None)).update(
            {"user_id": admin.id}, synchronize_session=False
        )
        db.commit()
        print(f"[Migration] Assigned {orphan_count} orphaned session(s) to admin u{admin.id}")
    except Exception as exc:
        print(f"[Migration] WARNING: could not migrate orphaned sessions: {exc}")
        db.rollback()
    finally:
        db.close()


def start_background_threads() -> None:
    _migrate_orphaned_sessions()   # fast + synchronous
    threading.Thread(
        target=_migrate_chromadb_to_faiss, daemon=True, name="chroma-migration"
    ).start()
    threading.Thread(
        target=_backfill_user_documents, daemon=True, name="doc-backfill"
    ).start()

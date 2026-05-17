import threading

from extensions import chroma_client
from models import ChatSession, SessionLocal, User, UserDocument
from sqlalchemy import func as sql_func


def _backfill_user_documents() -> None:
    """Populate user_documents from existing ChromaDB collections (idempotent)."""
    count = 0
    db = SessionLocal()
    try:
        for col_info in chroma_client.list_collections():
            name = col_info.name if hasattr(col_info, "name") else str(col_info)
            if not name.startswith("documents_u"):
                continue
            uid_str = name[len("documents_u"):]
            if not uid_str.isdigit():
                continue
            uid = int(uid_str)
            try:
                col    = chroma_client.get_collection(name)
                result = col.get(include=["metadatas"])
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
            print(f"[Backfill] Registered {count} pre-existing document(s) in user_documents")
    except Exception as exc:
        print(f"[Backfill] WARNING: could not backfill user_documents: {exc}")
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


def _backfill_chroma_user_id() -> None:
    """Stamp user_id metadata on chunks that predate per-chunk user_id."""
    total_updated = 0
    for col_info in chroma_client.list_collections():
        name = col_info.name if hasattr(col_info, "name") else str(col_info)
        if not name.startswith("documents_u"):
            continue
        uid_str = name[len("documents_u"):]
        if not uid_str.isdigit():
            continue
        uid = int(uid_str)
        try:
            col    = chroma_client.get_collection(name)
            result = col.get(include=["metadatas", "ids"])
        except Exception as exc:
            print(f"[Backfill-meta] Could not open {name}: {exc}")
            continue
        ids_to_update:   list[str]  = []
        metas_to_update: list[dict] = []
        for chunk_id, meta in zip(result.get("ids") or [], result.get("metadatas") or []):
            if meta is None:
                meta = {}
            if meta.get("user_id") is None:
                ids_to_update.append(chunk_id)
                metas_to_update.append({**meta, "user_id": uid})
        if ids_to_update:
            try:
                col.update(ids=ids_to_update, metadatas=metas_to_update)
                total_updated += len(ids_to_update)
                print(f"[Backfill-meta] {name}: stamped user_id={uid} on {len(ids_to_update)} chunk(s)")
            except Exception as exc:
                print(f"[Backfill-meta] WARNING: could not update {name}: {exc}")
    if total_updated:
        print(f"[Backfill-meta] Done — {total_updated} chunk(s) updated across all collections")


def start_background_threads() -> None:
    threading.Thread(target=_backfill_user_documents, daemon=True, name="doc-backfill").start()
    _migrate_orphaned_sessions()  # runs synchronously (fast, idempotent)
    threading.Thread(target=_backfill_chroma_user_id, daemon=True, name="meta-backfill").start()

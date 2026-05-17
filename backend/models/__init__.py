import os
import sys
from datetime import datetime, timezone

import chromadb
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, Text,
    UniqueConstraint, create_engine, func as sql_func, text as sql_text,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

_Base = declarative_base()


class User(_Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name    = Column(String(100), nullable=False, server_default='')
    last_name     = Column(String(100), nullable=False, server_default='')
    role                  = Column(String(20),  nullable=False, server_default='user')
    plan_type             = Column(String(20),  nullable=False, server_default='basic')
    subscription_end_date = Column(DateTime,    nullable=True)
    uploads_this_month    = Column(Integer,     nullable=False, server_default='0')
    upload_month_key      = Column(String(7),   nullable=False, server_default='')
    questions_this_month  = Column(Integer,     nullable=False, server_default='0')
    question_month_key    = Column(String(7),   nullable=False, server_default='')
    country               = Column(String(100), nullable=True)
    institution           = Column(String(200), nullable=True)
    degree_type           = Column(String(50),  nullable=True)
    primary_major         = Column(String(200), nullable=True)
    secondary_major       = Column(String(200), nullable=True)
    created_at            = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    sessions = relationship("ChatSession", back_populates="owner", cascade="all, delete-orphan")


class OtpCode(_Base):
    __tablename__ = "otp_codes"
    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String(255), nullable=False, index=True)
    code       = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(_Base):
    __tablename__ = "password_reset_tokens"
    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String(255), nullable=False, index=True)
    token      = Column(String(86), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSession(_Base):
    __tablename__ = "sessions"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title      = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    messages   = relationship(
        "ChatMessage", back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )
    owner = relationship("User", back_populates="sessions")


class ChatMessage(_Base):
    __tablename__ = "messages"
    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role       = Column(String(20), nullable=False)
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    session    = relationship("ChatSession", back_populates="messages")


class UserDocument(_Base):
    """SQL-level ownership registry for per-user document isolation."""
    __tablename__ = "user_documents"
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    file_id     = Column(String(32), nullable=False, index=True)
    filename    = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("user_id", "file_id", name="uq_user_document"),)


# ── DB engine ─────────────────────────────────────────────────────────────────
os.makedirs("./data", exist_ok=True)  # ensure data/ exists before SQLite opens it
_db_engine  = create_engine("sqlite:///./data/chat.db", connect_args={"check_same_thread": False})
_Base.metadata.create_all(bind=_db_engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_db_engine)

# ── Controlled one-time full reset ────────────────────────────────────────────
if os.getenv("RESET_DB", "0").strip() == "1":
    print("=" * 62)
    print("[RESET] RESET_DB=1 detected — performing full data wipe …")
    _Base.metadata.drop_all(bind=_db_engine)
    _Base.metadata.create_all(bind=_db_engine)
    print("[RESET] SQL tables dropped and recreated.")
    try:
        _reset_chroma = chromadb.PersistentClient(path="./data/db")
        _deleted = 0
        for _c in _reset_chroma.list_collections():
            _name = _c.name if hasattr(_c, "name") else str(_c)
            _reset_chroma.delete_collection(_name)
            print(f"[RESET]   Deleted ChromaDB collection: {_name}")
            _deleted += 1
        print(f"[RESET] {_deleted} ChromaDB collection(s) deleted.")
    except Exception as _e:
        print(f"[RESET] WARNING: ChromaDB reset failed: {_e}")
    print("[RESET] ✓ Reset complete. Remove RESET_DB=1 from .env and restart.")
    print("=" * 62)
    sys.exit(0)

# ── Schema migrations (idempotent ALTER TABLE statements) ─────────────────────
with _db_engine.connect() as _conn:
    for _stmt, _msg in [
        ("ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)", "added user_id to sessions"),
        ("ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NOT NULL DEFAULT ''", "added first_name to users"),
        ("ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NOT NULL DEFAULT ''", "added last_name to users"),
        ("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'", "added role to users"),
        ("ALTER TABLE users ADD COLUMN plan_type VARCHAR(20) NOT NULL DEFAULT 'basic'", "added plan_type to users"),
        ("ALTER TABLE users ADD COLUMN subscription_end_date DATETIME", "added subscription_end_date to users"),
        ("ALTER TABLE users ADD COLUMN uploads_this_month INTEGER NOT NULL DEFAULT 0", "added uploads_this_month to users"),
        ("ALTER TABLE users ADD COLUMN upload_month_key VARCHAR(7) NOT NULL DEFAULT ''", "added upload_month_key to users"),
        ("ALTER TABLE users ADD COLUMN questions_this_month INTEGER NOT NULL DEFAULT 0", "added questions_this_month to users"),
        ("ALTER TABLE users ADD COLUMN question_month_key VARCHAR(7) NOT NULL DEFAULT ''", "added question_month_key to users"),
        ("ALTER TABLE users ADD COLUMN country VARCHAR(100)", "added country to users"),
        ("ALTER TABLE users ADD COLUMN institution VARCHAR(200)", "added institution to users"),
        ("ALTER TABLE users ADD COLUMN degree_type VARCHAR(50)", "added degree_type to users"),
        ("ALTER TABLE users ADD COLUMN primary_major VARCHAR(200)", "added primary_major to users"),
        ("ALTER TABLE users ADD COLUMN secondary_major VARCHAR(200)", "added secondary_major to users"),
    ]:
        try:
            _conn.execute(sql_text(_stmt))
            _conn.commit()
            print(f"[DB] Migration: {_msg}")
        except Exception:
            pass

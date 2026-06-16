import os
import sys
from datetime import datetime, timezone

import shutil
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
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
    gender                = Column(String(20),  nullable=True)
    study_year            = Column(String(50),  nullable=True)
    ai_style              = Column(String(100), nullable=True)
    prof_sims_this_month  = Column(Integer,     nullable=False, server_default='0')
    prof_sim_month_key    = Column(String(7),   nullable=False, server_default='')
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
    file_id         = Column(String(32), nullable=False, index=True)
    filename        = Column(String(255), nullable=False)
    uploaded_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    file_size_bytes = Column(Integer, nullable=True)
    course_name     = Column(String(255), nullable=True, index=True)
    is_past_exam    = Column(Boolean, nullable=False, server_default="0")
    is_session_only = Column(Boolean, nullable=False, server_default="0")
    __table_args__ = (UniqueConstraint("user_id", "file_id", name="uq_user_document"),)


class CfoNotification(_Base):
    """Proactive CFO alerts generated by the background financial-health scheduler."""
    __tablename__ = "cfo_notifications"
    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String(200), nullable=False)
    message    = Column(Text, nullable=False)
    type       = Column(String(20),  nullable=False, server_default='info')   # info|warning|critical
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_read    = Column(Boolean, default=False, nullable=False)


class Payment(_Base):
    """Financial transactions — subscription payments made by users."""
    __tablename__ = "payments"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                          nullable=True, index=True)
    amount       = Column(Float,      nullable=False)                        # ILS
    currency     = Column(String(3),  nullable=False, server_default="ILS")
    plan_type    = Column(String(20), nullable=True)                         # 'monthly' | 'semester'
    status       = Column(String(20), nullable=False, server_default="completed")
    payment_date = Column(DateTime,   nullable=False, index=True)
    description  = Column(String(255), nullable=True)
    created_at   = Column(DateTime,   default=lambda: datetime.now(timezone.utc))
    user         = relationship("User", backref="payments")


class TopicMastery(_Base):
    """Per-user, per-document mastery percentage updated after every quiz attempt."""
    __tablename__ = "topic_mastery"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    file_id      = Column(String(32), nullable=False)   # MD5 hex from UserDocument
    topic        = Column(String(200), nullable=False)
    mastery_pct  = Column(Float,   nullable=False, server_default="50.0")
    quiz_count   = Column(Integer, nullable=False, server_default="0")
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("user_id", "file_id", name="uq_user_file_mastery"),)


class CustomCourse(_Base):
    """User-created course with optional syllabus text for RAG."""
    __tablename__ = "custom_courses"
    id                 = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                nullable=False, index=True)
    course_name        = Column(String(200), nullable=False)
    lecturer_name      = Column(String(200), nullable=True)
    has_tirgul         = Column(Boolean,     nullable=False, server_default="0")
    ta_name            = Column(String(200), nullable=True)
    semester           = Column(String(20),  nullable=True)
    color              = Column(String(30),  nullable=True)
    full_syllabus_text = Column(Text,        nullable=True)
    syllabus_file_id   = Column(String(32),  nullable=True)  # links to UserDocument in ChromaDB
    created_at         = Column(DateTime,    default=lambda: datetime.now(timezone.utc))


class SyllabusTopicMastery(_Base):
    """Per-user, per-course syllabus-topic mastery — powers the Mastery page's Skill Tree.

    Rows are lazily created (one per extracted syllabus topic, in teaching order) the
    first time GET /api/mastery/skill-tree is called for a given course. Distinct from
    TopicMastery (which tracks per-document mastery, not per-syllabus-topic).
    """
    __tablename__ = "syllabus_topic_mastery"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    course_name  = Column(String(200), nullable=False, index=True)
    topic        = Column(String(200), nullable=False)
    topic_order  = Column(Integer, nullable=False, server_default="0")
    mastery_pct  = Column(Float,   nullable=False, server_default="0.0")
    quiz_count   = Column(Integer, nullable=False, server_default="0")
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("user_id", "course_name", "topic", name="uq_user_course_topic"),)


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
        from pathlib import Path as _Path
        _faiss_dir = _Path("./data/faiss")
        if _faiss_dir.exists():
            shutil.rmtree(_faiss_dir)
            print("[RESET] FAISS data directory deleted (./data/faiss).")
        else:
            print("[RESET] No FAISS data directory found — nothing to delete.")
    except Exception as _e:
        print(f"[RESET] WARNING: FAISS reset failed: {_e}")
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
        ("ALTER TABLE users ADD COLUMN gender VARCHAR(20)", "added gender to users"),
        ("ALTER TABLE users ADD COLUMN study_year VARCHAR(50)", "added study_year to users"),
        ("ALTER TABLE users ADD COLUMN ai_style VARCHAR(100)", "added ai_style to users"),
        ("ALTER TABLE users ADD COLUMN prof_sims_this_month INTEGER NOT NULL DEFAULT 0", "added prof_sims_this_month to users"),
        ("ALTER TABLE users ADD COLUMN prof_sim_month_key VARCHAR(7) NOT NULL DEFAULT ''", "added prof_sim_month_key to users"),
        ("ALTER TABLE user_documents ADD COLUMN file_size_bytes INTEGER", "added file_size_bytes to user_documents"),
        ("ALTER TABLE user_documents ADD COLUMN course_name VARCHAR(255)", "added course_name to user_documents"),
        ("ALTER TABLE user_documents ADD COLUMN is_past_exam BOOLEAN NOT NULL DEFAULT 0", "added is_past_exam to user_documents"),
        ("ALTER TABLE user_documents ADD COLUMN is_session_only BOOLEAN NOT NULL DEFAULT 0", "added is_session_only to user_documents"),
    ]:
        try:
            _conn.execute(sql_text(_stmt))
            _conn.commit()
            print(f"[DB] Migration: {_msg}")
        except Exception:
            pass

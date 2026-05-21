import functools
from datetime import datetime, timezone, timedelta

import jwt as pyjwt
from flask import jsonify, request

from extensions import ADMIN_EMAIL, SECRET_KEY, TOKEN_TTL_H
from models import ChatMessage, SessionLocal, User

BASIC_UPLOAD_LIMIT   = 2
BASIC_QUESTION_LIMIT = 15


def _make_token(user_id: int, email: str, role: str = "user") -> str:
    payload = {
        "user_id":  user_id,
        "email":    email,
        "role":     role,
        "is_admin": role == "admin",
        "iat":      datetime.now(timezone.utc),
        "exp":      datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_H),
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm="HS256")


def token_required(f):
    """Validate Bearer JWT and inject user_id as the first argument."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Authentication required. Please log in."}), 401
        token = auth[7:]
        try:
            payload = pyjwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_id: int = payload["user_id"]
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token. Please log in again."}), 401
        return f(user_id, *args, **kwargs)
    return decorated


def admin_required(f):
    """Validate Bearer JWT and enforce role == 'admin'."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Authentication required."}), 401
        token = auth[7:]
        try:
            payload = pyjwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token. Please log in again."}), 401

        role         = payload.get("role", "user")
        caller_email = payload.get("email", "").lower()
        is_admin     = role == "admin" or (ADMIN_EMAIL and caller_email == ADMIN_EMAIL)
        if not is_admin:
            return jsonify({"error": "Forbidden — admin access required."}), 403
        return f(payload["user_id"], *args, **kwargs)
    return decorated


def _current_month_key() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m')


def _get_user_refreshed(db, user_id: int):
    """Fetch user and roll over monthly counters if the month changed."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    month_key = _current_month_key()
    if user.upload_month_key != month_key:
        user.upload_month_key   = month_key
        user.uploads_this_month = 0
    if user.question_month_key != month_key:
        user.question_month_key    = month_key
        user.questions_this_month  = 0
    if user.prof_sim_month_key != month_key:
        user.prof_sim_month_key   = month_key
        user.prof_sims_this_month = 0
    return user


def _save_ai_message(session_id: int, content: str) -> None:
    try:
        db = SessionLocal()
        try:
            db.add(ChatMessage(session_id=session_id, role="assistant", content=content))
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        print(f"[DB] failed to save AI message for session {session_id}: {exc}")

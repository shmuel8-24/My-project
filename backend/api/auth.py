import os
import secrets
import threading
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from api.middleware import (
    BASIC_QUESTION_LIMIT,
    BASIC_UPLOAD_LIMIT,
    _get_user_refreshed,
    _make_token,
    token_required,
)
from extensions import ADMIN_EMAIL, client, limiter
from models import (
    ChatMessage, ChatSession, OtpCode, PasswordResetToken,
    SessionLocal, User, UserDocument, sql_func,
)
from services.email import send_otp_email, send_reset_email
from services.security import strip_html

auth_bp = Blueprint("auth", __name__)

# Short-lived registry of emails whose address has been OTP-verified during
# the registration wizard.  Keyed by email; value is {token, expires_at}.
# Single-use and expires in 15 minutes.  Thread-safe via a dedicated lock.
_reg_verified: dict = {}
_reg_lock = threading.Lock()


@auth_bp.route("/api/check-email", methods=["POST"])
def check_email():
    data  = request.get_json()
    email = (data.get("email") or "").strip().lower() if data else ""
    if not email:
        return jsonify({"error": "Email is required"}), 400
    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == email).first() is not None
        return jsonify({"exists": exists}), 200
    finally:
        db.close()


@auth_bp.route("/api/send-otp", methods=["POST"])
@limiter.limit("5 per minute")
def send_otp():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            return jsonify({"success": False, "error": "חשבון לא קיים, אנא הירשם קודם"}), 404
        code       = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        db.add(OtpCode(email=email, code=code, expires_at=expires_at))
        db.commit()
    finally:
        db.close()

    try:
        send_otp_email(email, code)
    except RuntimeError as mail_err:
        print(f"[send-otp] Email delivery failed for {email}: {mail_err}")
        return jsonify({"success": False, "error": str(mail_err)}), 500
    return jsonify({"message": "Code sent successfully"}), 200


@auth_bp.route("/api/verify-otp", methods=["POST"])
@limiter.limit("5 per minute")
def verify_otp():
    data       = request.get_json()
    email      = (data.get("email")      or "").strip().lower() if data else ""
    code       = (data.get("code")       or "").strip()         if data else ""
    first_name = strip_html((data.get("first_name") or "").strip())  if data else ""
    last_name  = strip_html((data.get("last_name")  or "").strip())  if data else ""

    if not email or not code:
        return jsonify({"error": "Email and code are required"}), 400

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        otp = (
            db.query(OtpCode)
            .filter(
                OtpCode.email      == email,
                OtpCode.code       == code,
                OtpCode.used       == False,  # noqa: E712
                OtpCode.expires_at >  now,
            )
            .order_by(OtpCode.created_at.desc())
            .first()
        )
        if not otp:
            return jsonify({"error": "Invalid or expired code. Please try again."}), 401
        otp.used = True

        user = db.query(User).filter(User.email == email).first()
        if not user:
            if not first_name or not last_name:
                return jsonify({"error": "First and last name are required for new accounts."}), 400
            assigned_role = "admin" if (ADMIN_EMAIL and email == ADMIN_EMAIL) else "user"
            user = User(
                email=email,
                password_hash=generate_password_hash(secrets.token_hex(32)),
                first_name=first_name,
                last_name=last_name,
                role=assigned_role,
            )
            db.add(user)
            db.flush()
            print(f"[OTP] New user created: {first_name} {last_name} <{email}> role={assigned_role}")
        else:
            if ADMIN_EMAIL and email == ADMIN_EMAIL and user.role != "admin":
                user.role = "admin"
                print(f"[OTP] Auto-promoted {email} to admin")

        db.commit()
        db.refresh(user)
        token = _make_token(user.id, user.email, user.role)
        print(f"[OTP] Verified: {email} (id={user.id}, role={user.role})")
        return jsonify({
            "token":      token,
            "email":      user.email,
            "first_name": user.first_name,
            "last_name":  user.last_name,
            "role":       user.role,
        }), 200
    finally:
        db.close()


@auth_bp.route("/api/register/send-otp", methods=["POST"])
@limiter.limit("5 per minute")
def register_send_otp():
    """Step 1 of 3: send a verification OTP to an unregistered email address."""
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            return jsonify({"error": "כתובת המייל כבר רשומה במערכת"}), 409
        code       = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        db.add(OtpCode(email=email, code=code, expires_at=expires_at))
        db.commit()
    finally:
        db.close()

    try:
        send_otp_email(email, code)
    except RuntimeError as mail_err:
        print(f"[register-send-otp] Email delivery failed for {email}: {mail_err}")
        return jsonify({"error": str(mail_err)}), 500

    return jsonify({"message": "Verification code sent"}), 200


@auth_bp.route("/api/register/verify-otp", methods=["POST"])
@limiter.limit("10 per minute")
def register_verify_otp():
    """Step 2 of 3: verify the OTP; returns a single-use reg_token on success."""
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code  = (data.get("code")  or "").strip()

    if not email or not code:
        return jsonify({"error": "Email and code are required"}), 400

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        otp = (
            db.query(OtpCode)
            .filter(
                OtpCode.email      == email,
                OtpCode.code       == code,
                OtpCode.used       == False,  # noqa: E712
                OtpCode.expires_at >  now,
            )
            .order_by(OtpCode.created_at.desc())
            .first()
        )
        if not otp:
            return jsonify({"error": "קוד שגוי או שפג תוקפו. נסה שוב."}), 401
        otp.used = True
        db.commit()
    finally:
        db.close()

    reg_token = secrets.token_urlsafe(32)
    with _reg_lock:
        _reg_verified[email] = {
            "token":      reg_token,
            "expires_at": datetime.utcnow() + timedelta(minutes=15),
        }

    print(f"[register-verify-otp] Email verified for registration: {email}")
    return jsonify({"reg_token": reg_token}), 200


@auth_bp.route("/api/login", methods=["POST", "OPTIONS"])
@limiter.limit("5 per minute")
def login():
    if request.method == "OPTIONS":
        resp = jsonify({})
        resp.headers["Access-Control-Allow-Origin"]  = request.headers.get("Origin", "http://127.0.0.1:3000")
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Max-Age"]       = "86400"
        return resp, 200

    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email:
        return jsonify({"success": False, "error": "Email is required"}), 400

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            return jsonify({"success": False, "error": "חשבון לא קיים, אנא הירשם קודם"}), 404
        if not password:
            return jsonify({"success": False, "error": "Password is required"}), 400
        if not check_password_hash(user.password_hash, password):
            return jsonify({"success": False, "error": "Invalid credentials"}), 401

        if ADMIN_EMAIL and email == ADMIN_EMAIL and user.role != "admin":
            user.role = "admin"
            db.commit()

        token = _make_token(user.id, user.email, user.role)
        print(f"[Login] {email} (id={user.id}, role={user.role})")
        return jsonify({
            "success":    True,
            "token":      token,
            "email":      user.email,
            "first_name": user.first_name,
            "last_name":  user.last_name,
            "role":       user.role,
        }), 200
    finally:
        db.close()


@auth_bp.route("/api/register", methods=["POST", "OPTIONS"])
@limiter.limit("5 per minute")
def register():
    """Step 3 of 3: create the account after email has been OTP-verified.

    Requires a ``reg_token`` issued by /api/register/verify-otp.  The token
    is single-use and expires 15 minutes after email verification.
    """
    if request.method == "OPTIONS":
        resp = jsonify({})
        resp.headers["Access-Control-Allow-Origin"]  = request.headers.get("Origin", "http://127.0.0.1:3000")
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Max-Age"]       = "86400"
        return resp, 200

    data       = request.get_json(silent=True) or {}
    email      = (data.get("email")      or "").strip().lower()
    password   = (data.get("password")   or "").strip()
    first_name = strip_html((data.get("first_name") or "").strip())
    last_name  = strip_html((data.get("last_name")  or "").strip())
    reg_token  = (data.get("reg_token")  or "").strip()
    gender     = strip_html((data.get("gender")     or "").strip())

    if not email:         return jsonify({"success": False, "error": "Email is required"}), 400
    if not reg_token:     return jsonify({"success": False, "error": "אימות מייל נדרש לפני ההרשמה"}), 400
    if not password:      return jsonify({"success": False, "error": "סיסמה נדרשת"}), 400
    if len(password) < 6: return jsonify({"success": False, "error": "הסיסמה חייבת להכיל לפחות 6 תווים"}), 400
    if not first_name:    return jsonify({"success": False, "error": "שם פרטי נדרש"}), 400
    if not last_name:     return jsonify({"success": False, "error": "שם משפחה נדרש"}), 400

    # Validate and consume the registration token — single-use, 15-min TTL.
    now = datetime.utcnow()
    with _reg_lock:
        entry = _reg_verified.get(email)
        if not entry or entry["token"] != reg_token or entry["expires_at"] < now:
            return jsonify({"success": False, "error": "אימות המייל פג תוקף. אנא התחל את ההרשמה מחדש."}), 401
        del _reg_verified[email]

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            return jsonify({"success": False, "error": "כתובת המייל כבר רשומה במערכת"}), 409
        assigned_role = "admin" if (ADMIN_EMAIL and email == ADMIN_EMAIL) else "user"
        user = User(
            email=email,
            password_hash=generate_password_hash(password),
            first_name=first_name,
            last_name=last_name,
            role=assigned_role,
            gender=gender or None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[Register] {first_name} {last_name} <{email}> role={assigned_role} gender={gender!r}")
        token = _make_token(user.id, user.email, user.role)
        return jsonify({
            "success":    True,
            "token":      token,
            "email":      user.email,
            "first_name": user.first_name,
            "last_name":  user.last_name,
            "role":       user.role,
        }), 201
    finally:
        db.close()


@auth_bp.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email is required"}), 400

    reset_token_str = None
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            reset_token_str = secrets.token_urlsafe(48)
            expires_at      = datetime.utcnow() + timedelta(minutes=30)
            db.add(PasswordResetToken(email=email, token=reset_token_str, expires_at=expires_at))
            db.commit()
            print(f"[Reset] Token created for {email}")
    finally:
        db.close()

    if reset_token_str:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        reset_link   = f"{frontend_url}/reset-password?token={reset_token_str}"
        try:
            send_reset_email(email, reset_link)
        except RuntimeError as mail_err:
            print(f"[forgot-password] Email delivery failed for {email}: {mail_err}")
            _rb = SessionLocal()
            try:
                _rb.query(PasswordResetToken).filter(
                    PasswordResetToken.token == reset_token_str
                ).delete()
                _rb.commit()
            finally:
                _rb.close()
            return jsonify({"success": False, "error": str(mail_err)}), 500

    return jsonify({"success": True}), 200


@auth_bp.route("/api/reset-password", methods=["POST"])
def reset_password():
    data     = request.get_json(silent=True) or {}
    token    = (data.get("token")    or "").strip()
    password = (data.get("password") or "").strip()

    if not token:
        return jsonify({"success": False, "error": "Token is required"}), 400
    if not password or len(password) < 6:
        return jsonify({"success": False, "error": "הסיסמה חייבת להכיל לפחות 6 תווים"}), 400

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        reset_rec = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.token      == token,
                PasswordResetToken.used       == False,  # noqa: E712
                PasswordResetToken.expires_at >  now,
            )
            .first()
        )
        if not reset_rec:
            return jsonify({"success": False, "error": "קישור לאיפוס לא תקין או שפג תוקפו"}), 400
        user = db.query(User).filter(User.email == reset_rec.email).first()
        if not user:
            return jsonify({"success": False, "error": "משתמש לא נמצא"}), 404
        user.password_hash = generate_password_hash(password)
        reset_rec.used = True
        db.commit()
        print(f"[Reset] Password updated for {reset_rec.email}")
        return jsonify({"success": True}), 200
    finally:
        db.close()


@auth_bp.route("/api/transcribe", methods=["POST"])
@limiter.limit("10 per minute")
@token_required
def transcribe_audio(user_id: int):
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    audio_file  = request.files["audio"]
    audio_bytes = audio_file.read()
    if len(audio_bytes) < 200:
        return jsonify({"error": "Audio recording is too short or empty"}), 400
    filename     = audio_file.filename or "recording.webm"
    content_type = audio_file.content_type or "audio/webm"
    print(f"[Transcribe] u{user_id}: {len(audio_bytes):,} bytes, mime={content_type}")
    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_bytes, content_type),
            prompt=(
                "שאלה של סטודנט על חומר לימוד אקדמי. "
                "Student question about academic study material in Hebrew or English."
            ),
        )
        text = transcript.text.strip()
        if not text:
            return jsonify({"error": "No speech detected in the recording"}), 422
        print(f"[Transcribe] u{user_id}: '{text[:100]}{'...' if len(text) > 100 else ''}'")
        return jsonify({"text": text}), 200
    except Exception as exc:
        print(f"[Transcribe] u{user_id}: {type(exc).__name__}: {exc}")
        return jsonify({"error": f"Transcription failed: {exc}"}), 500


@auth_bp.route("/api/profile", methods=["GET"])
@token_required
def get_profile(user_id: int):
    from extensions import chroma_client as cc
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        session_count = db.query(sql_func.count(ChatSession.id)).filter(
            ChatSession.user_id == user_id
        ).scalar() or 0
        message_count = (
            db.query(sql_func.count(ChatMessage.id))
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .filter(ChatSession.user_id == user_id)
            .scalar()
        ) or 0
        document_count = 0
        try:
            col = cc.get_collection(f"documents_u{user_id}")
            if col.count() > 0:
                metas = col.get(include=["metadatas"])["metadatas"]
                document_count = len({m.get("source", "") for m in metas if m.get("source")})
        except Exception:
            pass
        return jsonify({
            "id":             user.id,
            "email":          user.email,
            "first_name":     user.first_name,
            "last_name":      user.last_name,
            "created_at":     user.created_at.isoformat(),
            "session_count":  session_count,
            "message_count":  message_count,
            "document_count": document_count,
            "country":        user.country        or '',
            "institution":    user.institution    or '',
            "degree_type":    user.degree_type    or '',
            "primary_major":  user.primary_major  or '',
            "secondary_major": user.secondary_major or '',
            "gender":         user.gender          or '',
        }), 200
    finally:
        db.close()


@auth_bp.route("/api/user/onboarding", methods=["POST"])
@token_required
def user_onboarding(user_id: int):
    data            = request.get_json(silent=True) or {}
    country         = strip_html((data.get("country")         or "").strip())
    institution     = strip_html((data.get("institution")     or "").strip())
    degree_type     = strip_html((data.get("degree_type")     or "").strip())
    primary_major   = strip_html((data.get("primary_major")   or "").strip())
    secondary_major = strip_html((data.get("secondary_major") or "").strip())
    gender          = strip_html((data.get("gender")          or "").strip())

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.country         = country
        user.institution     = institution
        user.degree_type     = degree_type
        user.primary_major   = primary_major
        user.secondary_major = secondary_major if degree_type in ('double', 'specialized') else ''
        user.gender          = gender
        db.commit()
        print(f"[Onboarding] u{user_id}: country={country!r} institution={institution!r} degree={degree_type!r} major={primary_major!r} gender={gender!r}")
        return jsonify({
            "country":         user.country        or '',
            "institution":     user.institution    or '',
            "degree_type":     user.degree_type    or '',
            "primary_major":   user.primary_major  or '',
            "secondary_major": user.secondary_major or '',
            "gender":          user.gender          or '',
        }), 200
    finally:
        db.close()


@auth_bp.route("/api/profile", methods=["PATCH"])
@token_required
def update_profile(user_id: int):
    data       = request.get_json()
    first_name = strip_html((data.get("first_name") or "").strip() if data else "")
    last_name  = strip_html((data.get("last_name")  or "").strip() if data else "")
    if not first_name or not last_name:
        return jsonify({"error": "First and last name are required"}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.first_name = first_name
        user.last_name  = last_name
        db.commit()
        return jsonify({"email": user.email, "first_name": user.first_name, "last_name": user.last_name}), 200
    finally:
        db.close()


@auth_bp.route("/api/refresh-token", methods=["GET"])
@token_required
def refresh_token(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        new_token = _make_token(user.id, user.email, user.role)
        print(f"[refresh-token] user_id={user_id} email={user.email} role={user.role}")
        return jsonify({"token": new_token, "role": user.role, "is_admin": user.role == "admin"}), 200
    finally:
        db.close()


@auth_bp.route("/api/usage", methods=["GET"])
@token_required
def get_usage(user_id: int):
    db = SessionLocal()
    try:
        user = _get_user_refreshed(db, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        db.commit()
        plan = (user.plan_type or "basic").lower()
        return jsonify({
            "plan_type":             plan,
            "subscription_end_date": user.subscription_end_date.isoformat() if user.subscription_end_date else None,
            "uploads_this_month":    user.uploads_this_month,
            "upload_limit":          BASIC_UPLOAD_LIMIT if plan == "basic" else None,
            "questions_this_month":  user.questions_this_month,
            "question_limit":        BASIC_QUESTION_LIMIT if plan == "basic" else None,
        }), 200
    finally:
        db.close()


@auth_bp.route("/api/stats", methods=["GET"])
@token_required
def get_stats(user_id: int):
    from datetime import timedelta
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        doc_count = db.query(sql_func.count(UserDocument.id)).filter(
            UserDocument.user_id == user_id
        ).scalar() or 0
        session_count = db.query(sql_func.count(ChatSession.id)).filter(
            ChatSession.user_id == user_id
        ).scalar() or 0
        msg_count = (
            db.query(sql_func.count(ChatMessage.id))
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .filter(ChatSession.user_id == user_id, ChatMessage.role == "user")
            .scalar() or 0
        )

        since = datetime.utcnow() - timedelta(days=6)
        raw = (
            db.query(
                sql_func.strftime("%Y-%m-%d", ChatMessage.created_at).label("day"),
                sql_func.count(ChatMessage.id).label("cnt"),
            )
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .filter(
                ChatSession.user_id == user_id,
                ChatMessage.role == "user",
                ChatMessage.created_at >= since,
            )
            .group_by("day").order_by("day").all()
        )
        activity_map = {row.day: row.cnt for row in raw}
        today = datetime.utcnow()
        activity = [
            {"date": (today - timedelta(days=d)).strftime("%Y-%m-%d"),
             "messages": activity_map.get((today - timedelta(days=d)).strftime("%Y-%m-%d"), 0)}
            for d in range(6, -1, -1)
        ]

        payload: dict = {
            "documents": doc_count, "sessions": session_count,
            "messages":  msg_count, "activity": activity,
            "is_admin":  user.role == "admin",
        }

        if user.role == "admin":
            payload["total_users"] = db.query(sql_func.count(User.id)).scalar() or 0
            payload["total_docs"]  = (
                db.query(sql_func.count(sql_func.distinct(UserDocument.file_id))).scalar() or 0
            )
            payload["total_messages"] = (
                db.query(sql_func.count(ChatMessage.id))
                .join(ChatSession, ChatSession.id == ChatMessage.session_id)
                .filter(ChatMessage.role == "user", ChatSession.user_id.isnot(None))
                .scalar() or 0
            )
            global_raw = (
                db.query(
                    sql_func.strftime("%Y-%m-%d", ChatMessage.created_at).label("day"),
                    sql_func.count(ChatMessage.id).label("cnt"),
                )
                .filter(ChatMessage.role == "user", ChatMessage.created_at >= since)
                .group_by("day").order_by("day").all()
            )
            g_map = {row.day: row.cnt for row in global_raw}
            payload["global_activity"] = [
                {"date": (today - timedelta(days=d)).strftime("%Y-%m-%d"),
                 "messages": g_map.get((today - timedelta(days=d)).strftime("%Y-%m-%d"), 0)}
                for d in range(6, -1, -1)
            ]

        return jsonify(payload), 200
    finally:
        db.close()

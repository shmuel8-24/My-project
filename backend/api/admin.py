from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify

from api.middleware import admin_required
from extensions import chroma_client
from models import ChatMessage, ChatSession, SessionLocal, User, sql_func

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_list_users(_user_id: int):
    db = SessionLocal()
    try:
        rows = (
            db.query(
                User,
                sql_func.count(sql_func.distinct(ChatSession.id)).label("session_count"),
                sql_func.count(ChatMessage.id).label("message_count"),
            )
            .outerjoin(ChatSession, ChatSession.user_id == User.id)
            .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
            .group_by(User.id)
            .order_by(User.created_at.desc())
            .all()
        )
        users = []
        for row in rows:
            user = row.User
            document_count = 0
            try:
                col = chroma_client.get_collection(f"documents_u{user.id}")
                if col.count() > 0:
                    metas = col.get(include=["metadatas"])["metadatas"]
                    document_count = len({m.get("source", "") for m in metas if m.get("source")})
            except Exception:
                pass
            users.append({
                "id":                    user.id,
                "first_name":            user.first_name,
                "last_name":             user.last_name,
                "email":                 user.email,
                "role":                  user.role,
                "plan_type":             (user.plan_type or "basic").lower(),
                "subscription_end_date": user.subscription_end_date.isoformat() if user.subscription_end_date else None,
                "uploads_this_month":    user.uploads_this_month or 0,
                "questions_this_month":  user.questions_this_month or 0,
                "created_at":            user.created_at.isoformat() if user.created_at else None,
                "session_count":         row.session_count,
                "message_count":         row.message_count,
                "document_count":        document_count,
            })
        return jsonify({"users": users, "total": len(users)}), 200
    finally:
        db.close()


@admin_bp.route("/api/admin/users/<int:target_id>/gift-pro", methods=["PATCH"])
@admin_required
def admin_gift_pro(_caller_id: int, target_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == target_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.plan_type             = "pro"
        user.subscription_end_date = datetime.now(timezone.utc) + timedelta(days=30)
        db.commit()
        return jsonify({"ok": True, "plan_type": user.plan_type,
                        "subscription_end_date": user.subscription_end_date.isoformat()}), 200
    finally:
        db.close()


@admin_bp.route("/api/admin/users/<int:target_id>/gift-semester", methods=["PATCH"])
@admin_required
def admin_gift_semester(_caller_id: int, target_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == target_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.plan_type             = "semester"
        user.subscription_end_date = datetime.now(timezone.utc) + timedelta(days=120)
        db.commit()
        return jsonify({"ok": True, "plan_type": user.plan_type,
                        "subscription_end_date": user.subscription_end_date.isoformat()}), 200
    finally:
        db.close()


@admin_bp.route("/api/admin/users/<int:target_id>/reset-limits", methods=["POST"])
@admin_required
def admin_reset_limits(_caller_id: int, target_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == target_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.uploads_this_month   = 0
        user.upload_month_key     = ""
        user.questions_this_month = 0
        user.question_month_key   = ""
        db.commit()
        return jsonify({"ok": True}), 200
    finally:
        db.close()

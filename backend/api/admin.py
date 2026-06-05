from datetime import datetime, timedelta, timezone

import json

from calendar import monthrange as _monthrange

from dateutil.parser import parse as _parse_iso
from dateutil.relativedelta import relativedelta as _relativedelta
from flask import Blueprint, jsonify, request

from api.middleware import admin_required
from extensions import client as openai_client
from services.rag import get_user_collection
from models import ChatMessage, ChatSession, CfoNotification, Payment, SessionLocal, User, sql_func

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
                col = get_user_collection(user.id)
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


# ── AI Accountant (CFO chat) ──────────────────────────────────────────────────

_CFO_SYSTEM_PROMPT = (
    "You are an expert Chief Financial Officer (CFO) and a Certified Public Accountant "
    "with a BA in Economics and Accounting. You are highly intelligent. "
    "Your expertise includes corporate finance, SaaS metrics, tax planning, and specifically "
    "the regulations for small businesses and 'Osek Patur' (Exempt Dealer) in Israel. "
    "You analyze data, provide financial reports, and give strategic business advice. "
    "Your tone is professional, confident, yet accessible. Answer in Hebrew."
)


@admin_bp.route("/api/admin/ai-accountant", methods=["POST"])
@admin_required
def admin_ai_accountant(_user_id: int):
    data    = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    context = data.get("context") or {}

    if not message:
        return jsonify({"error": "Message required"}), 400

    context_block = ""
    if context:
        context_block = (
            "\n\nנתוני הפלטפורמה הנוכחיים (JSON):\n"
            + json.dumps(context, ensure_ascii=False, indent=2)
        )

    system_content = _CFO_SYSTEM_PROMPT + context_block
    messages = [{"role": "system", "content": system_content}]

    for msg in history[-14:]:
        role    = msg.get("role", "")
        content = (msg.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": message})

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=1500,
            temperature=0.65,
        )
        reply = (completion.choices[0].message.content or "").strip()
        return jsonify({"reply": reply}), 200
    except Exception as exc:
        return jsonify({"error": f"שגיאת AI: {exc}"}), 502


# ═══════════════════════════════════════════════════════════════════════════════
# AI CFO Agent  —  Tool-calling endpoint  (/api/admin/ai-accountant/chat)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Pricing (₪, Israeli market assumptions) ────────────────────────────────────
_PRICE_PRO_MONTHLY      = 49    # ₪49 / month
_PRICE_SEMESTER_TOTAL   = 149   # ₪149 per 4-month semester
_PRICE_SEMESTER_MONTHLY = 37    # ₪149 / 4 ≈ ₪37 / month
_PRICE_MAP              = {"basic": 0, "pro": _PRICE_PRO_MONTHLY, "semester": _PRICE_SEMESTER_MONTHLY}

# ── Israeli tax brackets 2024 (income tax, annual) ────────────────────────────
_INCOME_TAX_BRACKETS = [
    (81_480,       0.10),
    (116_760,      0.14),
    (187_440,      0.20),
    (260_520,      0.31),
    (542_160,      0.35),
    (float("inf"), 0.47),
]

# ── Bituach Leumi (National Insurance) — self-employed 2024 ───────────────────
_BL_THRESHOLD  = 75_972   # ₪6,331 × 12
_BL_RATE_LOW   = 0.0990   # below threshold
_BL_RATE_HIGH  = 0.1690   # above threshold
_HLTH_RATE_LOW = 0.0310
_HLTH_RATE_HIGH= 0.0500

# ── Osek Patur VAT exemption ceiling ─────────────────────────────────────────
_OSEK_PATUR_THRESHOLD = 120_000   # ₪ per year (2024)


# ── datetime helper ────────────────────────────────────────────────────────────

def _naive(dt: datetime | None) -> datetime | None:
    """Strip timezone from a datetime so it matches SQLite's naive storage."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


# ── Tax calculation helpers ────────────────────────────────────────────────────

def _calc_income_tax(annual_income: float) -> dict:
    """Progressive Israeli income tax against 2024 brackets."""
    remaining  = max(0.0, annual_income)
    prev_limit = 0.0
    total      = 0.0
    breakdown  = []
    for limit, rate in _INCOME_TAX_BRACKETS:
        if remaining <= 0:
            break
        taxable = min(remaining, limit - prev_limit)
        tax     = taxable * rate
        breakdown.append({
            "bracket":   f"₪{int(prev_limit):,} – ₪{int(limit):,}" if limit != float("inf") else f"מעל ₪{int(prev_limit):,}",
            "rate_pct":  int(rate * 100),
            "taxable_ils": round(taxable),
            "tax_ils":     round(tax),
        })
        total     += tax
        remaining -= taxable
        prev_limit = limit
    return {"brackets": breakdown, "total_ils": round(total)}


def _calc_bituach_leumi(annual_income: float) -> dict:
    """Bituach Leumi + health insurance for self-employed (Israel 2024)."""
    inc = max(0.0, annual_income)
    low  = min(inc, _BL_THRESHOLD)
    high = max(0.0, inc - _BL_THRESHOLD)
    bl   = low * _BL_RATE_LOW    + high * _BL_RATE_HIGH
    hlth = low * _HLTH_RATE_LOW  + high * _HLTH_RATE_HIGH
    return {
        "national_insurance_ils": round(bl),
        "health_insurance_ils":   round(hlth),
        "total_ils":              round(bl + hlth),
    }


# ══════════════════════════════════════════════════════════════════════════════
# CFO Agent tools — pure Python, no LangChain agent layer
# ══════════════════════════════════════════════════════════════════════════════

##############################################################################
# Tool 1 — Monthly Revenue
##############################################################################

def calculate_monthly_revenue(month: int, year: int) -> str:
    """Calculate actual revenue for a specific month and year from the payments table.

    Queries completed transactions recorded in that calendar month.
    Falls back to subscription-window inference when the payments table is empty.

    Args:
        month: Calendar month number (1–12).
        year:  Four-digit calendar year (e.g., 2025).
    """  # noqa: D205
    from calendar import monthrange as _mr
    try:
        first_day = datetime(year, month, 1)
        last_day  = datetime(year, month, _mr(year, month)[1], 23, 59, 59)
    except ValueError:
        return "תאריך לא תקין — אנא ציין חודש 1–12 ושנה ארבע-ספרתית."

    db = SessionLocal()
    try:
        # ── Primary path: query the payments table ────────────────────────────
        month_payments = db.query(Payment).filter(
            Payment.payment_date >= first_day,
            Payment.payment_date <= last_day,
        ).all()

        if month_payments:
            completed = [p for p in month_payments if p.status == "completed"]
            non_comp  = [p for p in month_payments if p.status != "completed"]

            # Revenue breakdown by plan type
            plan_rev: dict[str, float] = {}
            plan_cnt: dict[str, int]   = {}
            for p in completed:
                pt = p.plan_type or "אחר"
                plan_rev[pt] = plan_rev.get(pt, 0.0) + p.amount
                plan_cnt[pt] = plan_cnt.get(pt, 0)   + 1

            total_ils = sum(p.amount for p in completed)

            breakdown = "\n".join(
                f"  {pt}: {plan_cnt[pt]} עסקאות × ₪{plan_rev[pt]/plan_cnt[pt]:,.0f}"
                f" = ₪{plan_rev[pt]:,.0f}"
                for pt in sorted(plan_rev, key=lambda x: -plan_rev[x])
            ) or "  (אין עסקאות מוצלחות)"

            status_summary = ", ".join(
                f"{s}: {sum(1 for p in non_comp if p.status == s)}"
                for s in ("failed", "refunded", "pending")
                if any(p.status == s for p in non_comp)
            )

            return (
                f"הכנסות חודש {month:02d}/{year} (נתוני עסקאות אמיתיים):\n"
                f"{breakdown}\n"
                f"──\n"
                f"סה\"כ הכנסות:      ₪{total_ils:,.0f}\n"
                f"עסקאות מוצלחות:   {len(completed)}\n"
                + (f"סטטוסים נוספים:    {status_summary}\n" if status_summary else "")
            )

        # ── Fallback: infer from subscription windows ─────────────────────────
        all_users = db.query(User).all()
        if not all_users:
            return f"אין נתוני תשלומים או משתמשים עבור {month}/{year}."

        active_pro = 0
        active_sem = 0
        for u in all_users:
            end = _naive(u.subscription_end_date) if u.subscription_end_date else None
            if end is None:
                continue
            if u.plan_type == "pro" and (end - timedelta(days=30)) <= last_day and end >= first_day:
                active_pro += 1
            elif u.plan_type == "semester" and (end - timedelta(days=120)) <= last_day and end >= first_day:
                active_sem += 1

        rev = active_pro * _PRICE_PRO_MONTHLY + active_sem * _PRICE_SEMESTER_MONTHLY
        if rev == 0:
            return f"לא נמצאו נתוני הכנסות לחודש {month}/{year}."

        return (
            f"הכנסות מוערכות לחודש {month}/{year} (הסקה ממנויים — אין עסקאות):\n"
            f"  Pro: {active_pro} × ₪{_PRICE_PRO_MONTHLY} = ₪{active_pro*_PRICE_PRO_MONTHLY:,}\n"
            f"  Semester: {active_sem} × ₪{_PRICE_SEMESTER_MONTHLY} = ₪{active_sem*_PRICE_SEMESTER_MONTHLY:,}\n"
            f"  סה\"כ: ₪{rev:,}\n"
            "⚠ מומלץ לאכלס את טבלת התשלומים לנתונים מדויקים."
        )
    except Exception as exc:
        return f"שגיאה בחישוב הכנסות: {exc}"
    finally:
        db.close()


##############################################################################
# Tool 2 — New Subscriptions Count
##############################################################################

def get_new_subscriptions_count(start_date: str, end_date: str) -> str:
    """Count new user registrations in a date range with plan-type breakdown.

    Returns the total number of new accounts created between start_date and
    end_date, broken down by plan (Basic/Pro/Semester), and the estimated
    monthly revenue these registrations contribute.

    Args:
        start_date: Period start in ISO format YYYY-MM-DD (e.g., "2025-01-01").
        end_date:   Period end   in ISO format YYYY-MM-DD (e.g., "2025-03-31").
    """  # noqa: D205
    try:
        sd = _parse_iso(start_date).date()
        ed = _parse_iso(end_date).date()
        if sd > ed:
            sd, ed = ed, sd
        sd_naive = datetime(sd.year, sd.month, sd.day)
        ed_naive = datetime(ed.year, ed.month, ed.day, 23, 59, 59)
    except Exception as exc:
        return f"פורמט תאריך שגוי ({exc}). השתמש ב-YYYY-MM-DD."

    db = SessionLocal()
    try:
        users = db.query(User).filter(
            User.created_at.isnot(None),
            User.created_at >= sd_naive,
            User.created_at <= ed_naive,
        ).all()

        if not users:
            return (
                f"לא נמצאו משתמשים חדשים בין {sd} ל-{ed}.\n"
                "ייתכן שהמסד ריק, או שהתאריך מחוץ לטווח הנתונים."
            )

        plan_ct: dict[str, int] = {"basic": 0, "pro": 0, "semester": 0}
        for u in users:
            pt = (u.plan_type or "basic").lower()
            plan_ct[pt] = plan_ct.get(pt, 0) + 1

        paid      = plan_ct["pro"] + plan_ct["semester"]
        est_mrr   = plan_ct["pro"] * _PRICE_PRO_MONTHLY + plan_ct["semester"] * _PRICE_SEMESTER_MONTHLY
        conv_rate = round(paid / len(users) * 100, 1) if users else 0

        return (
            f"משתמשים חדשים בין {sd} ל-{ed}:\n"
            f"• סה\"כ: {len(users):,} רישומים חדשים\n"
            f"  – Basic (חינם): {plan_ct['basic']:,}\n"
            f"  – Pro:          {plan_ct['pro']:,}\n"
            f"  – Semester:     {plan_ct['semester']:,}\n"
            f"• שיעור המרה לתשלום: {conv_rate}%\n"
            f"• MRR מוערך מרישומים אלה: ₪{est_mrr:,}/חודש"
        )
    except Exception as exc:
        return f"שגיאה בשאילתת מנויים: {exc}"
    finally:
        db.close()


##############################################################################
# Tool 3 — Full Platform Financial Summary
##############################################################################

def get_platform_financial_summary() -> str:
    """Return a complete financial snapshot of the platform.

    Covers: total users, plan distribution, conversion rate, current MRR/ARR,
    active subscriber count, Osek Patur VAT threshold status, and engagement.
    Call this for general overview questions about platform health or finances.
    """  # noqa: D205
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            return "מסד הנתונים ריק — אין משתמשים עדיין."

        total     = len(users)
        now_naive = _naive(datetime.now(timezone.utc))

        plan_ct: dict[str, int] = {"basic": 0, "pro": 0, "semester": 0}
        active_pro = 0
        active_sem = 0
        for u in users:
            pt = (u.plan_type or "basic").lower()
            plan_ct[pt] = plan_ct.get(pt, 0) + 1
            end = _naive(u.subscription_end_date) if u.subscription_end_date else None
            if end and end >= now_naive:
                if pt == "pro":
                    active_pro += 1
                elif pt == "semester":
                    active_sem += 1

        paid     = plan_ct["pro"] + plan_ct["semester"]
        mrr      = active_pro * _PRICE_PRO_MONTHLY + active_sem * _PRICE_SEMESTER_MONTHLY
        arr      = mrr * 12
        conv     = round(paid / total * 100, 1) if total else 0
        osek_ok  = arr < _OSEK_PATUR_THRESHOLD

        # Session/message counts
        from sqlalchemy import func as _f
        sess_row = db.query(
            _f.count(ChatSession.id),
            _f.count(ChatMessage.id),
        ).outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id).one()
        total_sessions, total_msgs = sess_row

        # Real payment data from the payments table
        total_revenue_ils = 0.0
        total_txns        = 0
        monthly_rev_ils   = 0.0
        try:
            now_naive_    = _naive(datetime.now(timezone.utc))
            month_start   = now_naive_.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            completed_all = db.query(Payment).filter(Payment.status == "completed").all()
            total_revenue_ils = sum(p.amount for p in completed_all)
            total_txns        = len(completed_all)
            monthly_rev_ils   = sum(p.amount for p in completed_all if p.payment_date >= month_start)
        except Exception:
            pass  # payments table may not exist on fresh installs

        payment_section = (
            f"\n💳 עסקאות (נתונים אמיתיים)\n"
            f"  הכנסות סה\"כ:        ₪{total_revenue_ils:,.0f}\n"
            f"  עסקאות מוצלחות:     {total_txns:,}\n"
            f"  הכנסות חודש זה:     ₪{monthly_rev_ils:,.0f}\n"
        ) if total_txns > 0 else "\n💳 עסקאות: אין נתוני עסקאות (הרץ seed_payments.py לנתוני בדיקה)\n"

        return (
            "סיכום פיננסי של הפלטפורמה:\n\n"
            f"👥 משתמשים\n"
            f"  סה\"כ:              {total:,}\n"
            f"  Basic (חינם):      {plan_ct['basic']:,}\n"
            f"  Pro:               {plan_ct['pro']:,}\n"
            f"  Semester:          {plan_ct['semester']:,}\n"
            f"  שיעור המרה:        {conv}%\n\n"
            f"💰 הכנסות חוזרות (הערכה)\n"
            f"  מנויי Pro פעילים:   {active_pro}\n"
            f"  מנויי Semester:     {active_sem}\n"
            f"  MRR:               ₪{mrr:,}/חודש\n"
            f"  ARR:               ₪{arr:,}/שנה\n"
            + payment_section +
            f"\n📋 עוסק פטור\n"
            f"  {'✅ מתחת לתקרה (₪120,000)' if osek_ok else '⚠️ מעל תקרה — נדרש עוסק מורשה'}\n\n"
            f"📊 פעילות AI\n"
            f"  סשנים:             {total_sessions:,}\n"
            f"  הודעות:            {total_msgs:,}\n"
        )
    except Exception as exc:
        return f"שגיאה בשליפת נתוני הפלטפורמה: {exc}"
    finally:
        db.close()


##############################################################################
# Tool 4 — Israeli Tax & Osek Patur Calculation
##############################################################################

def calculate_tax_obligation(annual_income_ils: float) -> str:
    """Calculate Israeli income-tax + Bituach Leumi for an Osek Patur (exempt dealer).

    Applies 2024 progressive income-tax brackets and self-employed national
    insurance / health-insurance rates, then checks whether the income exceeds
    the Osek Patur VAT exemption ceiling (₪120,000/year).

    Args:
        annual_income_ils: Annual gross income in Israeli Shekels (e.g., 96000.0).
    """  # noqa: D205
    try:
        income = max(0.0, float(annual_income_ils))
    except (TypeError, ValueError):
        return "נא לספק הכנסה שנתית תקינה בשקלים (מספר בלבד)."

    it       = _calc_income_tax(income)
    bl       = _calc_bituach_leumi(income)
    total_tax = it["total_ils"] + bl["total_ils"]
    net      = income - total_tax
    eff_rate = round(total_tax / income * 100, 1) if income else 0
    osek_ok  = income < _OSEK_PATUR_THRESHOLD

    brackets = "\n".join(
        f"    {b['bracket']}: {b['rate_pct']}% × ₪{b['taxable_ils']:,} = ₪{b['tax_ils']:,}"
        for b in it["brackets"] if b["taxable_ils"] > 0
    )

    return (
        f"חישוב חבות מס — הכנסה שנתית: ₪{income:,.0f}\n\n"
        f"סטטוס עוסק פטור:\n"
        f"  {'✅ פטור ממע\"מ (מתחת לתקרה ₪120,000)' if osek_ok else '⚠️ חורג מתקרה — חייב ברישום כעוסק מורשה'}\n\n"
        f"מס הכנסה (מדרגות 2024):\n{brackets}\n"
        f"  סה\"כ מס הכנסה:     ₪{it['total_ils']:,}\n\n"
        f"ביטוח לאומי + בריאות:\n"
        f"  ביטוח לאומי:       ₪{bl['national_insurance_ils']:,}\n"
        f"  ביטוח בריאות:      ₪{bl['health_insurance_ils']:,}\n"
        f"  סה\"כ:              ₪{bl['total_ils']:,}\n\n"
        f"────────────────────────────\n"
        f"  הכנסה ברוטו:       ₪{income:>12,.0f}\n"
        f"  סה\"כ מסים:         ₪{total_tax:>12,.0f}\n"
        f"  הכנסה נטו:          ₪{net:>12,.0f}\n"
        f"  שיעור מס אפקטיבי: {eff_rate}%\n\n"
        "⚠ חישוב תיאורטי בלבד — אינו מחליף ייעוץ רואה חשבון מוסמך."
    )


##############################################################################
# Chart-data helpers — queried directly after the agent produces its text
##############################################################################

_HE_MONTHS = {
    1: "ינו", 2: "פבר", 3: "מרץ", 4: "אפר", 5: "מאי",  6: "יוני",
    7: "יול", 8: "אוג", 9: "ספט", 10: "אוק", 11: "נוב", 12: "דצמ",
}


def _get_revenue_chart_data(months: int = 6) -> list[dict]:
    """Monthly completed-payment totals for the last `months` calendar months."""
    today = _naive(datetime.now(timezone.utc))
    result = []
    db = SessionLocal()
    try:
        for i in range(months - 1, -1, -1):
            target = today - _relativedelta(months=i)
            first  = datetime(target.year, target.month, 1)
            last   = datetime(target.year, target.month,
                              _monthrange(target.year, target.month)[1], 23, 59, 59)
            txns = db.query(Payment).filter(
                Payment.status == "completed",
                Payment.payment_date >= first,
                Payment.payment_date <= last,
            ).all()
            label = f"{_HE_MONTHS[target.month]} '{str(target.year)[2:]}"
            result.append({
                "month":        label,
                "revenue":      round(sum(p.amount for p in txns), 2),
                "transactions": len(txns),
            })
    finally:
        db.close()
    return result


def _get_user_growth_chart_data(months: int = 6) -> list[dict]:
    """Monthly new-user registration counts for the last `months` calendar months."""
    today = _naive(datetime.now(timezone.utc))
    result = []
    db = SessionLocal()
    try:
        for i in range(months - 1, -1, -1):
            target = today - _relativedelta(months=i)
            first  = datetime(target.year, target.month, 1)
            last   = datetime(target.year, target.month,
                              _monthrange(target.year, target.month)[1], 23, 59, 59)
            count = db.query(User).filter(
                User.created_at.isnot(None),
                User.created_at >= first,
                User.created_at <= last,
            ).count()
            label = f"{_HE_MONTHS[target.month]} '{str(target.year)[2:]}"
            result.append({"month": label, "users": count})
    finally:
        db.close()
    return result


def _get_plan_distribution_chart_data() -> list[dict]:
    """Current user-count breakdown by plan type."""
    db = SessionLocal()
    try:
        ct: dict[str, int] = {"basic": 0, "pro": 0, "semester": 0}
        for u in db.query(User).all():
            pt = (u.plan_type or "basic").lower()
            ct[pt] = ct.get(pt, 0) + 1
        return [
            {"plan": "Basic (חינם)", "count": ct["basic"]},
            {"plan": "Pro",          "count": ct["pro"]},
            {"plan": "Semester",     "count": ct["semester"]},
        ]
    finally:
        db.close()


# ── Keyword sets for chart-type detection ────────────────────────────────────

_KW_REVENUE = frozenset([
    "הכנסות", "revenue", "income", "mrr", "arr", "תשלומים", "תשלום",
    "חצי שנה", "חודשים", "ינואר", "פברואר", "מרץ", "דוח הכנסות", "מכירות",
    "הכנסה", "רווח", "כסף",
])
_KW_GROWTH = frozenset([
    "גידול", "growth", "משתמשים חדשים", "רישום", "הצטרפות", "user growth",
    "new users", "registrations", "טרנד", "trend",
])
_KW_PLANS = frozenset([
    "התפלגות", "distribution", "מנויים", "plans", "subscriptions",
    "breakdown", "pro vs", "פיצול", "חלוקה",
])


def _detect_and_build_chart(message: str) -> dict | None:
    """
    Analyse the user's message and return a frontend-ready ChartData dict
    (or None if no chart is appropriate for this query).
    """
    msg = message.lower()

    if any(kw in msg for kw in _KW_REVENUE):
        data = _get_revenue_chart_data(6)
        if not data or not any(r["revenue"] > 0 for r in data):
            return None
        return {
            "type":   "bar",
            "title":  "הכנסות חודשיות — 6 חודשים אחרונים",
            "xKey":   "month",
            "series": [{"key": "revenue", "label": "הכנסות (₪)", "color": "#517B3E"}],
            "data":   data,
        }

    if any(kw in msg for kw in _KW_GROWTH):
        data = _get_user_growth_chart_data(6)
        if not data:
            return None
        return {
            "type":   "area",
            "title":  "גידול משתמשים חדשים — 6 חודשים אחרונים",
            "xKey":   "month",
            "series": [{"key": "users", "label": "משתמשים חדשים", "color": "#6B904A"}],
            "data":   data,
        }

    if any(kw in msg for kw in _KW_PLANS):
        data = _get_plan_distribution_chart_data()
        if not data:
            return None
        return {
            "type":   "bar",
            "title":  "התפלגות משתמשים לפי תוכנית",
            "xKey":   "plan",
            "series": [{"key": "count", "label": "משתמשים", "color": "#517B3E"}],
            "data":   data,
        }

    return None


##############################################################################
# CFO Agent — native OpenAI function calling (zero LangChain agent dependencies)
##############################################################################

_CFO_SYSTEM_PROMPT_AGENT = (
    "אתה רואה חשבון ראשי (CFO) ורואה חשבון מוסמך (CPA) עבור פלטפורמת לימודים ישראלית.\n\n"
    "כללים מחייבים:\n"
    "1. ענה אך ורק בעברית.\n"
    "2. בסס את כל הדוחות הפיננסיים על הנתונים שמגיעים מהכלים שברשותך.\n"
    "3. אל תמציא נתונים פיננסיים. אם ערך אינו זמין, אמור זאת בכנות.\n"
    "4. הצג מספרים עם ₪ וסימני פסיק (₪49,000 לא 49000).\n"
    "5. ספק המלצות אסטרטגיות מבוססות נתונים כשרלוונטי.\n"
    "6. טון: מקצועי, בטוח, ומנגיש — לא יבש."
)

# OpenAI-native tool schemas — no LangChain wrapper needed
_CFO_OPENAI_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "calculate_monthly_revenue",
            "description": (
                "Calculate actual revenue for a specific month and year from the payments table. "
                "Queries completed transactions; falls back to subscription-window inference "
                "when the payments table is empty."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {
                        "type":        "integer",
                        "description": "Calendar month number (1–12).",
                    },
                    "year": {
                        "type":        "integer",
                        "description": "Four-digit calendar year, e.g. 2025.",
                    },
                },
                "required":             ["month", "year"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_new_subscriptions_count",
            "description": (
                "Count new user registrations in a date range with plan-type breakdown "
                "(Basic / Pro / Semester) and the estimated monthly revenue they contribute."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type":        "string",
                        "description": "Period start in ISO format YYYY-MM-DD (e.g. '2025-01-01').",
                    },
                    "end_date": {
                        "type":        "string",
                        "description": "Period end in ISO format YYYY-MM-DD (e.g. '2025-03-31').",
                    },
                },
                "required":             ["start_date", "end_date"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_platform_financial_summary",
            "description": (
                "Return a complete financial snapshot of the platform: total users, "
                "plan distribution, MRR, ARR, active subscribers, Osek Patur VAT status, "
                "and AI session/message counts. Use for general financial overview questions."
            ),
            "parameters": {
                "type":                 "object",
                "properties":           {},
                "required":             [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_tax_obligation",
            "description": (
                "Calculate Israeli income-tax + Bituach Leumi (national insurance) for an "
                "Osek Patur (exempt dealer) given annual gross income. Checks whether "
                "the income exceeds the VAT exemption ceiling (₪120,000/year)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "annual_income_ils": {
                        "type":        "number",
                        "description": "Annual gross income in Israeli Shekels (e.g. 96000.0).",
                    },
                },
                "required":             ["annual_income_ils"],
                "additionalProperties": False,
            },
        },
    },
]

_MAX_CFO_ITERATIONS = 6


def _dispatch_cfo_tool(name: str, args: dict) -> str:
    """Route a tool call by name to the corresponding plain Python function."""
    try:
        if name == "calculate_monthly_revenue":
            return calculate_monthly_revenue(
                month=int(args["month"]),
                year=int(args["year"]),
            )
        if name == "get_new_subscriptions_count":
            return get_new_subscriptions_count(
                start_date=str(args["start_date"]),
                end_date=str(args["end_date"]),
            )
        if name == "get_platform_financial_summary":
            return get_platform_financial_summary()
        if name == "calculate_tax_obligation":
            return calculate_tax_obligation(
                annual_income_ils=float(args["annual_income_ils"]),
            )
        return f"כלי לא ידוע: {name}"
    except Exception as exc:
        return f"שגיאה בביצוע '{name}': {exc}"


def _run_cfo_agent(messages: list[dict]) -> str:
    """Run the CFO tool-calling loop using the native OpenAI client.

    Args:
        messages: [{role, content}] — conversation history + current user message.
                  System message is prepended here; do NOT include it in the input.

    Returns:
        The final Hebrew text response from the CFO agent.
    """
    full_messages: list[dict] = [
        {"role": "system", "content": _CFO_SYSTEM_PROMPT_AGENT},
        *messages,
    ]

    for _iteration in range(_MAX_CFO_ITERATIONS):
        resp   = openai_client.chat.completions.create(
            model       = "gpt-4o-mini",
            messages    = full_messages,
            tools       = _CFO_OPENAI_TOOLS,
            tool_choice = "auto",
            temperature = 0.30,
            max_tokens  = 1500,
        )
        msg = resp.choices[0].message

        # ── No tool calls → final answer ──────────────────────────────────────
        if not msg.tool_calls:
            return (msg.content or "").strip()

        # ── Append assistant message with pending tool calls ──────────────────
        full_messages.append({
            "role":       "assistant",
            "content":    msg.content,   # may be None
            "tool_calls": [
                {
                    "id":       tc.id,
                    "type":     "function",
                    "function": {
                        "name":      tc.function.name,
                        "arguments": tc.function.arguments,  # already a JSON string
                    },
                }
                for tc in msg.tool_calls
            ],
        })

        # ── Execute each tool call and feed results back ──────────────────────
        for tc in msg.tool_calls:
            try:
                args   = json.loads(tc.function.arguments)
                result = _dispatch_cfo_tool(tc.function.name, args)
            except Exception as exc:
                result = f"שגיאה בביצוע הכלי '{tc.function.name}': {exc}"

            full_messages.append({
                "role":         "tool",
                "tool_call_id": tc.id,
                "content":      str(result),
            })

    # Max iterations reached — one final call without tools to synthesise
    final = openai_client.chat.completions.create(
        model       = "gpt-4o-mini",
        messages    = full_messages,
        temperature = 0.30,
        max_tokens  = 800,
    )
    return (final.choices[0].message.content or "לא התקבלה תגובה מהסוכן.").strip()


##############################################################################
# Agentic endpoint  POST /api/admin/ai-accountant/chat
##############################################################################

@admin_bp.route("/api/admin/ai-accountant/chat", methods=["POST"])
@admin_required
def admin_ai_accountant_chat(_user_id: int):
    """CFO agent — direct OpenAI function calling over the live database.

    Request  body: { "message": "...", "history": [{role, content}] }
    Response JSON: { "response": "...", "status": "success" | "error" }
    """
    data    = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []

    if not message:
        return jsonify({"response": "נא לספק הודעה.", "status": "error"}), 400

    # Build plain OpenAI message dicts from history, then append current message
    messages: list[dict] = []
    for msg in history[-8:]:
        role    = msg.get("role", "")
        content = (msg.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    try:
        response = _run_cfo_agent(messages)
        if not response:
            response = "לא התקבלה תגובה מהסוכן. נסה שוב."

        chart_data = None
        try:
            chart_data = _detect_and_build_chart(message)
        except Exception:
            pass

        return jsonify({
            "response":  response,
            "text":      response,
            "chartData": chart_data,
            "status":    "success",
        }), 200

    except Exception as exc:
        return jsonify({
            "response": f"מצטער, אירעה שגיאה בעיבוד הבקשה: {exc}",
            "text":     f"מצטער, אירעה שגיאה בעיבוד הבקשה: {exc}",
            "chartData": None,
            "status":   "error",
        }), 502


# ═══════════════════════════════════════════════════════════════════════════════
# Proactive CFO Notifications — API endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@admin_bp.route("/api/admin/notifications", methods=["GET"])
@admin_required
def get_cfo_notifications(_user_id: int):
    db = SessionLocal()
    try:
        notifs = (
            db.query(CfoNotification)
            .order_by(CfoNotification.is_read.asc(), CfoNotification.created_at.desc())
            .limit(50)
            .all()
        )
        return jsonify({
            "notifications": [
                {
                    "id":         n.id,
                    "title":      n.title,
                    "message":    n.message,
                    "type":       n.type,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                    "is_read":    n.is_read,
                }
                for n in notifs
            ],
            "unread_count": sum(1 for n in notifs if not n.is_read),
        }), 200
    finally:
        db.close()


@admin_bp.route("/api/admin/notifications/<int:notif_id>/read", methods=["POST"])
@admin_required
def mark_cfo_notification_read(_user_id: int, notif_id: int):
    db = SessionLocal()
    try:
        n = db.query(CfoNotification).filter(CfoNotification.id == notif_id).first()
        if not n:
            return jsonify({"error": "Not found"}), 404
        n.is_read = True
        db.commit()
        return jsonify({"ok": True}), 200
    finally:
        db.close()


@admin_bp.route("/api/admin/notifications/read-all", methods=["POST"])
@admin_required
def mark_all_cfo_notifications_read(_user_id: int):
    db = SessionLocal()
    try:
        db.query(CfoNotification).filter(
            CfoNotification.is_read == False  # noqa: E712
        ).update({"is_read": True})
        db.commit()
        return jsonify({"ok": True}), 200
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Proactive CFO Scheduler — background financial health checks
# ═══════════════════════════════════════════════════════════════════════════════

def _maybe_create_notification(
    db,
    title: str,
    message: str,
    notif_type: str,
    dedup_days: int = 7,
) -> None:
    """Insert a CfoNotification only when no recent unread duplicate exists."""
    cutoff  = _naive(datetime.now(timezone.utc)) - timedelta(days=dedup_days)
    existing = db.query(CfoNotification).filter(
        CfoNotification.title    == title,
        CfoNotification.is_read  == False,   # noqa: E712
        CfoNotification.created_at >= cutoff,
    ).first()
    if existing:
        return
    db.add(CfoNotification(title=title, message=message, type=notif_type))


def analyze_financial_health() -> None:
    """Daily background job: check financial KPIs and write proactive CFO alerts."""
    print("[CFO Scheduler] Running financial health check …")
    now = _naive(datetime.now(timezone.utc))
    db  = SessionLocal()
    try:
        # ── A) Osek Patur limit check ─────────────────────────────────────────
        ytd_start   = datetime(now.year, 1, 1)
        ytd_revenue = sum(
            p.amount for p in db.query(Payment).filter(
                Payment.status       == "completed",
                Payment.payment_date >= ytd_start,
                Payment.payment_date <= now,
            ).all()
        )
        threshold_warn     = _OSEK_PATUR_THRESHOLD * 0.90   # 108,000
        threshold_critical = _OSEK_PATUR_THRESHOLD * 0.95   # 114,000

        if ytd_revenue >= threshold_warn:
            pct   = round(ytd_revenue / _OSEK_PATUR_THRESHOLD * 100, 1)
            level = "critical" if ytd_revenue >= threshold_critical else "warning"
            _maybe_create_notification(
                db,
                title   = "⚠️ התקרבות לתקרת עוסק פטור",
                message = (
                    f"ההכנסות מתחילת השנה עומדות על ₪{ytd_revenue:,.0f} "
                    f"({pct}% מתקרת ₪{_OSEK_PATUR_THRESHOLD:,}). "
                    "עלייה נוספת בהכנסות תחייב רישום כעוסק מורשה וגביית מע\"מ. "
                    "מומלץ להתייעץ עם רואה חשבון בהקדם."
                ),
                notif_type = level,
                dedup_days = 7,
            )

        # ── B) Active-subscription churn check ───────────────────────────────
        subs_now      = db.query(User).filter(
            User.plan_type != "basic",
            User.subscription_end_date.isnot(None),
            User.subscription_end_date >= now,
        ).count()
        week_ago      = now - timedelta(days=7)
        subs_week_ago = db.query(User).filter(
            User.plan_type != "basic",
            User.subscription_end_date.isnot(None),
            User.subscription_end_date >= week_ago,
        ).count()

        if subs_week_ago > 0:
            drop_pct = (subs_week_ago - subs_now) / subs_week_ago * 100
            if drop_pct >= 20:
                _maybe_create_notification(
                    db,
                    title   = "📉 ירידה חדה במנויים פעילים",
                    message = (
                        f"מספר המנויים הפעילים ירד מ-{subs_week_ago} ל-{subs_now} "
                        f"(ירידה של {drop_pct:.1f}% בשבוע האחרון). "
                        "ייתכן גל ביטולים — מומלץ לבדוק את קצב החידושים ולשקול פעולת שימור."
                    ),
                    notif_type = "warning",
                    dedup_days = 3,
                )

        # ── C) Revenue growth milestone (positive signal) ─────────────────────
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end   = this_month_start - timedelta(seconds=1)
        last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        this_rev = sum(
            p.amount for p in db.query(Payment).filter(
                Payment.status       == "completed",
                Payment.payment_date >= this_month_start,
            ).all()
        )
        last_rev = sum(
            p.amount for p in db.query(Payment).filter(
                Payment.status       == "completed",
                Payment.payment_date >= last_month_start,
                Payment.payment_date <= last_month_end,
            ).all()
        )

        if last_rev > 0 and this_rev > 0 and this_rev >= last_rev * 1.20:
            growth_pct = round((this_rev - last_rev) / last_rev * 100, 1)
            _maybe_create_notification(
                db,
                title   = "📈 צמיחה בהכנסות החודש",
                message = (
                    f"ההכנסות החודש עומדות על ₪{this_rev:,.0f} — "
                    f"גידול של {growth_pct}% לעומת החודש הקודם (₪{last_rev:,.0f}). "
                    "מומלץ לנצל את התנע לקמפיין גיוס משתמשים."
                ),
                notif_type = "info",
                dedup_days = 7,
            )

        db.commit()
        print("[CFO Scheduler] Financial health check complete.")
    except Exception as exc:
        print(f"[CFO Scheduler] ERROR: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def start_cfo_scheduler() -> None:
    """Start the APScheduler background scheduler for daily CFO health checks.

    Guards against Flask debug-mode reloader creating duplicate scheduler processes.
    """
    import os
    flask_env = os.environ.get("FLASK_ENV", "production")
    # In debug mode the werkzeug reloader forks a child; only the child has WERKZEUG_RUN_MAIN='true'.
    # We want to skip starting the scheduler in the parent (reloader) process.
    if flask_env == "development" and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return

    from apscheduler.schedulers.background import BackgroundScheduler
    import atexit

    scheduler = BackgroundScheduler(daemon=True)

    # Daily cron at 09:00 UTC
    scheduler.add_job(
        analyze_financial_health,
        trigger    = "cron",
        hour       = 9,
        minute     = 0,
        id         = "cfo_daily_health_check",
        replace_existing = True,
        name       = "CFO Daily Financial Health Check",
    )

    # One-time startup run after 30 s so alerts appear immediately
    scheduler.add_job(
        analyze_financial_health,
        trigger    = "date",
        run_date   = datetime.now() + timedelta(seconds=30),
        id         = "cfo_startup_check",
        name       = "CFO Startup Check",
    )

    scheduler.start()
    atexit.register(lambda: scheduler.shutdown(wait=False))
    print("[CFO Scheduler] Started — daily check at 09:00 UTC, startup check in 30 s.")

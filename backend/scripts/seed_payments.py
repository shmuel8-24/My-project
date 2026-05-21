#!/usr/bin/env python3
"""
seed_payments.py — Populate the payments table with realistic test data.

Run from the backend/ directory:
    python scripts/seed_payments.py           # skip if data already exists
    python scripts/seed_payments.py --force   # wipe seed rows and re-seed
"""
import argparse
import os
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from models import Payment, SessionLocal, User, _Base, _db_engine

_Base.metadata.create_all(bind=_db_engine)

# ── Seed identity ─────────────────────────────────────────────────────────────
# All seed users have this domain — lets the script identify and clean them up.
_SEED_DOMAIN = "@unote.seed"

# ── Test-user roster ──────────────────────────────────────────────────────────
_USERS = [
    ("אברהם", "כהן",    "test.avraham" + _SEED_DOMAIN),
    ("שרה",   "לוי",    "test.sarah"   + _SEED_DOMAIN),
    ("יוסף",  "מזרחי",  "test.yosef"   + _SEED_DOMAIN),
    ("רחל",   "פרץ",    "test.rachel"  + _SEED_DOMAIN),
    ("דוד",   "ביטון",  "test.david"   + _SEED_DOMAIN),
    ("מרים",  "אוחיון", "test.miriam"  + _SEED_DOMAIN),
    ("יעקב",  "שמש",    "test.yaakov"  + _SEED_DOMAIN),
    ("לאה",   "בן-דוד", "test.leah"    + _SEED_DOMAIN),
    ("משה",   "גולן",   "test.moshe"   + _SEED_DOMAIN),
    ("דינה",  "אזולאי", "test.dina"    + _SEED_DOMAIN),
]

# ── Payment scenarios ─────────────────────────────────────────────────────────
# (days_ago, amount_ils, plan_type, status, description)

_SCENARIOS = [
    # 0: Steady monthly subscriber — 5 payments over 5 months
    {
        "user_idx": 0, "plan_type": "pro", "sub_days": 23,
        "payments": [
            (7,   29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (37,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (67,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (97,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (127, 29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
        ],
    },
    # 1: Two full semesters
    {
        "user_idx": 1, "plan_type": "semester", "sub_days": 60,
        "payments": [
            (14,  100.0, "semester", "completed", "מנוי סמסטר — U-Note"),
            (134, 100.0, "semester", "completed", "מנוי סמסטר — U-Note"),
        ],
    },
    # 2: Started monthly, upgraded to semester
    {
        "user_idx": 2, "plan_type": "semester", "sub_days": 95,
        "payments": [
            (155, 29.0,  "monthly",  "completed", "מנוי חודשי — U-Note"),
            (125, 29.0,  "monthly",  "completed", "מנוי חודשי — U-Note"),
            (95,  29.0,  "monthly",  "completed", "מנוי חודשי — U-Note"),
            (22,  100.0, "semester", "completed", "שדרוג למנוי סמסטר — U-Note"),
        ],
    },
    # 3: Monthly subscriber with a failed attempt
    {
        "user_idx": 3, "plan_type": "pro", "sub_days": 28,
        "payments": [
            (9,   29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (39,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (69,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (6,   29.0, "monthly",  "failed",    "חיוב נכשל — כרטיס פג תוקף"),
        ],
    },
    # 4: Semester purchase + refund on monthly add-on
    {
        "user_idx": 4, "plan_type": "semester", "sub_days": 45,
        "payments": [
            (50,  100.0, "semester", "completed", "מנוי סמסטר — U-Note"),
            (4,   29.0,  "monthly",  "refunded",  "זיכוי — ביטול עסקה"),
        ],
    },
    # 5: Heavy monthly user — 6 consecutive payments
    {
        "user_idx": 5, "plan_type": "pro", "sub_days": 20,
        "payments": [
            (5,   29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (35,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (65,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (95,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (125, 29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (155, 29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
        ],
    },
    # 6: Old semester, renewed with monthly
    {
        "user_idx": 6, "plan_type": "pro", "sub_days": 14,
        "payments": [
            (142, 100.0, "semester", "completed", "מנוי סמסטר — U-Note"),
            (43,  29.0,  "monthly",  "completed", "מנוי חודשי — U-Note"),
            (13,  29.0,  "monthly",  "completed", "מנוי חודשי — חידוש"),
        ],
    },
    # 7: Recent new student, semester plan
    {
        "user_idx": 7, "plan_type": "semester", "sub_days": 112,
        "payments": [
            (10, 100.0, "semester", "completed", "מנוי סמסטר — הצטרפות חדשה"),
        ],
    },
    # 8: Monthly, 3 payments, one pending
    {
        "user_idx": 8, "plan_type": "pro", "sub_days": 27,
        "payments": [
            (4,  29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (34, 29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (64, 29.0, "monthly",  "completed", "מנוי חודשי — U-Note"),
            (2,  29.0, "monthly",  "pending",   "חיוב ממתין לאישור"),
        ],
    },
    # 9: Two semesters — loyal annual customer
    {
        "user_idx": 9, "plan_type": "semester", "sub_days": 80,
        "payments": [
            (30,  100.0, "semester", "completed", "מנוי סמסטר — U-Note"),
            (150, 100.0, "semester", "completed", "מנוי סמסטר — חידוש שנתי"),
        ],
    },
]


def _days_ago(n: int, jitter: int = 3) -> datetime:
    """UTC naive datetime N days ago with small random jitter."""
    delta = n + random.randint(-jitter, jitter)
    return (datetime.now(timezone.utc) - timedelta(days=max(0, delta))).replace(tzinfo=None)


def seed(force: bool = False) -> None:
    db = SessionLocal()
    try:
        # ── Optionally wipe seed rows ─────────────────────────────────────────
        if force:
            seed_emails = [email for _, _, email in _USERS]
            seed_users  = db.query(User).filter(User.email.in_(seed_emails)).all()
            seed_ids    = [u.id for u in seed_users]
            if seed_ids:
                deleted = db.query(Payment).filter(Payment.user_id.in_(seed_ids)).delete(
                    synchronize_session=False
                )
                db.query(User).filter(User.id.in_(seed_ids)).delete(
                    synchronize_session=False
                )
                db.commit()
                print(f"  ↻ Removed {deleted} existing seed payments and {len(seed_ids)} seed users.")

        # ── Skip if already seeded ────────────────────────────────────────────
        existing = db.query(User).filter(User.email.like("%" + _SEED_DOMAIN)).count()
        if existing > 0 and not force:
            print(f"  ⓘ Seed data already present ({existing} seed users). Use --force to re-seed.")
            return

        # ── Create test users ─────────────────────────────────────────────────
        pw_hash = bcrypt.hashpw(b"SeedPass@1234", bcrypt.gensalt(rounds=4)).decode()

        users: list[User] = []
        for first, last, email in _USERS:
            u = User(
                email=email,
                password_hash=pw_hash,
                first_name=first,
                last_name=last,
                role="user",
                plan_type="basic",
            )
            db.add(u)
        db.flush()   # assign IDs without committing

        users = (
            db.query(User)
            .filter(User.email.in_([e for _, _, e in _USERS]))
            .order_by(User.id)
            .all()
        )

        # ── Create payments ────────────────────────────────────────────────────
        payment_count = 0
        now_naive     = datetime.now(timezone.utc).replace(tzinfo=None)

        for scenario in _SCENARIOS:
            u = users[scenario["user_idx"]]

            # Update the user's plan to match the scenario
            u.plan_type = scenario["plan_type"]
            if scenario["plan_type"] in ("pro", "semester"):
                u.subscription_end_date = now_naive + timedelta(days=scenario["sub_days"])

            for days, amount, plan_type, status, desc in scenario["payments"]:
                p = Payment(
                    user_id=u.id,
                    amount=amount,
                    currency="ILS",
                    plan_type=plan_type,
                    status=status,
                    payment_date=_days_ago(days),
                    description=desc,
                )
                db.add(p)
                payment_count += 1

        db.commit()

        # ── Summary ───────────────────────────────────────────────────────────
        completed = sum(
            1 for sc in _SCENARIOS
            for _, _, _, status, _ in sc["payments"]
            if status == "completed"
        )
        other = payment_count - completed
        total_ils = sum(
            amount for sc in _SCENARIOS
            for _, amount, _, status, _ in sc["payments"]
            if status == "completed"
        )

        print(f"  ✅ Created {len(users)} test users.")
        print(f"  ✅ Created {payment_count} transactions "
              f"({completed} completed, {other} failed/refunded/pending).")
        print(f"  💰 Total seeded revenue: ₪{total_ils:,.0f}")
        print()
        print("  Test login  →  any '@unote.seed' email / password: SeedPass@1234")

    except Exception as exc:
        db.rollback()
        print(f"  ❌ Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed U-Note payments test data")
    parser.add_argument("--force", action="store_true",
                        help="Delete existing seed data before re-seeding")
    args = parser.parse_args()

    print("── U-Note payment seed ──────────────────────────────────")
    seed(force=args.force)
    print("─────────────────────────────────────────────────────────")

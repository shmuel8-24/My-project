#!/usr/bin/env python3
"""
One-shot CLI: promote a user to the 'admin' role directly in chat.db.

Usage:
    python scripts/make_admin.py <email>

Run this once per user you want to make an admin.
After running, the user must log out and log back in so their JWT
picks up the new role=admin claim.

The ADMIN_EMAIL env-var in .env provides the same promotion
automatically on every login — this script is useful for promoting
existing accounts without requiring a re-login cycle first.
"""

import sys
import os

# Resolve paths relative to the project root (one level above scripts/)
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DB   = os.path.join(_ROOT, "data", "chat.db")


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python scripts/make_admin.py <email>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()

    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        print("✗  sqlalchemy not installed. Run: pip install sqlalchemy")
        sys.exit(1)

    if not os.path.exists(_DB):
        print(f"✗  Database not found at {_DB}")
        print("   Start the Flask server at least once to create it.")
        sys.exit(1)

    engine = create_engine(f"sqlite:///{_DB}", connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, email, role FROM users WHERE email = :email"),
            {"email": email},
        ).fetchone()

        if not row:
            print(f"✗  No user found with email: {email}")
            print("   Register or log in first, then re-run this script.")
            sys.exit(1)

        user_id, user_email, current_role = row
        if current_role == "admin":
            print(f"✓  {user_email} (id={user_id}) is already an admin — nothing to do.")
            sys.exit(0)

        conn.execute(
            text("UPDATE users SET role = 'admin' WHERE email = :email"),
            {"email": email},
        )
        conn.commit()

    print(f"✓  {user_email} (id={user_id}) promoted from '{current_role}' → 'admin'.")
    print("   The user must log out and log back in to receive a new JWT with role=admin.")


if __name__ == "__main__":
    main()

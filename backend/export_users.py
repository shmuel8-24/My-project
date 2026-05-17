import sqlite3
import csv
from pathlib import Path

DB_PATH  = Path(__file__).parent / "data" / "chat.db"
CSV_PATH = Path(__file__).parent / "users_export.csv"

with sqlite3.connect(DB_PATH) as conn:
    rows = conn.execute("SELECT id, email FROM users ORDER BY id").fetchall()

with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["id", "email"])
    writer.writerows(rows)

print(f"Exported {len(rows)} user(s) → {CSV_PATH}")

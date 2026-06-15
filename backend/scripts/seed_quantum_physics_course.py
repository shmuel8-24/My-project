#!/usr/bin/env python3
"""
seed_quantum_physics_course.py — Create/update the "Quantum Physics 1" course and
seed its Mastery Skill Tree with the official 5-topic syllabus for a specific user.

Run from the backend/ directory:
    python scripts/seed_quantum_physics_course.py <user_email>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import CustomCourse, SessionLocal, SyllabusTopicMastery, User, _Base, _db_engine

_Base.metadata.create_all(bind=_db_engine)

COURSE_NAME = "פיזיקה קוונטית 1"

# Ordered syllabus topics — teaching order drives the Skill Tree's unlock sequence.
TOPICS = [
    "משוואת שרדינגר ופונקציית הגל",
    "משוואת שרדינגר הבלתי תלויה בזמן",
    "הפורמליזם המתמטי של תורת הקוונטים",
    "מכניקה קוונטית בשלושה ממדים",
    "חלקיקים זהים",
]

SYLLABUS_TEXT = f"""סילבוס הקורס: {COURSE_NAME}

תוכן הקורס מחולק לפרקים הבאים, על פי סדר ההוראה:

1. {TOPICS[0]} — דואליות גל-חלקיק, פונקציית הגל ומשמעותה ההסתברותית, ומשוואת שרדינגר התלויה בזמן.
2. {TOPICS[1]} — מצבים סטציונריים, בארות פוטנציאל, מחסומי פוטנציאל וטונלינג קוונטי.
3. {TOPICS[2]} — מרחבי הילברט, אופרטורים הרמיטיים, ערכים עצמיים ורישום דיראק (Bra-Ket).
4. {TOPICS[3]} — האטום ההידרוגני, תנע זוויתי מסלולי והרמוניות כדוריות.
5. {TOPICS[4]} — בוזונים ופרמיונים, עקרון האיסור של פאולי וסימטריזציה של פונקציות גל.
"""


def seed(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"  ❌ No user found with email {email!r}")
            return

        course = db.query(CustomCourse).filter(
            CustomCourse.user_id == user.id,
            CustomCourse.course_name == COURSE_NAME,
        ).first()

        if course:
            course.full_syllabus_text = SYLLABUS_TEXT
            print(f"  ↻ Updated existing course {COURSE_NAME!r} (id={course.id}).")
        else:
            course = CustomCourse(
                user_id=user.id,
                course_name=COURSE_NAME,
                lecturer_name=None,
                has_tirgul=False,
                ta_name=None,
                semester="a",
                color="#7c3aed",
                full_syllabus_text=SYLLABUS_TEXT,
            )
            db.add(course)
            print(f"  ✅ Created course {COURSE_NAME!r}.")
        db.commit()

        # Replace any previously-extracted skill-tree rows with the exact syllabus topics.
        deleted = db.query(SyllabusTopicMastery).filter(
            SyllabusTopicMastery.user_id == user.id,
            SyllabusTopicMastery.course_name == COURSE_NAME,
        ).delete(synchronize_session=False)
        if deleted:
            print(f"  ↻ Removed {deleted} existing skill-tree topic row(s).")

        for i, topic in enumerate(TOPICS):
            db.add(SyllabusTopicMastery(
                user_id=user.id,
                course_name=COURSE_NAME,
                topic=topic,
                topic_order=i,
                mastery_pct=0.0,
                quiz_count=0,
            ))
        db.commit()
        print(f"  ✅ Seeded {len(TOPICS)} skill-tree topics for {COURSE_NAME!r}.")

    except Exception as exc:
        db.rollback()
        print(f"  ❌ Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else os.getenv("ADMIN_EMAIL", "")
    if not email:
        print("Usage: python scripts/seed_quantum_physics_course.py <user_email>")
        sys.exit(1)

    print("── U-Note Quantum Physics 1 seed ────────────────────────")
    seed(email)
    print("──────────────────────────────────────────────────────────")

from sqlalchemy import text
from sqlalchemy.orm import Session


def list_my_teach_logs(db: Session, user_id: int) -> list[dict]:
    """Every (subject, topic, grade) the teacher has logged, nested
    subject -> topics -> grades, with the matching QA (question/answer/
    difficulty) joined in for display."""
    log_rows = db.execute(
        text("""
            SELECT DISTINCT ON (tl.subject_id, tl.topic_id, tl.grade_id)
                g.grade_id, g.grade_name, s.subject_id, s.subject_name,
                t.topic_id, t.topic_name, tl.date_created
            FROM teach_logs tl
            JOIN grades g ON g.grade_id = tl.grade_id
            JOIN subjects s ON s.subject_id = tl.subject_id
            JOIN topics t ON t.topic_id = tl.topic_id
            WHERE tl.user_id = :uid AND tl.is_active = TRUE
            ORDER BY tl.subject_id, tl.topic_id, tl.grade_id, tl.date_created DESC
        """),
        {"uid": user_id},
    ).fetchall()

    if not log_rows:
        return []

    logs = [dict(row._mapping) for row in log_rows]
    topic_ids = [row["topic_id"] for row in logs]
    grade_ids = [row["grade_id"] for row in logs]

    qa_rows = db.execute(
        text("""
            SELECT topic_id, grade_id, qa_id, question_type, question, answer, options, difficulty_level
            FROM qa
            WHERE topic_id = ANY(:topic_ids) AND grade_id = ANY(:grade_ids) AND is_active = TRUE
            ORDER BY difficulty_level DESC, qa_id
        """),
        {"topic_ids": topic_ids, "grade_ids": grade_ids},
    ).fetchall()

    qa_by_topic_grade: dict[tuple[int, int], list[dict]] = {}
    for row in qa_rows:
        r = dict(row._mapping)
        key = (r["topic_id"], r["grade_id"])
        qa_by_topic_grade.setdefault(key, []).append({
            "qa_id": r["qa_id"],
            "question_type": r["question_type"],
            "question": r["question"],
            "answer": r["answer"],
            "options": r["options"],
            "difficulty_level": r["difficulty_level"],
        })

    subjects: dict[int, dict] = {}
    for log in logs:
        subject_entry = subjects.setdefault(log["subject_id"], {
            "subject_id": log["subject_id"],
            "subject_name": log["subject_name"],
            "topics": [],
        })
        topic_entry = next(
            (t for t in subject_entry["topics"] if t["topic_id"] == log["topic_id"]), None
        )
        if topic_entry is None:
            topic_entry = {"topic_id": log["topic_id"], "topic_name": log["topic_name"], "grades": []}
            subject_entry["topics"].append(topic_entry)
        topic_entry["grades"].append({
            "grade_id": log["grade_id"],
            "grade_name": log["grade_name"],
            "qa_items": qa_by_topic_grade.get((log["topic_id"], log["grade_id"]), []),
        })

    for subject_entry in subjects.values():
        subject_entry["topics"].sort(key=lambda t: t["topic_name"])
        for topic_entry in subject_entry["topics"]:
            topic_entry["grades"].sort(key=lambda g: g["grade_name"])

    return sorted(subjects.values(), key=lambda s: s["subject_name"])

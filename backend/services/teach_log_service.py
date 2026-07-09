from sqlalchemy import text
from sqlalchemy.orm import Session


def _scope_clause(db: Session, *, customer_id, user_id, is_school_admin, is_system_admin,
                   is_student, is_parent) -> tuple[str, dict] | None:
    """Returns (sql_clause, params) restricting which teach_logs rows are
    visible for this caller, or None if there's nothing to scope to (e.g. a
    student/parent with no active grade to match)."""
    if is_school_admin or is_system_admin:
        # Whole school, every teacher — admins browse everything taught.
        return "tl.customer_id = :cid", {"cid": customer_id}

    if is_student:
        # Doesn't matter which teacher taught it — only the student's own
        # current grade(s)/section(s) matter.
        grade_ids = [r.grade_id for r in db.execute(
            text("""
                SELECT DISTINCT sg.grade_id
                FROM student_grades sg
                JOIN students st ON st.student_id = sg.student_id
                WHERE st.user_id = :uid AND st.is_active = TRUE AND sg.is_active = TRUE
            """),
            {"uid": user_id},
        ).fetchall()]
        if not grade_ids:
            return None
        return "tl.customer_id = :cid AND tl.grade_id = ANY(:gids)", {"cid": customer_id, "gids": grade_ids}

    if is_parent:
        # Scoped to children active at THIS school for now — a parent whose
        # children span multiple schools/customers will need cross-customer
        # aggregation as a later feature, not handled here.
        grade_ids = [r.grade_id for r in db.execute(
            text("""
                SELECT DISTINCT sg.grade_id
                FROM student_grades sg
                JOIN students st ON st.student_id = sg.student_id
                JOIN parents p ON p.student_id = st.student_id
                WHERE p.user_id = :uid AND p.is_active = TRUE
                  AND st.is_active = TRUE AND st.customer_id = :cid
                  AND sg.is_active = TRUE
            """),
            {"uid": user_id, "cid": customer_id},
        ).fetchall()]
        if not grade_ids:
            return None
        return "tl.customer_id = :cid AND tl.grade_id = ANY(:gids)", {"cid": customer_id, "gids": grade_ids}

    # Plain teacher — only what they personally logged.
    return "tl.customer_id = :cid AND tl.user_id = :uid", {"cid": customer_id, "uid": user_id}


def list_subjects_taught(
    db: Session, *, customer_id: int, user_id: int,
    is_school_admin: bool = False, is_system_admin: bool = False,
    is_student: bool = False, is_parent: bool = False,
) -> list[dict]:
    """Every (subject, topic, grade) taught, nested subject -> topics ->
    grades, with the matching QA (question/answer/difficulty) joined in.
    Scope depends on caller: admins see the whole school, teachers see only
    what they logged, students see their own grade/section regardless of
    teacher, parents see their children's grade/section at this school."""
    scope = _scope_clause(
        db, customer_id=customer_id, user_id=user_id,
        is_school_admin=is_school_admin, is_system_admin=is_system_admin,
        is_student=is_student, is_parent=is_parent,
    )
    if scope is None:
        return []
    scope_sql, params = scope

    log_rows = db.execute(
        text(f"""
            SELECT tl.subject_id, s.subject_name, s.icon_key, tl.topic_id, t.topic_name,
                   tl.grade_id, g.grade_name, tl.section, tl.date_created::date AS log_date
            FROM teach_logs tl
            JOIN grades g ON g.grade_id = tl.grade_id
            JOIN subjects s ON s.subject_id = tl.subject_id
            JOIN topics t ON t.topic_id = tl.topic_id
            WHERE {scope_sql} AND tl.is_active = TRUE
        """),
        params,
    ).fetchall()

    if not log_rows:
        return []

    logs = [dict(row._mapping) for row in log_rows]
    topic_ids = list({row["topic_id"] for row in logs})
    grade_ids = list({row["grade_id"] for row in logs})

    qa_rows = db.execute(
        text("""
            SELECT topic_id, grade_id, qa_id, question_type, question, answer, options,
                   difficulty_level, edited_by_name, edited_by_school
            FROM qa
            WHERE topic_id = ANY(:topic_ids) AND grade_id = ANY(:grade_ids) AND is_active = TRUE
            ORDER BY qa_id
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
            "edited_by_name": r["edited_by_name"],
            "edited_by_school": r["edited_by_school"],
        })

    subjects: dict[int, dict] = {}
    topics_by_id: dict[tuple[int, int], dict] = {}
    grades_by_id: dict[tuple[int, int], dict] = {}
    for log in logs:
        subject_entry = subjects.setdefault(log["subject_id"], {
            "subject_id": log["subject_id"],
            "subject_name": log["subject_name"],
            "icon_key": log["icon_key"],
            "topics": [],
        })
        topic_key = (log["subject_id"], log["topic_id"])
        topic_entry = topics_by_id.get(topic_key)
        if topic_entry is None:
            topic_entry = {"topic_id": log["topic_id"], "topic_name": log["topic_name"], "grades": []}
            topics_by_id[topic_key] = topic_entry
            subject_entry["topics"].append(topic_entry)

        grade_key = (log["topic_id"], log["grade_id"])
        grade_entry = grades_by_id.get(grade_key)
        if grade_entry is None:
            grade_entry = {
                "grade_id": log["grade_id"],
                "grade_name": log["grade_name"],
                "sections": set(),
                # One entry per teach_log row (date + section) — the calendar
                # view groups these by day client-side; everything else here
                # only needs the deduped "sections" set above.
                "logs": [],
                "qa_items": qa_by_topic_grade.get(grade_key, []),
            }
            grades_by_id[grade_key] = grade_entry
            topic_entry["grades"].append(grade_entry)
        if log["section"]:
            grade_entry["sections"].add(log["section"])
        grade_entry["logs"].append({"date": log["log_date"].isoformat(), "section": log["section"]})

    for subject_entry in subjects.values():
        subject_entry["topics"].sort(key=lambda t: t["topic_name"])
        for topic_entry in subject_entry["topics"]:
            topic_entry["grades"].sort(key=lambda g: g["grade_name"])
            for grade_entry in topic_entry["grades"]:
                grade_entry["sections"] = sorted(grade_entry["sections"])
                grade_entry["logs"].sort(key=lambda l: l["date"])

    return sorted(subjects.values(), key=lambda s: s["subject_name"])

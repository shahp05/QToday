import random

from sqlalchemy import text
from sqlalchemy.orm import Session

from config.app_config import get_setting
from errors.app_error import AppError
from errors.error_codes import ErrorCode


def resolve_authorized_student_id(
    db: Session, *, claims: dict, requested_student_id: int | None,
) -> int:
    """A student can only ever see their own data — requested_student_id is
    optional for them (defaults to self) but must match if given. A school
    admin/teacher (same role in this app, see routers/teach_logs.py) or
    system admin can look up any student, but only within their own school
    (system admin: any school) — this is what makes the endpoint reusable
    for the later "teacher views a student/grade" feature without changing
    its shape. Parent access is deferred (see teach_log_service._scope_clause
    for the same note on the read side)."""
    if claims.get("is_student"):
        own = db.execute(
            text("SELECT student_id FROM students WHERE user_id = :uid AND is_active = TRUE"),
            {"uid": claims["user_id"]},
        ).first()
        if own is None:
            raise AppError(ErrorCode.STUDENT_NOT_FOUND)
        if requested_student_id is not None and requested_student_id != own.student_id:
            raise AppError(ErrorCode.AUTH_FORBIDDEN)
        return own.student_id

    if claims.get("is_school_admin") or claims.get("is_system_admin"):
        if requested_student_id is None:
            raise AppError(ErrorCode.VALIDATION_ERROR)
        if claims.get("is_system_admin"):
            row = db.execute(
                text("SELECT student_id FROM students WHERE student_id = :sid AND is_active = TRUE"),
                {"sid": requested_student_id},
            ).first()
        else:
            row = db.execute(
                text("""
                    SELECT student_id FROM students
                    WHERE student_id = :sid AND customer_id = :cid AND is_active = TRUE
                """),
                {"sid": requested_student_id, "cid": claims.get("customer_id")},
            ).first()
        if row is None:
            raise AppError(ErrorCode.STUDENT_NOT_FOUND)
        return requested_student_id

    raise AppError(ErrorCode.AUTH_FORBIDDEN)


def get_student_quiz_progress(db: Session, *, student_id: int) -> dict:
    """Per-topic quiz stats for one student: their own average score, the
    best score across every student at the same school for that topic, the
    date they last played it, and how many attempts they've made. Only
    quizzes that have actually been scored (total_score IS NOT NULL) count
    toward averages — an in-progress/unscored quiz shouldn't drag down or
    inflate either number. Percentages are rounded to the nearest whole
    number since that's all the progress bars display."""
    customer_row = db.execute(
        text("SELECT customer_id FROM students WHERE student_id = :sid"),
        {"sid": student_id},
    ).first()
    customer_id = customer_row.customer_id if customer_row else None

    own_rows = db.execute(
        text("""
            SELECT topic_id, subject_id,
                   ROUND(AVG(total_score / total_marks * 100)) AS avg_pct,
                   MAX(date_created)::date AS last_played,
                   COUNT(*) AS attempts
            FROM quizzes
            WHERE student_id = :sid AND is_active = TRUE AND total_score IS NOT NULL
            GROUP BY topic_id, subject_id
        """),
        {"sid": student_id},
    ).fetchall()

    max_by_topic: dict[int, float] = {}
    if customer_id is not None and own_rows:
        topic_ids = [r.topic_id for r in own_rows]
        max_rows = db.execute(
            text("""
                SELECT q.topic_id, ROUND(MAX(q.total_score / q.total_marks * 100)) AS max_pct
                FROM quizzes q
                JOIN students st ON st.student_id = q.student_id
                WHERE st.customer_id = :cid AND q.topic_id = ANY(:tids)
                  AND q.is_active = TRUE AND q.total_score IS NOT NULL
                GROUP BY q.topic_id
            """),
            {"cid": customer_id, "tids": topic_ids},
        ).fetchall()
        max_by_topic = {r.topic_id: float(r.max_pct) for r in max_rows}

    topics = [
        {
            "topic_id": r.topic_id,
            "subject_id": r.subject_id,
            "student_avg_pct": float(r.avg_pct),
            "max_score_pct": max_by_topic.get(r.topic_id, float(r.avg_pct)),
            "last_played": r.last_played.isoformat(),
            "attempts": r.attempts,
        }
        for r in own_rows
    ]

    return {"topics": topics}


def get_quiz_questions(db: Session, *, claims: dict, topic_id: int, grade_id: int) -> dict:
    """A random sample of verified questions for a (topic, grade) a student
    is quizzing on. Deliberately re-scoped here rather than reusing
    teach_log_service.get_topic_grade_qa: that function is teacher-facing and
    doesn't filter is_verified, and it also returns 'answer' — neither of
    which should ever reach a student before they submit. Visibility is
    proven the same way as elsewhere: a teach_logs row showing this topic was
    actually taught to the student's own grade."""
    if not claims.get("is_student"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)

    own = db.execute(
        text("SELECT student_id FROM students WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": claims["user_id"]},
    ).first()
    if own is None:
        raise AppError(ErrorCode.STUDENT_NOT_FOUND)

    visible = db.execute(
        text("""
            SELECT 1
            FROM teach_logs tl
            JOIN student_grades sg ON sg.grade_id = tl.grade_id AND sg.is_active = TRUE
            WHERE sg.student_id = :sid AND tl.is_active = TRUE
              AND tl.topic_id = :topic_id AND tl.grade_id = :grade_id
            LIMIT 1
        """),
        {"sid": own.student_id, "topic_id": topic_id, "grade_id": grade_id},
    ).first()
    if not visible:
        raise AppError(ErrorCode.TEACH_LOG_NOT_FOUND)

    qa_rows = db.execute(
        text("""
            SELECT qa_id, question_type, question, options, difficulty_level
            FROM qa
            WHERE topic_id = :topic_id AND grade_id = :grade_id
              AND is_active = TRUE AND is_verified = TRUE
        """),
        {"topic_id": topic_id, "grade_id": grade_id},
    ).fetchall()

    # Same (count, marks-per-question) settings quizzes.total_marks is
    # documented as being snapshotted from — see schema.sql's QUIZZES
    # comment — so the number shown here always matches what a submitted
    # quiz would actually be scored out of.
    count = get_setting("default_questions_per_quiz", 20)
    marks_per_qa = get_setting("default_marks_per_qa", 5)
    selected = random.sample(qa_rows, min(count, len(qa_rows)))
    questions = [
        {
            "qa_id": r.qa_id,
            "question_type": r.question_type,
            "question": r.question,
            "options": r.options,
            "difficulty_level": r.difficulty_level,
        }
        for r in selected
    ]
    return {"questions": questions, "total_marks": len(questions) * marks_per_qa}

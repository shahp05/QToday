"""Shared helpers for scoping a plain teacher's (not admin's) access to
another user's data down to only what they've actually taught. A school
admin (is_school_admin) bypasses all of this and sees everything at their
own school — callers decide that branch themselves and simply don't apply
these helpers for admins."""

from sqlalchemy import text
from sqlalchemy.orm import Session


def teacher_scope_filter(*, customer_id: int, user_id: int, quiz_alias: str = "quizzes") -> tuple[str, dict]:
    """SQL fragment (starting with 'AND') plus bound params, restricting rows
    from a `quizzes`-shaped table to only the (subject_id, grade_id) pairs
    this specific teacher has personally logged teaching at this school.
    Insert directly into a WHERE clause of a query that selects from
    `quizzes` (aliased via quiz_alias if not selected unqualified). Only
    meant for a plain teacher caller — a school admin should pass no filter
    at all (None) and see every student's data at their school."""
    return (
        f"""AND EXISTS (
            SELECT 1 FROM teach_logs tl
            WHERE tl.customer_id = :scope_cid AND tl.user_id = :scope_uid
              AND tl.subject_id = {quiz_alias}.subject_id
              AND tl.grade_id = {quiz_alias}.grade_id
              AND tl.is_active = TRUE
        )""",
        {"scope_cid": customer_id, "scope_uid": user_id},
    )


def any_teacher_taught(
    db: Session, *, customer_id: int, subject_id: int, topic_id: int, grade_id: int | None = None,
) -> bool:
    """True if a teach_logs row exists for this subject+topic at this
    school — grade_id omitted (None) means any grade qualifies (school
    admins, per spec, may edit/discard any question of any subject-topic at
    their school); grade_id given restricts to that exact grade, since a
    plain teacher may only edit/discard content taught in that grade — by
    themselves OR a colleague/substitute, so this is deliberately not
    scoped to a specific user_id."""
    conditions = "customer_id = :cid AND subject_id = :sub AND topic_id = :top AND is_active = TRUE"
    params = {"cid": customer_id, "sub": subject_id, "top": topic_id}
    if grade_id is not None:
        conditions += " AND grade_id = :grd"
        params["grd"] = grade_id
    return db.execute(text(f"SELECT 1 FROM teach_logs WHERE {conditions} LIMIT 1"), params).first() is not None

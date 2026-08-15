from sqlalchemy import text
from sqlalchemy.orm import Session


def get_my_teachers(db: Session, user_id: int, customer_id: int | None = None) -> dict:
    """Any active, customer-attached user (sys admin, teacher, student, or
    parent) can see the school's teacher roster — it's directory
    information, not sensitive to any one role. A system admin (no
    customer_id) gets nothing, same as before. Write actions on this data
    (upload, super-admin assignment) are gated separately and far more
    strictly, in routers/teachers.py — this is read-only.

    customer_id, when given, is used directly instead of resolving it from
    user_id — this is how a parent (who has none of their own) sees their
    selected ward's school's roster; the caller resolves it via
    session_service.resolve_parent_ward_customer_id first."""
    if customer_id is None:
        user = db.execute(
            text("SELECT customer_id FROM users WHERE user_id = :uid AND is_active = TRUE"),
            {"uid": user_id},
        ).fetchone()
        if user is None or user.customer_id is None:
            return {"teachers": []}
        customer_id = user.customer_id

    rows = db.execute(
        text(
            "SELECT user_id, org_id, user_name AS name, email_id AS email, "
            "is_sysadm AS is_super_admin, file_url AS photo_url "
            "FROM users WHERE customer_id = :cid AND (is_adm = TRUE OR is_sysadm = TRUE) AND is_active = TRUE "
            # A future-session upload stages new hires with start_date set
            # to when they actually begin (see teachers_upload_service.py)
            # — invisible in the live roster until that date arrives.
            "AND (start_date IS NULL OR start_date <= CURRENT_DATE) "
            "ORDER BY user_name"
        ),
        {"cid": customer_id},
    ).fetchall()

    return {"teachers": [dict(row._mapping) for row in rows]}


def get_teachers_for_session(db: Session, customer_id: int, session_id: int) -> dict:
    """Teachers who logged at least one subject in this (past) session,
    derived from teach_logs rather than the current live roster. Unlike
    get_my_teachers, this correctly includes someone who has since left
    (deactivated) and excludes someone who joined afterward — teachers
    themselves carry no session_id (only teach_logs rows do), so "who
    taught in session X" can only ever be answered from the log, not from
    who's an active account today."""
    rows = db.execute(
        text(
            "SELECT DISTINCT u.user_id, u.org_id, u.user_name AS name, u.email_id AS email, "
            "u.is_sysadm AS is_super_admin, u.file_url AS photo_url "
            "FROM teach_logs tl "
            "JOIN users u ON u.user_id = tl.user_id "
            "WHERE tl.customer_id = :cid AND tl.session_id = :sid AND tl.is_active = TRUE "
            "ORDER BY name"
        ),
        {"cid": customer_id, "sid": session_id},
    ).fetchall()

    return {"teachers": [dict(row._mapping) for row in rows]}

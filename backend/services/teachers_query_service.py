from sqlalchemy import text
from sqlalchemy.orm import Session


def get_my_teachers(db: Session, user_id: int) -> dict:
    """Only a school admin (is_sysadm + customer_id set) can see the
    school's teacher roster — mirrors students_query_service.get_my_students."""
    user = db.execute(
        text("SELECT customer_id, is_sysadm FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).fetchone()
    if user is None or not user.is_sysadm or user.customer_id is None:
        return {"teachers": []}

    rows = db.execute(
        text(
            "SELECT user_id, org_id, user_name AS name, email_id AS email, "
            "is_sysadm AS is_super_admin, file_url AS photo_url "
            "FROM users WHERE customer_id = :cid AND (is_adm = TRUE OR is_sysadm = TRUE) AND is_active = TRUE "
            "ORDER BY user_name"
        ),
        {"cid": user.customer_id},
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

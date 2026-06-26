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
            "SELECT user_id, org_id, user_name AS name, email_id AS email "
            "FROM users WHERE customer_id = :cid AND is_adm = TRUE AND is_active = TRUE "
            "ORDER BY user_name"
        ),
        {"cid": user.customer_id},
    ).fetchall()

    return {"teachers": [dict(row._mapping) for row in rows]}

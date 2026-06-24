from sqlalchemy import text
from sqlalchemy.orm import Session

_STUDENT_COLUMNS = (
    "s.student_id, u.org_id, u.user_name AS name, u.file_url AS photo_url, "
    "s.customer_id, s.board_id, s.is_active, c.customer_name, c.customer_acronym"
)
_STUDENT_JOINS = (
    "FROM students s "
    "JOIN users u ON u.user_id = s.user_id "
    "LEFT JOIN customers c ON c.customer_id = s.customer_id "
)


def get_my_students(db: Session, user_id: int) -> dict:
    """Branches on the caller's role (re-checked fresh from the DB, not the
    JWT) to decide which students they may see:
      - parent: their active wards, regardless of which school each is at
      - school admin (is_sysadm + customer_id set): the whole school roster
      - student: only their own record
      - anything else (teacher/is_adm, or a platform-level admin) -> none yet.
        The teacher case needs a subjects/topics-authored table that
        doesn't exist yet — deferred.
    """
    user = db.execute(
        text("SELECT customer_id, is_student, is_parent, is_sysadm, is_adm FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).fetchone()
    if user is None:
        return {"students": [], "student_grades": []}

    if user.is_parent:
        rows = db.execute(
            text(
                f"SELECT DISTINCT {_STUDENT_COLUMNS} "
                f"{_STUDENT_JOINS}"
                "JOIN parents p ON p.student_id = s.student_id "
                "WHERE p.user_id = :uid AND p.is_active = TRUE AND s.is_active = TRUE"
            ),
            {"uid": user_id},
        ).fetchall()
    elif user.is_sysadm and user.customer_id is not None:
        rows = db.execute(
            text(
                f"SELECT {_STUDENT_COLUMNS} {_STUDENT_JOINS} "
                "WHERE s.customer_id = :cid AND s.is_active = TRUE"
            ),
            {"cid": user.customer_id},
        ).fetchall()
    elif user.is_student:
        rows = db.execute(
            text(
                f"SELECT {_STUDENT_COLUMNS} {_STUDENT_JOINS} "
                "WHERE u.user_id = :uid AND s.is_active = TRUE"
            ),
            {"uid": user_id},
        ).fetchall()
    else:
        rows = []

    students = [dict(row._mapping) for row in rows]
    if not students:
        return {"students": [], "student_grades": []}

    student_ids = [s["student_id"] for s in students]
    grade_rows = db.execute(
        text(
            "SELECT sg.student_grade_id, sg.student_id, sg.grade_id, g.grade_name, sg.section, sg.is_active "
            "FROM student_grades sg "
            "JOIN grades g ON g.grade_id = sg.grade_id "
            "WHERE sg.student_id = ANY(:ids) AND sg.is_active = TRUE"
        ),
        {"ids": student_ids},
    ).fetchall()
    student_grades = [dict(row._mapping) for row in grade_rows]

    parent_rows = db.execute(
        text(
            "SELECT p.student_id, u.email_id, u.user_name AS name "
            "FROM parents p "
            "JOIN users u ON u.user_id = p.user_id "
            "WHERE p.student_id = ANY(:ids) AND p.is_active = TRUE AND u.is_active = TRUE "
            "ORDER BY p.student_id, p.date_created"
        ),
        {"ids": student_ids},
    ).fetchall()
    parents = [dict(row._mapping) for row in parent_rows]

    return {"students": students, "student_grades": student_grades, "parents": parents}

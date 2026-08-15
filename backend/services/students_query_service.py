from sqlalchemy import text
from sqlalchemy.orm import Session

_STUDENT_COLUMNS = (
    "s.student_id, u.org_id, u.user_name AS name, u.file_url AS photo_url, "
    "s.customer_id, s.board_id, s.is_active, c.customer_name, c.customer_acronym, "
    "b.board_code, b.board_name, co.country_name"
)
_STUDENT_JOINS = (
    "FROM students s "
    "JOIN users u ON u.user_id = s.user_id "
    "LEFT JOIN customers c ON c.customer_id = s.customer_id "
    # Board is the student's own (s.board_id), not the school's — a
    # customer's students aren't guaranteed to share one board. Country
    # has no per-student column, so it comes from the student's school.
    "LEFT JOIN boards b ON b.board_id = s.board_id "
    "LEFT JOIN countries co ON co.country_id = c.country_id "
)


def get_my_students(db: Session, user_id: int, session_id: int | None = None) -> dict:
    """Branches on the caller's role (re-checked fresh from the DB, not the
    JWT) to decide which students they may see:
      - parent: their active wards, regardless of which school each is at
      - a school's own staff (is_sysadm or is_adm — sys admin or teacher —
        + customer_id set): the whole school roster. Not narrowed to "just
        this teacher's classes" — that needs a subjects/topics-authored
        table that doesn't exist yet, so for now every staff member of a
        school sees the same full roster, same as the sys admin always has.
      - student: only their own record
      - anything else (a platform-level admin) -> none.

    session_id, when given (routers/students.py only ever passes this for
    an is_school_admin caller, pre-validated against that customer's real
    current/future session), scopes the student_grades lookup to that
    EXACT session instead of "whichever is current" — this is how an admin
    browses a pre-staged future roster without it ever appearing in the
    default (session_id=None) view everyone else uses."""
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
    elif (user.is_sysadm or user.is_adm) and user.customer_id is not None:
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
    if session_id is not None:
        # Explicit session (admin browsing a specific — possibly future —
        # session): strict equality. Both current and future session ids
        # always carry a real, non-null session_id post-bootstrap, so no
        # NULL fallback is needed here, unlike the default branch below.
        grade_rows = db.execute(
            text(
                "SELECT sg.student_grade_id, sg.student_id, sg.grade_id, g.grade_name, sg.section, sg.is_active "
                "FROM student_grades sg "
                "JOIN grades g ON g.grade_id = sg.grade_id "
                "WHERE sg.student_id = ANY(:ids) AND sg.is_active = TRUE AND sg.session_id = :sid"
            ),
            {"ids": student_ids, "sid": session_id},
        ).fetchall()
    else:
        # A parent's wards can span multiple schools (see docstring), each
        # with its own current session — so this can't use session_service's
        # current_session_clause (a single customer_id's current session); it
        # joins each student's OWN customer's current session_id instead. The
        # OR branch matches a customer that's never bootstrapped session
        # tracking at all (no academic_sessions row yet), mirroring
        # session_service.current_session_clause's None-vs-real-id resolution.
        grade_rows = db.execute(
            text(
                "SELECT sg.student_grade_id, sg.student_id, sg.grade_id, g.grade_name, sg.section, sg.is_active "
                "FROM student_grades sg "
                "JOIN grades g ON g.grade_id = sg.grade_id "
                "JOIN students st ON st.student_id = sg.student_id "
                "LEFT JOIN academic_sessions cur ON cur.customer_id = st.customer_id AND cur.is_current = TRUE "
                "WHERE sg.student_id = ANY(:ids) AND sg.is_active = TRUE "
                "AND (sg.session_id = cur.session_id OR (cur.session_id IS NULL AND sg.session_id IS NULL))"
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

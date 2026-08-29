from sqlalchemy import text
from sqlalchemy.orm import Session

from services.session_service import get_current_session_id


def _resolve_own_student_id(db: Session, user_id: int) -> int | None:
    row = db.execute(
        text("SELECT student_id FROM students WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).first()
    return row.student_id if row else None


def _learner_grade_id(db: Session, *, student_id: int, session_id: int | None) -> int | None:
    """The student's grade_id as of the given session — None (the live
    current session, for get_my_teachers) or a real session_id (for
    get_teachers_for_session, resolving their historical grade as of that
    past session rather than today's)."""
    session_sql = "sg.session_id IS NULL" if session_id is None else "sg.session_id = :sid"
    params = {"stid": student_id}
    if session_id is not None:
        params["sid"] = session_id
    row = db.execute(
        text(f"SELECT sg.grade_id FROM student_grades sg WHERE sg.student_id = :stid AND sg.is_active = TRUE AND {session_sql} LIMIT 1"),
        params,
    ).first()
    return row.grade_id if row else None


def _attach_subjects_taught(db: Session, *, customer_id: int, teachers: list[dict], session_id: int | None) -> None:
    """Mutates each teacher dict in place, adding a 'subjects' list: every
    subject this teacher has logged in this session, each carrying every
    distinct grade it was taught in — per spec, a teacher who taught the
    same subject across several grades shows all of them, not just one.
    session_id follows the same convention as _learner_grade_id: None means
    the live current session (or pre-tracking legacy rows if the customer
    has never bootstrapped one), a real id means that exact session."""
    if not teachers:
        return
    user_ids = [t["user_id"] for t in teachers]
    session_sql = "tl.session_id IS NULL" if session_id is None else "tl.session_id = :sid"
    params = {"cid": customer_id, "uids": user_ids}
    if session_id is not None:
        params["sid"] = session_id
    rows = db.execute(
        text(f"""
            SELECT DISTINCT tl.user_id, tl.subject_id, s.subject_name, tl.grade_id, g.grade_name
            FROM teach_logs tl
            JOIN subjects s ON s.subject_id = tl.subject_id
            JOIN grades g ON g.grade_id = tl.grade_id
            WHERE tl.customer_id = :cid AND tl.user_id = ANY(:uids) AND tl.is_active = TRUE AND {session_sql}
        """),
        params,
    ).fetchall()

    subjects_by_user: dict[int, dict[int, dict]] = {}
    for r in rows:
        subject_map = subjects_by_user.setdefault(r.user_id, {})
        entry = subject_map.setdefault(r.subject_id, {"subject_id": r.subject_id, "subject_name": r.subject_name, "grades": []})
        entry["grades"].append({"grade_id": r.grade_id, "grade_name": r.grade_name})

    for t in teachers:
        subjects = sorted(subjects_by_user.get(t["user_id"], {}).values(), key=lambda s: s["subject_name"])
        for s in subjects:
            s["grades"].sort(key=lambda g: g["grade_name"])
        t["subjects"] = subjects


_TEACHER_COLUMNS = (
    "u.user_id, u.org_id, u.user_name AS name, u.email_id AS email, "
    "u.is_sysadm AS is_super_admin, u.file_url AS photo_url"
)


def get_my_teachers(
    db: Session, user_id: int, customer_id: int | None = None, *,
    is_student: bool = False, is_parent: bool = False, ward_student_id: int | None = None,
) -> dict:
    """Staff (sys admin or plain teacher) see every teacher at the school —
    directory information for them, not sensitive to any one role. A
    student or parent sees a subset instead: only teachers who've taught
    their own (or their ward's) grade in the live current session, PLUS
    every super-user teacher regardless of grade (per spec — a super-user
    is a school-wide contact, always shown). Each returned teacher also
    carries the subjects/grades they've taught this session — see
    _attach_subjects_taught. Write actions on this data (upload, super-admin
    assignment) are gated separately and far more strictly, in
    routers/teachers.py — this is read-only.

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

    current_session_id = get_current_session_id(db, customer_id)

    if is_student or is_parent:
        student_id = ward_student_id if is_parent else _resolve_own_student_id(db, user_id)
        if student_id is None:
            return {"teachers": []}
        grade_id = _learner_grade_id(db, student_id=student_id, session_id=current_session_id)

        session_sql = "tl.session_id IS NULL" if current_session_id is None else "tl.session_id = :sid"
        params = {"cid": customer_id}
        if current_session_id is not None:
            params["sid"] = current_session_id

        if grade_id is None:
            # No resolvable grade for this student/session (e.g. their
            # roster row is staged for a different session) — there's
            # nothing to match a grade-taught teacher against, but every
            # super-user is still a school-wide contact and must still show
            # (see the docstring above) — never fall back to an empty list.
            grade_clause = "u.is_sysadm = TRUE"
        else:
            params["gid"] = grade_id
            grade_clause = f"""
                u.is_sysadm = TRUE
                OR EXISTS (
                    SELECT 1 FROM teach_logs tl
                    WHERE tl.customer_id = :cid AND tl.user_id = u.user_id AND tl.is_active = TRUE
                      AND tl.grade_id = :gid AND {session_sql}
                )
            """

        rows = db.execute(
            text(f"""
                SELECT DISTINCT {_TEACHER_COLUMNS}
                FROM users u
                WHERE u.customer_id = :cid AND (u.is_adm = TRUE OR u.is_sysadm = TRUE) AND u.is_active = TRUE
                  AND (u.start_date IS NULL OR u.start_date <= CURRENT_DATE)
                  AND ({grade_clause})
                ORDER BY name
            """),
            params,
        ).fetchall()
    else:
        rows = db.execute(
            text(
                f"SELECT {_TEACHER_COLUMNS} "
                "FROM users u WHERE u.customer_id = :cid AND (u.is_adm = TRUE OR u.is_sysadm = TRUE) AND u.is_active = TRUE "
                # A future-session upload stages new hires with start_date set
                # to when they actually begin (see teachers_upload_service.py)
                # — invisible in the live roster until that date arrives.
                "AND (u.start_date IS NULL OR u.start_date <= CURRENT_DATE) "
                "ORDER BY name"
            ),
            {"cid": customer_id},
        ).fetchall()

    teachers = [dict(row._mapping) for row in rows]
    _attach_subjects_taught(db, customer_id=customer_id, teachers=teachers, session_id=current_session_id)
    return {"teachers": teachers}


def get_teachers_for_session(
    db: Session, customer_id: int, session_id: int, *,
    is_student: bool = False, is_parent: bool = False, ward_student_id: int | None = None, user_id: int | None = None,
) -> dict:
    """Teachers who logged at least one subject in this (past, or future for
    a school admin) session, derived from teach_logs rather than the current
    live roster. Unlike get_my_teachers, this correctly includes someone who
    has since left (deactivated) and excludes someone who joined afterward —
    teachers themselves carry no session_id (only teach_logs rows do), so
    "who taught in session X" can only ever be answered from the log, not
    from who's an active account today. A student/parent caller is scoped
    to teachers who taught their (or their ward's) grade AS OF THAT SESSION
    (see _learner_grade_id), plus every current super-user regardless of
    grade — is_sysadm is a live/current-only attribute (see TeachersList.jsx),
    so "super-user" here means "is one right now," not "was one back then."
    Also attaches each teacher's subjects/grades for this session — see
    _attach_subjects_taught."""
    is_learner = is_student or is_parent
    grade_id = None
    if is_learner:
        student_id = ward_student_id if is_parent else _resolve_own_student_id(db, user_id)
        if student_id is None:
            return {"teachers": []}
        grade_id = _learner_grade_id(db, student_id=student_id, session_id=session_id)

    if is_learner and grade_id is not None:
        rows = db.execute(
            text(f"""
                SELECT * FROM (
                    SELECT DISTINCT {_TEACHER_COLUMNS}
                    FROM teach_logs tl
                    JOIN users u ON u.user_id = tl.user_id
                    WHERE tl.customer_id = :cid AND tl.session_id = :sid AND tl.is_active = TRUE AND tl.grade_id = :gid
                    UNION
                    SELECT {_TEACHER_COLUMNS}
                    FROM users u
                    WHERE u.customer_id = :cid AND u.is_sysadm = TRUE AND u.is_active = TRUE
                ) t
                ORDER BY name
            """),
            {"cid": customer_id, "sid": session_id, "gid": grade_id},
        ).fetchall()
    elif is_learner:
        # No resolvable grade for this student/session (e.g. their roster
        # row is staged for a different session) — there's nothing to
        # match a grade-taught teacher against, but every super-user is
        # still a school-wide contact and must still show (see the
        # docstring above) — never fall back to an empty list.
        rows = db.execute(
            text(
                f"SELECT {_TEACHER_COLUMNS} "
                "FROM users u WHERE u.customer_id = :cid AND u.is_sysadm = TRUE AND u.is_active = TRUE "
                "ORDER BY name"
            ),
            {"cid": customer_id},
        ).fetchall()
    else:
        rows = db.execute(
            text(
                f"SELECT DISTINCT {_TEACHER_COLUMNS} "
                "FROM teach_logs tl "
                "JOIN users u ON u.user_id = tl.user_id "
                "WHERE tl.customer_id = :cid AND tl.session_id = :sid AND tl.is_active = TRUE "
                "ORDER BY name"
            ),
            {"cid": customer_id, "sid": session_id},
        ).fetchall()

    teachers = [dict(row._mapping) for row in rows]
    _attach_subjects_taught(db, customer_id=customer_id, teachers=teachers, session_id=session_id)
    return {"teachers": teachers}

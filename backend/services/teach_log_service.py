from sqlalchemy import text
from sqlalchemy.orm import Session

from services.session_service import get_current_session_id

# Sentinel passed by the frontend to mean "the legacy/pre-session-tracking
# data" (teach_logs/student_grades rows with session_id IS NULL) — real
# academic_sessions ids are a Postgres serial starting at 1, so 0 can never
# collide with a genuine session_id.
LEGACY_SESSION_SENTINEL = 0


def _session_clause(db: Session, *, customer_id: int, session_id: int | None, alias: str = "tl") -> tuple[str, dict]:
    """Returns a SQL fragment + params scoping a teach_logs- or
    student_grades-shaped table (aliased) to one session. session_id
    omitted (None) -> the customer's current session (which is itself NULL
    for a customer that's never started one — reproducing today's
    fully-unfiltered behavior, since all their rows are also NULL).
    session_id == LEGACY_SESSION_SENTINEL -> explicitly the pre-tracking
    (NULL) rows. Any other session_id -> that exact session."""
    if session_id is None:
        session_id = get_current_session_id(db, customer_id)
    if session_id == LEGACY_SESSION_SENTINEL or session_id is None:
        return f"{alias}.session_id IS NULL", {}
    return f"{alias}.session_id = :sid", {"sid": session_id}


def _scope_clause(db: Session, *, customer_id, user_id, is_school_admin, is_system_admin,
                   session_id: int | None = None) -> tuple[str, dict] | None:
    """Returns (sql_clause, params) restricting which teach_logs rows are
    visible for this caller, or None if there's nothing to scope to. Staff
    only (admin/system admin/plain teacher) — students and parents have
    their own, structurally different path (_learner_subjects_taught):
    a retention-range match against the learner's own grade, not an exact
    teach_logs.grade_id match, and the exposed "grade" is always the
    learner's own, not wherever the topic happened to be taught. See
    list_subjects_taught/get_topic_grade_qa for where that split happens."""
    session_sql, session_params = _session_clause(db, customer_id=customer_id, session_id=session_id)

    if is_school_admin or is_system_admin:
        # Whole school, every teacher — admins browse everything taught.
        return f"tl.customer_id = :cid AND {session_sql}", {"cid": customer_id, **session_params}

    # Plain teacher — every (subject, grade) pair THEY personally logged,
    # but for those specific pairs, every teacher's rows count, not just
    # theirs. This is the substitute-teacher case: if a colleague covers
    # the same subject in the same grade for a few days, their teach_logs
    # (and any QA generated from them) must show up too — per spec's List
    # of Topics condition 1 ("all topics in the subject even if some were
    # taught by another teacher, provided it was in the same grade") and
    # Teach Calendar Log condition 3. A grade the caller never personally
    # taught this subject in still never appears, even if a colleague
    # taught it there — matching "all grades the selected topic was taught
    # BY THE TEACHER in."
    own_pairs = db.execute(
        text(f"""
            SELECT DISTINCT tl.subject_id, tl.grade_id
            FROM teach_logs tl
            WHERE tl.customer_id = :cid AND tl.user_id = :uid AND tl.is_active = TRUE AND {session_sql}
        """),
        {"cid": customer_id, "uid": user_id, **session_params},
    ).fetchall()
    if not own_pairs:
        return None
    subject_ids = [r.subject_id for r in own_pairs]
    pair_grade_ids = [r.grade_id for r in own_pairs]
    return (
        f"""tl.customer_id = :cid AND {session_sql}
            AND (tl.subject_id, tl.grade_id) IN (
                SELECT * FROM unnest((:pair_subject_ids)::int[], (:pair_grade_ids)::int[])
            )""",
        {"cid": customer_id, "pair_subject_ids": subject_ids, "pair_grade_ids": pair_grade_ids, **session_params},
    )


def get_topic_catalog(db: Session, *, customer_id: int, user_id: int) -> list[dict]:
    """Every distinct (subject, topic) this WHOLE school has ever logged —
    not just the caller's own history — so the subject/topic combobox can
    suggest reuse across teachers (e.g. avoid two teachers independently
    creating near-duplicate topic spellings). Deliberately customer-scoped,
    not global: Topic rows themselves carry no school/teacher ownership
    (only teach_logs does), so without this filter "all topics of the
    subject" would mean every school in the country, not just this one.
    Identity only (ids + names) — no QA content, so this stays a small
    payload regardless of question-generation volume."""
    rows = db.execute(
        text("""
            SELECT tl.subject_id, s.subject_name, tl.topic_id, t.topic_name,
                   BOOL_OR(tl.user_id = :uid) AS taught_by_me
            FROM teach_logs tl
            JOIN subjects s ON s.subject_id = tl.subject_id
            JOIN topics t ON t.topic_id = tl.topic_id
            WHERE tl.customer_id = :cid AND tl.is_active = TRUE
            GROUP BY tl.subject_id, s.subject_name, tl.topic_id, t.topic_name
            ORDER BY s.subject_name, t.topic_name
        """),
        {"cid": customer_id, "uid": user_id},
    ).fetchall()
    return [
        {
            "subject_id": r.subject_id,
            "subject_name": r.subject_name,
            "topic_id": r.topic_id,
            "topic_name": r.topic_name,
            "taught_by_me": r.taught_by_me,
        }
        for r in rows
    ]


def _resolve_own_student_row_id(db: Session, user_id: int) -> int | None:
    row = db.execute(
        text("SELECT student_id FROM students WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).first()
    return row.student_id if row else None


def _learner_grade(
    db: Session, *, customer_id: int, student_row_id: int, session_id: int | None = None,
) -> tuple[int, int] | None:
    """(grade_id, grade_name) of the given student's grade IN THE GIVEN
    SESSION — session_id omitted means the current session (the one a
    student/parent ever plays against); an explicit session_id resolves
    their historical grade as of that past session instead, so browsing
    history shows what retention looked like for the grade they actually
    had THEN, not their grade today. None if the student has no active
    grade in that session."""
    sg_session_sql, sg_session_params = _session_clause(
        db, customer_id=customer_id, session_id=session_id, alias="sg",
    )
    row = db.execute(
        text(f"""
            SELECT sg.grade_id, g.grade_name
            FROM student_grades sg
            JOIN grades g ON g.grade_id = sg.grade_id
            WHERE sg.student_id = :sid AND sg.is_active = TRUE AND {sg_session_sql}
            LIMIT 1
        """),
        {"sid": student_row_id, **sg_session_params},
    ).first()
    return (row.grade_id, row.grade_name) if row else None


def _learner_subjects_taught(
    db: Session, *, customer_id: int, student_row_id: int, session_id: int | None = None,
) -> dict:
    """Student/parent view of subjects->topics: unlike the teacher/admin
    tree (grouped by wherever teach_logs actually happened), this shows
    every topic whose retention range (the taught grade through its
    grade_to_id — see grade_rules.py) covers the learner's grade — their
    current grade by default, or their historical grade as of session_id
    when browsing a past session (see _learner_grade) — including topics
    originally taught at an EARLIER grade in a PRIOR session — that's the
    whole point of the grade_to mechanism ("make the topic visible for
    practice by students when they move to the next grade", per spec).
    Any teacher, any session it was taught in — retention is inherently
    cross-session; session_id only changes WHICH of the learner's own
    grades this is evaluated against, not which teach_logs count. Always
    shows the learner's own grade (for that session) as the single grade
    entry per topic (never the grade it was originally taught at), and
    fetches QA at that grade — QA is pre-generated for every grade through
    grade_to specifically so this always has content to show, not just
    for the exact taught grade."""
    grade = _learner_grade(db, customer_id=customer_id, student_row_id=student_row_id, session_id=session_id)
    if grade is None:
        return {"subjects": [], "most_recent": None}
    grade_id, grade_name = grade

    log_rows = db.execute(
        text("""
            SELECT tl.subject_id, s.subject_name, s.icon_key, tl.topic_id, t.topic_name,
                   MAX(tl.date_created)::date AS log_date
            FROM teach_logs tl
            JOIN grades g_taught ON g_taught.grade_id = tl.grade_id
            JOIN grades g_to ON g_to.grade_id = tl.grade_to_id
            JOIN subjects s ON s.subject_id = tl.subject_id
            JOIN topics t ON t.topic_id = tl.topic_id
            WHERE tl.customer_id = :cid AND tl.is_active = TRUE
              AND g_taught.grade_name <= :grade_name AND g_to.grade_name >= :grade_name
            GROUP BY tl.subject_id, s.subject_name, s.icon_key, tl.topic_id, t.topic_name
        """),
        {"cid": customer_id, "grade_name": grade_name},
    ).fetchall()

    if not log_rows:
        return {"subjects": [], "most_recent": None}

    logs = [dict(row._mapping) for row in log_rows]
    topic_ids = list({row["topic_id"] for row in logs})

    count_rows = db.execute(
        text("""
            SELECT topic_id, COUNT(*) AS qa_count
            FROM qa
            WHERE topic_id = ANY(:topic_ids) AND grade_id = :grade_id AND is_active = TRUE
            GROUP BY topic_id
        """),
        {"topic_ids": topic_ids, "grade_id": grade_id},
    ).fetchall()
    qa_count_by_topic = {r.topic_id: r.qa_count for r in count_rows}

    most_recent_log = max(logs, key=lambda l: l["log_date"])
    most_recent_topic_id = most_recent_log["topic_id"]
    most_recent_qa_rows = db.execute(
        text("""
            SELECT qa_id, question_type, question, answer, options,
                   difficulty_level, edited_by_name, edited_by_school
            FROM qa
            WHERE topic_id = :topic_id AND grade_id = :grade_id AND is_active = TRUE
            ORDER BY qa_id
        """),
        {"topic_id": most_recent_topic_id, "grade_id": grade_id},
    ).fetchall()
    most_recent_qa_items = [_qa_row_to_dict(row) for row in most_recent_qa_rows]

    subjects: dict[int, dict] = {}
    for log in logs:
        subject_entry = subjects.setdefault(log["subject_id"], {
            "subject_id": log["subject_id"],
            "subject_name": log["subject_name"],
            "icon_key": log["icon_key"],
            "topics": [],
            "most_recent_topic_id": None,
            "most_recent_grade_id": None,
            "_most_recent_log_date": None,
        })
        if subject_entry["_most_recent_log_date"] is None or log["log_date"] > subject_entry["_most_recent_log_date"]:
            subject_entry["_most_recent_log_date"] = log["log_date"]
            subject_entry["most_recent_topic_id"] = log["topic_id"]
            subject_entry["most_recent_grade_id"] = grade_id
        subject_entry["topics"].append({
            "topic_id": log["topic_id"],
            "topic_name": log["topic_name"],
            "grades": [{
                "grade_id": grade_id,
                "grade_name": grade_name,
                "sections": [],
                "logs": [],
                "qa_count": qa_count_by_topic.get(log["topic_id"], 0),
                "qa_items": most_recent_qa_items if log["topic_id"] == most_recent_topic_id else None,
            }],
        })

    for subject_entry in subjects.values():
        del subject_entry["_most_recent_log_date"]
        subject_entry["topics"].sort(key=lambda t: t["topic_name"])

    return {
        "subjects": sorted(subjects.values(), key=lambda s: s["subject_name"]),
        "most_recent": {
            "subject_id": most_recent_log["subject_id"],
            "topic_id": most_recent_topic_id,
            "grade_id": grade_id,
        },
    }


def _student_belongs_to_customer(db: Session, *, student_id: int, customer_id: int) -> bool:
    row = db.execute(
        text("SELECT 1 FROM students WHERE student_id = :sid AND customer_id = :cid AND is_active = TRUE"),
        {"sid": student_id, "cid": customer_id},
    ).first()
    return row is not None


def _qa_row_to_dict(row) -> dict:
    r = dict(row._mapping)
    return {
        "qa_id": r["qa_id"],
        "question_type": r["question_type"],
        "question": r["question"],
        "answer": r["answer"],
        "options": r["options"],
        "difficulty_level": r["difficulty_level"],
        "edited_by_name": r["edited_by_name"],
        "edited_by_school": r["edited_by_school"],
    }


def list_subjects_taught(
    db: Session, *, customer_id: int, user_id: int,
    is_school_admin: bool = False, is_system_admin: bool = False,
    is_student: bool = False, is_parent: bool = False,
    session_id: int | None = None, student_id: int | None = None,
) -> dict:
    """Every (subject, topic, grade) taught, nested subject -> topics ->
    grades, with a QA *count* per grade — not the full QA text, which would
    mean shipping a caller's entire question history (or, for admins, the
    whole school's) on every page load even though the UI only ever shows
    one grade's questions at a time. Only the most-recently-taught topic's
    FIRST (lowest-numbered) grade gets its QA eagerly attached — matching
    spec's "questions... displayed for the first topic grade by default",
    not whichever grade happened to be logged most recently; everything
    else is loaded on demand via get_topic_grade_qa() as the user clicks
    around.
    Scope depends on caller: admins see the whole school; teachers see every
    (subject, grade) pair they've personally logged, PLUS any colleague's
    log for that same pair (substitute-teacher case — see _scope_clause);
    students/parents see topics whose retention range covers the
    learner's own grade, at any grade/session it was originally taught in
    — see _learner_subjects_taught.
    student_id (students.student_id, not a user_id) means two different
    things depending on caller: for a parent, their selected ward — the
    router has already verified it belongs to them (resolve_session_
    browsing_customer_id) before this ever runs. For staff (admin/system
    admin/plain teacher), an explicit request to view THAT SPECIFIC
    student's own retention-aware view instead of the caller's own taught
    subjects — "Teachers may select a student's subject in the Students
    page" — authorized here by a plain customer_id match, the same access
    staff already has to the whole school's roster (students_query_
    service.get_my_students). Ignored for a plain student caller (always
    their own record, via user_id)."""
    is_staff_caller = not is_student and not is_parent
    if is_student or is_parent or (is_staff_caller and student_id is not None):
        if is_student:
            student_row_id = _resolve_own_student_row_id(db, user_id)
        elif is_staff_caller:
            student_row_id = student_id if _student_belongs_to_customer(
                db, student_id=student_id, customer_id=customer_id,
            ) else None
        else:
            student_row_id = student_id
        if student_row_id is None:
            return {"subjects": [], "most_recent": None}
        return _learner_subjects_taught(
            db, customer_id=customer_id, student_row_id=student_row_id, session_id=session_id,
        )

    scope = _scope_clause(
        db, customer_id=customer_id, user_id=user_id,
        is_school_admin=is_school_admin, is_system_admin=is_system_admin,
        session_id=session_id,
    )
    if scope is None:
        return {"subjects": [], "most_recent": None}
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
        return {"subjects": [], "most_recent": None}

    logs = [dict(row._mapping) for row in log_rows]
    topic_ids = list({row["topic_id"] for row in logs})
    grade_ids = list({row["grade_id"] for row in logs})

    # Counts only — the actual question/answer text is fetched lazily,
    # per (topic, grade), via get_topic_grade_qa().
    count_rows = db.execute(
        text("""
            SELECT topic_id, grade_id, COUNT(*) AS qa_count
            FROM qa
            WHERE topic_id = ANY(:topic_ids) AND grade_id = ANY(:grade_ids) AND is_active = TRUE
            GROUP BY topic_id, grade_id
        """),
        {"topic_ids": topic_ids, "grade_ids": grade_ids},
    ).fetchall()
    qa_count_by_topic_grade = {(r.topic_id, r.grade_id): r.qa_count for r in count_rows}

    # Which (subject, topic) is "most recent" is still decided by date —
    # matches spec condition 3/4/5 ("most recent subject/topic... pre-
    # selected"). Which GRADE gets shown/QA-attached by default is a
    # separate question, resolved below once the tree (with grades sorted
    # ascending) exists — "the first topic grade", per spec conditions 4/5,
    # not whichever grade that most-recent log row itself happened to be at.
    most_recent_log = max(logs, key=lambda l: l["log_date"])

    subjects: dict[int, dict] = {}
    topics_by_id: dict[tuple[int, int], dict] = {}
    grades_by_id: dict[tuple[int, int], dict] = {}
    for log in logs:
        subject_entry = subjects.setdefault(log["subject_id"], {
            "subject_id": log["subject_id"],
            "subject_name": log["subject_name"],
            "icon_key": log["icon_key"],
            "topics": [],
            # Most-recently-taught topic within this subject, so the
            # frontend can auto-select it when the subject is expanded —
            # mirrors the top-level "most_recent" but scoped per subject.
            # grade_id filled in below, once grades are sorted, to the
            # topic's FIRST grade rather than this log row's own grade.
            "most_recent_topic_id": None,
            "most_recent_grade_id": None,
            "_most_recent_log_date": None,
        })
        if subject_entry["_most_recent_log_date"] is None or log["log_date"] > subject_entry["_most_recent_log_date"]:
            subject_entry["_most_recent_log_date"] = log["log_date"]
            subject_entry["most_recent_topic_id"] = log["topic_id"]
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
                "qa_count": qa_count_by_topic_grade.get(grade_key, 0),
                # Filled in below, after sorting, only for the grade that
                # ends up eagerly loaded (the most-recent topic's first
                # grade) — null means "not loaded yet" (as opposed to
                # "loaded and empty"), for the frontend to fetch on demand.
                "qa_items": None,
            }
            grades_by_id[grade_key] = grade_entry
            topic_entry["grades"].append(grade_entry)
        if log["section"]:
            grade_entry["sections"].add(log["section"])
        grade_entry["logs"].append({"date": log["log_date"].isoformat(), "section": log["section"]})

    for subject_entry in subjects.values():
        del subject_entry["_most_recent_log_date"]
        subject_entry["topics"].sort(key=lambda t: t["topic_name"])
        for topic_entry in subject_entry["topics"]:
            topic_entry["grades"].sort(key=lambda g: g["grade_name"])
            for grade_entry in topic_entry["grades"]:
                grade_entry["sections"] = sorted(grade_entry["sections"])
                grade_entry["logs"].sort(key=lambda l: l["date"])
        # First (lowest-numbered) grade of the subject's own most-recent
        # topic — grades are sorted ascending above, so this is grades[0].
        subject_most_recent_topic = topics_by_id[(subject_entry["subject_id"], subject_entry["most_recent_topic_id"])]
        subject_entry["most_recent_grade_id"] = subject_most_recent_topic["grades"][0]["grade_id"]

    most_recent_topic_entry = topics_by_id[(most_recent_log["subject_id"], most_recent_log["topic_id"])]
    most_recent_grade_id = most_recent_topic_entry["grades"][0]["grade_id"]
    most_recent_qa_rows = db.execute(
        text("""
            SELECT qa_id, question_type, question, answer, options,
                   difficulty_level, edited_by_name, edited_by_school
            FROM qa
            WHERE topic_id = :topic_id AND grade_id = :grade_id AND is_active = TRUE
            ORDER BY qa_id
        """),
        {"topic_id": most_recent_log["topic_id"], "grade_id": most_recent_grade_id},
    ).fetchall()
    grades_by_id[(most_recent_log["topic_id"], most_recent_grade_id)]["qa_items"] = [
        _qa_row_to_dict(row) for row in most_recent_qa_rows
    ]

    return {
        "subjects": sorted(subjects.values(), key=lambda s: s["subject_name"]),
        "most_recent": {
            "subject_id": most_recent_log["subject_id"],
            "topic_id": most_recent_log["topic_id"],
            "grade_id": most_recent_grade_id,
        },
    }


def get_topic_grade_qa(
    db: Session, *, customer_id: int, user_id: int, topic_id: int, grade_id: int,
    is_school_admin: bool = False, is_system_admin: bool = False,
    session_id: int | None = None,
) -> list[dict] | None:
    """QA items for one (topic, grade), fetched on demand when a teacher/
    admin clicks a topic/grade that wasn't eagerly loaded by
    list_subjects_taught() — the review-and-edit screen (1.5.1/1.5.2).
    Returns None if the caller has no teach_logs row proving they're allowed
    to see this (topic, grade) — same scoping rules as the list endpoint.
    Staff-only: a student's or parent's only path to a question's answer is
    a quiz they've actually played (quiz_service.get_quiz_detail), never
    this full topic/grade bank — the router blocks them before this is
    ever called."""
    scope = _scope_clause(
        db, customer_id=customer_id, user_id=user_id,
        is_school_admin=is_school_admin, is_system_admin=is_system_admin,
        session_id=session_id,
    )
    if scope is None:
        return None
    scope_sql, params = scope

    visible = db.execute(
        text(f"""
            SELECT 1 FROM teach_logs tl
            WHERE {scope_sql} AND tl.is_active = TRUE AND tl.topic_id = :topic_id AND tl.grade_id = :grade_id
            LIMIT 1
        """),
        {**params, "topic_id": topic_id, "grade_id": grade_id},
    ).first()
    if not visible:
        return None

    qa_rows = db.execute(
        text("""
            SELECT qa_id, question_type, question, answer, options,
                   difficulty_level, edited_by_name, edited_by_school
            FROM qa
            WHERE topic_id = :topic_id AND grade_id = :grade_id AND is_active = TRUE
            ORDER BY qa_id
        """),
        {"topic_id": topic_id, "grade_id": grade_id},
    ).fetchall()
    return [_qa_row_to_dict(row) for row in qa_rows]

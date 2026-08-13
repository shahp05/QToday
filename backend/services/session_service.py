from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode

_MONTH_ABBR = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def _format_label(d: date) -> str:
    """'10 Aug 2026' — built manually rather than strftime('%b'), which is
    locale-dependent (a non-English server locale would leak into every
    session label)."""
    return f"{d.day:02d} {_MONTH_ABBR[d.month - 1]} {d.year}"


def get_current_session_id(db: Session, customer_id: int) -> int | None:
    """The customer's current academic session, or None if they've never
    written anything session-tracked yet — reads stay unfiltered in that
    case, same as before this feature existed. In practice this only
    happens for a customer with zero students who's never uploaded a
    roster; the first write of any kind bootstraps session #1 (see
    ensure_session_bootstrapped), so None is a transient, rare state."""
    row = db.execute(
        text("SELECT session_id FROM academic_sessions WHERE customer_id = :cid AND is_current = TRUE"),
        {"cid": customer_id},
    ).fetchone()
    return row.session_id if row else None


def current_session_clause(db: Session, customer_id: int, alias: str = "sg") -> tuple[str, dict]:
    """Returns a SQL fragment + params scoping a student_grades-bearing
    query to the customer's current session — the one filter every
    session-scoped "active roster" read reuses (students_query_service,
    qa_service, quiz_service, teach_log_service's student/parent branches),
    same shape as teach_log_service.py's _session_clause but without a
    caller-supplied override — these are internal "give me the live roster"
    reads, never an explicit history-browsing request. Once a customer has
    bootstrapped (see ensure_session_bootstrapped), every active row always
    carries a real session_id, so this filter is exact — no permanent
    "OR session_id IS NULL" fallback is needed."""
    current_id = get_current_session_id(db, customer_id)
    if current_id is None:
        return f"{alias}.session_id IS NULL", {}
    return f"{alias}.session_id = :current_sid", {"current_sid": current_id}


def ensure_session_bootstrapped(db: Session, customer_id: int) -> int:
    """Called the first time ANY write touches a customer with zero
    academic_sessions rows — creates session #1 (start_date = today,
    is_current = TRUE) and, in the SAME transaction, bulk re-tags every
    existing active student_grades row for this customer (session_id IS
    NULL, i.e. pre-tracking legacy rows) onto it. This is a one-time fix:
    after it runs, every active student_grades row for this customer always
    carries a real session_id, so current_session_clause never needs a
    permanent NULL fallback. teach_logs are deliberately NOT re-tagged here
    — pre-bootstrap logs are genuinely prior history (an analogous session
    boundary), not "this session's progress," so leaving them NULL (and
    browsable as "before sessions") is correct, not an oversight.
    Idempotent in the sense that it's only ever called when
    get_current_session_id has already returned None."""
    label = _format_label(date.today())
    row = db.execute(
        text(
            "INSERT INTO academic_sessions (customer_id, label, start_date, is_current, is_future, is_active) "
            "VALUES (:cid, :label, CURRENT_DATE, TRUE, FALSE, TRUE) "
            "RETURNING session_id"
        ),
        {"cid": customer_id, "label": label},
    ).fetchone()
    session_id = row.session_id

    db.execute(
        text(
            "UPDATE student_grades sg SET session_id = :sid, date_modified = NOW() "
            "FROM students st WHERE sg.student_id = st.student_id "
            "AND st.customer_id = :cid AND sg.is_active = TRUE AND sg.session_id IS NULL"
        ),
        {"sid": session_id, "cid": customer_id},
    )
    return session_id


def validate_session_target(db: Session, customer_id: int, session_id: int) -> None:
    """Raises SESSION_TARGET_INVALID unless session_id is exactly this
    customer's current session or their one pending future session — the
    strict gate for every WRITE that lets an admin pick which session an
    action applies to (student/teacher upload, quiz submission, logging a
    subject), so a stale, past, or another customer's session_id can never
    be written into. See validate_session_readable for the read-only
    sibling — deliberately kept separate rather than relaxed, since a write
    landing on a past session by mistake would corrupt closed-out history."""
    if session_id == get_current_session_id(db, customer_id):
        return
    future_row = db.execute(
        text("SELECT session_id FROM academic_sessions WHERE customer_id = :cid AND is_future = TRUE"),
        {"cid": customer_id},
    ).fetchone()
    if future_row is not None and session_id == future_row.session_id:
        return
    raise AppError(ErrorCode.SESSION_TARGET_INVALID)


def validate_session_readable(db: Session, customer_id: int, session_id: int) -> None:
    """Raises SESSION_TARGET_INVALID unless session_id belongs to this
    customer at all — current, the one pending future session, or any past
    session. Deliberately more permissive than validate_session_target:
    browsing a past session's data read-only is safe for any of the
    customer's own sessions; only writes need the stricter current/future
    only check."""
    row = db.execute(
        text(
            "SELECT 1 FROM academic_sessions "
            "WHERE customer_id = :cid AND session_id = :sid AND is_active = TRUE"
        ),
        {"cid": customer_id, "sid": session_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.SESSION_TARGET_INVALID)


def _activate_session(db: Session, customer_id: int, session_id: int) -> None:
    """The actual cutover primitive — flips exactly one customer's current
    session onto session_id. No student_grades/teach_logs writes happen
    here: every session-scoped read already resolves "current" via
    is_current, so a future session's pre-staged rows become visible the
    instant this commits, with nothing else to migrate."""
    db.execute(
        text(
            "UPDATE academic_sessions SET is_current = FALSE, date_modified = NOW() "
            "WHERE customer_id = :cid AND is_current = TRUE AND session_id != :sid"
        ),
        {"cid": customer_id, "sid": session_id},
    )
    db.execute(
        text(
            "UPDATE academic_sessions SET is_current = TRUE, is_future = FALSE, date_modified = NOW() "
            "WHERE session_id = :sid"
        ),
        {"sid": session_id},
    )


def list_sessions(db: Session, customer_id: int) -> dict:
    """Past+current sessions (most recent first) for the history-browsing
    picker, the pending future session (if any, kept separate — nothing to
    browse in it yet), and whether any legacy (session_id IS NULL) rows
    exist for the "before sessions" picker entry."""
    sessions = db.execute(
        text(
            "SELECT session_id, label, start_date, is_current "
            "FROM academic_sessions WHERE customer_id = :cid AND is_active = TRUE AND is_future = FALSE "
            "ORDER BY start_date DESC, session_id DESC"
        ),
        {"cid": customer_id},
    ).fetchall()

    future = db.execute(
        text(
            "SELECT session_id, label, start_date FROM academic_sessions "
            "WHERE customer_id = :cid AND is_future = TRUE AND is_active = TRUE"
        ),
        {"cid": customer_id},
    ).fetchone()

    has_legacy_data = db.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM teach_logs WHERE customer_id = :cid AND session_id IS NULL"
            "  UNION ALL "
            "  SELECT 1 FROM student_grades sg JOIN students st ON st.student_id = sg.student_id "
            "  WHERE st.customer_id = :cid AND sg.session_id IS NULL"
            ")"
        ),
        {"cid": customer_id},
    ).scalar()

    return {
        "sessions": [
            {
                "session_id": r.session_id,
                "label": r.label,
                "start_date": r.start_date,
                "is_current": r.is_current,
            }
            for r in sessions
        ],
        "future_session": (
            {"session_id": future.session_id, "label": future.label, "start_date": future.start_date}
            if future else None
        ),
        "has_legacy_data": bool(has_legacy_data),
    }


def schedule_next_session(db: Session, customer_id: int, start_date: date) -> dict:
    """Schedules (or reschedules) the customer's one allowed future session.
    Same date as what's already scheduled -> no-op, returns the existing
    row as-is. A date <= today cuts over immediately in this same
    transaction instead of waiting for the daily sweep (run_due_cutovers)
    to find it."""
    existing_future = db.execute(
        text(
            "SELECT session_id, label, start_date, is_current FROM academic_sessions "
            "WHERE customer_id = :cid AND is_future = TRUE"
        ),
        {"cid": customer_id},
    ).fetchone()

    if existing_future is not None and existing_future.start_date == start_date:
        return {
            "session_id": existing_future.session_id,
            "label": existing_future.label,
            "start_date": existing_future.start_date,
            "is_current": existing_future.is_current,
        }

    label = _format_label(start_date)
    cuts_over_now = start_date <= date.today()

    # A same-date resubmission that already cut over doesn't show up as an
    # existing_future row (cutover clears is_future) — without this check,
    # scheduling "today" twice in a row would create a second session and
    # flip current again instead of being a no-op, same class of bug as a
    # double-click on the old immediate-start design.
    if cuts_over_now and existing_future is None:
        current = db.execute(
            text(
                "SELECT session_id, label, start_date, is_current FROM academic_sessions "
                "WHERE customer_id = :cid AND is_current = TRUE"
            ),
            {"cid": customer_id},
        ).fetchone()
        if current is not None and current.start_date == start_date:
            return {
                "session_id": current.session_id,
                "label": current.label,
                "start_date": current.start_date,
                "is_current": current.is_current,
            }

    try:
        if existing_future is not None:
            db.execute(
                text(
                    "UPDATE academic_sessions SET start_date = :sd, label = :label, date_modified = NOW() "
                    "WHERE session_id = :sid"
                ),
                {"sd": start_date, "label": label, "sid": existing_future.session_id},
            )
            session_id = existing_future.session_id
        else:
            row = db.execute(
                text(
                    "INSERT INTO academic_sessions (customer_id, label, start_date, is_current, is_future, is_active) "
                    "VALUES (:cid, :label, :sd, FALSE, :is_future, TRUE) "
                    "RETURNING session_id"
                ),
                {"cid": customer_id, "label": label, "sd": start_date, "is_future": not cuts_over_now},
            ).fetchone()
            session_id = row.session_id

        if cuts_over_now:
            _activate_session(db, customer_id, session_id)

        db.commit()
    except Exception:
        db.rollback()
        raise

    result = db.execute(
        text("SELECT session_id, label, start_date, is_current FROM academic_sessions WHERE session_id = :sid"),
        {"sid": session_id},
    ).fetchone()
    return {
        "session_id": result.session_id,
        "label": result.label,
        "start_date": result.start_date,
        "is_current": result.is_current,
    }


def run_due_cutovers(db: Session) -> int:
    """Daily sweep (jobs/tasks.py:session_cutover_sweep_task) — flips any
    customer whose scheduled future session's start_date has arrived.
    Small per-customer loop rather than one batched statement: this is a
    handful of schools cutting over on any given day, not a bulk-scale
    operation, and reusing _activate_session keeps this in lockstep with
    schedule_next_session's own immediate-cutover branch instead of a
    second, subtly-different implementation."""
    due = db.execute(
        text(
            "SELECT customer_id, session_id FROM academic_sessions "
            "WHERE is_future = TRUE AND is_active = TRUE AND start_date <= CURRENT_DATE"
        ),
    ).fetchall()

    for row in due:
        _activate_session(db, row.customer_id, row.session_id)
    if due:
        db.commit()
    return len(due)

import random
import string
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.email_service import send_password_reset_code
from services.password_service import hash_password
from services.session_service import get_current_session_id


def _get_setting(db: Session, key: str, default):
    row = db.execute(
        text("SELECT setting_value FROM app_settings WHERE setting_key = :k"),
        {"k": key},
    ).fetchone()
    if row is None:
        return default
    val = row[0]
    if isinstance(val, str):
        import json
        val = json.loads(val)
    return val


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def _reset_to_default(db: Session, user_id: int, login_key: str) -> None:
    """The default password for every account is its own login_key (see
    jobs.tasks.hash_new_account_passwords_task / signup_service.py) — a
    parent's login_key is their email, everyone else's is org_id@acronym.
    Resetting "to default" is therefore just re-hashing login_key."""
    db.execute(
        text(
            "UPDATE users SET password_hash = :ph, password_date_created = NOW(), "
            "is_default_password = TRUE, date_modified = NOW() WHERE user_id = :uid"
        ),
        {"ph": hash_password(login_key), "uid": user_id},
    )


def check_login_key(db: Session, login_key: str) -> dict:
    """Step (a)/(b): looks up the account by login_key. Raises
    INVALID_LOGIN_ID if it doesn't resolve to an active account."""
    row = db.execute(
        text("SELECT user_id, is_student FROM users WHERE login_key = :lk AND is_active = TRUE"),
        {"lk": login_key.strip()},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.INVALID_LOGIN_ID)
    return {"user_id": row.user_id, "is_student": row.is_student}


async def request_reset_code(db: Session, user_id: int) -> None:
    """Step (d): non-student path. Generates a code, stores it, and emails
    it to the account's own email_id (a parent's email_id is their
    login_key; a teacher/admin's is the mandatory email on file)."""
    row = db.execute(
        text("SELECT is_student, email_id FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.INVALID_LOGIN_ID)
    if row.is_student:
        raise AppError(ErrorCode.STUDENT_CANNOT_SELF_RESET)

    ttl = int(_get_setting(db, "password_reset_verification_ttl_seconds", 60))
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

    # Prune stale rows for this user first (lazy cleanup, same as signup).
    db.execute(
        text(
            "DELETE FROM password_reset_verifications "
            "WHERE user_id = :uid AND (expires_at < NOW() OR is_verified = TRUE)"
        ),
        {"uid": user_id},
    )

    code = _generate_code()
    db.execute(
        text(
            "INSERT INTO password_reset_verifications (user_id, code, expires_at) "
            "VALUES (:uid, :c, :x)"
        ),
        {"uid": user_id, "c": code, "x": expires_at},
    )
    db.commit()

    await send_password_reset_code(row.email_id, code, ttl)


def verify_reset_code(db: Session, user_id: int, code: str) -> None:
    """Step (d) continued: verifies the code, then resets the password to
    default. Same attempt-count/expiry shape as signup_service.verify_and_create."""
    max_attempts = int(_get_setting(db, "password_reset_verification_max_attempts", 5))

    row = db.execute(
        text(
            "SELECT verification_id, code, expires_at, attempt_count "
            "FROM password_reset_verifications "
            "WHERE user_id = :uid AND is_verified = FALSE "
            "ORDER BY date_created DESC LIMIT 1"
        ),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.NO_PENDING_VERIFICATION)

    verif_id, stored_code, expires_at, attempt_count = row

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise AppError(ErrorCode.VERIFICATION_CODE_EXPIRED)

    if attempt_count >= max_attempts:
        raise AppError(ErrorCode.TOO_MANY_ATTEMPTS)

    if code.strip() != stored_code:
        db.execute(
            text(
                "UPDATE password_reset_verifications SET attempt_count = attempt_count + 1 "
                "WHERE verification_id = :id"
            ),
            {"id": verif_id},
        )
        db.commit()
        remaining = max_attempts - attempt_count - 1
        raise AppError(ErrorCode.INCORRECT_CODE, context={"remaining": remaining})

    db.execute(
        text("UPDATE password_reset_verifications SET is_verified = TRUE WHERE verification_id = :id"),
        {"id": verif_id},
    )

    user = db.execute(
        text("SELECT login_key FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).fetchone()
    if user is None:
        raise AppError(ErrorCode.ACCOUNT_INACTIVE)

    _reset_to_default(db, user_id, user.login_key)
    db.commit()


def raise_student_request(db: Session, user_id: int) -> None:
    """Step (e): a student raises a reset request instead of resetting
    themselves. Idempotent — the partial unique index on (user_id WHERE
    reset_flag = false) means a repeat click just leaves the existing open
    request alone rather than piling up duplicates."""
    row = db.execute(
        text("SELECT is_student FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.INVALID_LOGIN_ID)
    if not row.is_student:
        raise AppError(ErrorCode.NOT_A_STUDENT_ACCOUNT)

    existing = db.execute(
        text("SELECT request_id FROM password_reset_requests WHERE user_id = :uid AND reset_flag = FALSE"),
        {"uid": user_id},
    ).fetchone()
    if existing is None:
        db.execute(
            text("INSERT INTO password_reset_requests (user_id) VALUES (:uid)"),
            {"uid": user_id},
        )
        db.commit()


def list_reset_requests(db: Session, claims: dict) -> list[dict]:
    """Scopes the open (reset_flag = false) request queue to the caller's
    role:
      - parent: their active wards only
      - teacher (is_school_teacher, not is_school_admin): students they've
        taught (a teach_logs row this session, same grade+section) — an
        approximation of "taught this student", the same one teach_logs
        supports elsewhere (grade+section level, not per-student)
      - super-admin (is_school_admin): every student at their school
      - anyone else: nothing"""
    user_id = claims["user_id"]
    columns = (
        "pr.request_id, pr.date_created, s.user_id, u.org_id, u.user_name, u.file_url AS photo_url"
    )
    base_from = (
        "FROM password_reset_requests pr "
        "JOIN users u ON u.user_id = pr.user_id "
        "JOIN students s ON s.user_id = pr.user_id "
        "WHERE pr.reset_flag = FALSE AND u.is_active = TRUE AND s.is_active = TRUE "
    )

    if claims.get("is_parent"):
        rows = db.execute(
            text(
                f"SELECT DISTINCT {columns} {base_from}"
                "AND EXISTS (SELECT 1 FROM parents p WHERE p.student_id = s.student_id "
                "AND p.user_id = :uid AND p.is_active = TRUE)"
            ),
            {"uid": user_id},
        ).fetchall()
    elif claims.get("is_school_admin"):
        customer_id = claims.get("customer_id")
        if not customer_id:
            return []
        rows = db.execute(
            text(f"SELECT {columns} {base_from} AND s.customer_id = :cid"),
            {"cid": customer_id},
        ).fetchall()
    elif claims.get("is_school_teacher"):
        customer_id = claims.get("customer_id")
        if not customer_id:
            return []
        session_id = get_current_session_id(db, customer_id)
        if session_id is None:
            return []
        rows = db.execute(
            text(
                f"SELECT DISTINCT {columns} {base_from}"
                "AND s.customer_id = :cid "
                "AND EXISTS ("
                "  SELECT 1 FROM student_grades sg "
                "  JOIN teach_logs tl ON tl.customer_id = :cid AND tl.session_id = sg.session_id "
                "    AND tl.grade_id = sg.grade_id "
                "    AND tl.section IS NOT DISTINCT FROM sg.section "
                "  WHERE sg.student_id = s.student_id AND sg.session_id = :sid "
                "    AND sg.is_active = TRUE AND tl.user_id = :teacher_id"
                ")"
            ),
            {"cid": customer_id, "sid": session_id, "teacher_id": user_id},
        ).fetchall()
    else:
        return []

    return [dict(row._mapping) for row in rows]


def approve_reset_request(db: Session, claims: dict, request_id: int) -> None:
    """Re-validates the caller's visibility over this exact request (never
    trusts the request_id alone) using the same scoping as
    list_reset_requests, then resets that student's password to default and
    marks the request resolved."""
    visible_ids = {r["request_id"] for r in list_reset_requests(db, claims)}
    if request_id not in visible_ids:
        raise AppError(ErrorCode.RESET_REQUEST_NOT_FOUND)

    row = db.execute(
        text(
            "SELECT pr.user_id, u.login_key FROM password_reset_requests pr "
            "JOIN users u ON u.user_id = pr.user_id "
            "WHERE pr.request_id = :rid AND pr.reset_flag = FALSE"
        ),
        {"rid": request_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.RESET_REQUEST_NOT_FOUND)

    _reset_to_default(db, row.user_id, row.login_key)
    db.execute(
        text(
            "UPDATE password_reset_requests SET reset_flag = TRUE, date_reset = NOW(), "
            "resolved_by_user_id = :approver WHERE request_id = :rid"
        ),
        {"approver": claims["user_id"], "rid": request_id},
    )
    db.commit()

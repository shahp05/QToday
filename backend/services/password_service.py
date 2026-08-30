import hashlib
import hmac
import re
import secrets

from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt}${digest.hex()}"


def placeholder_password_hash() -> str:
    """A hash that matches no real password — used for freshly-inserted
    accounts (xlsx upload) whose actual default password (deterministic:
    org_id@acronym for students/teachers, email for parents) gets hashed
    for real off the request path, see jobs.tasks.hash_new_account_passwords_task.
    One random value is computed per upload batch and shared across every
    new row in it — there's nothing to protect since it's overwritten within
    seconds, so paying the ~150ms PBKDF2 cost once per batch instead of once
    per row is what actually removes the upload-time bottleneck."""
    return hash_password(secrets.token_urlsafe(32))


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iterations, salt, hex_digest = stored_hash.split("$")
    except ValueError:
        return False
    if algo != _ALGO:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(digest.hex(), hex_digest)


def validate_password_policy(password: str, is_student: bool) -> None:
    """Per the product doc's Account Rules: minimum length 6 with at least 1
    alpha and 1 numeric character; teachers/super-admins/parents must also
    include a special character (students are exempt, to keep it simple for
    them)."""
    if (
        len(password) < 6
        or not re.search(r"[A-Za-z]", password)
        or not re.search(r"\d", password)
    ):
        raise AppError(ErrorCode.PASSWORD_POLICY_VIOLATION)
    if not is_student and not re.search(r"[^A-Za-z0-9]", password):
        raise AppError(ErrorCode.PASSWORD_POLICY_VIOLATION)


def change_own_password(
    db: Session, *, user_id: int, current_password: str | None, new_password: str, is_student: bool
) -> None:
    """Any authenticated user may change their own password. A user still on
    their default password (is_default_password) skips the current-password
    check — per the doc, they aren't required to re-enter it. A successful
    change always clears is_default_password, since the point of this flow
    is to move off the auto-generated one."""
    row = db.execute(
        text("SELECT password_hash, is_default_password FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.ACCOUNT_INACTIVE)

    if not row.is_default_password:
        if not current_password or not verify_password(current_password, row.password_hash):
            raise AppError(ErrorCode.INCORRECT_CURRENT_PASSWORD)

    validate_password_policy(new_password, is_student)

    db.execute(
        text(
            "UPDATE users SET password_hash = :ph, password_date_created = NOW(), "
            "is_default_password = FALSE, date_modified = NOW() WHERE user_id = :uid"
        ),
        {"ph": hash_password(new_password), "uid": user_id},
    )
    db.commit()

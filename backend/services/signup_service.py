import random
import string
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from services.email_service import send_verification_code
from services.password_service import hash_password


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


async def request_verification(db: Session, payload: dict) -> None:
    """Insert a new verification row and send the code by email.
    Prunes stale rows for this email first."""
    email = payload["email_id"]
    ttl = int(_get_setting(db, "signup_verification_ttl_seconds", 60))
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

    # prune expired rows for this email (lazy cleanup)
    db.execute(
        text(
            "DELETE FROM signup_verifications "
            "WHERE email_id = :e AND (expires_at < NOW() OR is_verified = TRUE)"
        ),
        {"e": email},
    )

    code = _generate_code()
    import json
    db.execute(
        text(
            "INSERT INTO signup_verifications "
            "(email_id, code, payload, expires_at) "
            "VALUES (:e, :c, :p, :x)"
        ),
        {"e": email, "c": code, "p": json.dumps(payload), "x": expires_at},
    )
    db.commit()

    await send_verification_code(email, code, ttl)


class VerificationError(Exception):
    pass


def verify_and_create(db: Session, email: str, code: str) -> dict:
    """Verify the code. On success, create customer + user and return their IDs.
    Raises VerificationError with a user-facing message on any failure."""
    max_attempts = int(_get_setting(db, "signup_verification_max_attempts", 5))

    row = db.execute(
        text(
            "SELECT verification_id, code, payload, expires_at, attempt_count, is_verified "
            "FROM signup_verifications "
            "WHERE email_id = :e AND is_verified = FALSE "
            "ORDER BY date_created DESC LIMIT 1"
        ),
        {"e": email},
    ).fetchone()

    if row is None:
        raise VerificationError("No pending verification found for this email.")

    verif_id, stored_code, payload, expires_at, attempt_count, _ = row

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise VerificationError("expired")

    if attempt_count >= max_attempts:
        raise VerificationError("Too many incorrect attempts. Please request a new code.")

    if code.strip() != stored_code:
        db.execute(
            text(
                "UPDATE signup_verifications SET attempt_count = attempt_count + 1 "
                "WHERE verification_id = :id"
            ),
            {"id": verif_id},
        )
        db.commit()
        remaining = max_attempts - attempt_count - 1
        raise VerificationError(
            f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )

    # Mark verified before writing customer/user so a retry is idempotent
    db.execute(
        text("UPDATE signup_verifications SET is_verified = TRUE WHERE verification_id = :id"),
        {"id": verif_id},
    )

    import json
    p = payload if isinstance(payload, dict) else json.loads(payload)

    # Resolve or create country
    country_row = db.execute(
        text("SELECT country_id FROM countries WHERE country_code = :c AND is_active = TRUE"),
        {"c": p["country_code"]},
    ).fetchone()
    if country_row is None:
        raise VerificationError(f"Unknown country code: {p['country_code']}")
    country_id = country_row[0]

    # Resolve or create board
    board_row = db.execute(
        text(
            "SELECT board_id FROM boards "
            "WHERE board_name ILIKE :n AND country_id = :cid AND is_active = TRUE"
        ),
        {"n": p["board_name"], "cid": country_id},
    ).fetchone()
    if board_row:
        board_id = board_row[0]
    else:
        board_id = db.execute(
            text(
                "INSERT INTO boards (board_name, board_code, country_id, is_active) "
                "VALUES (:n, :c, :cid, TRUE) RETURNING board_id"
            ),
            {"n": p["board_name"], "c": p["board_name"][:20].upper(), "cid": country_id},
        ).scalar()

    # Create customer
    customer_id = db.execute(
        text(
            "INSERT INTO customers "
            "(country_id, customer_name, board_id, customer_acronym, customer_email) "
            "VALUES (:cid, :name, :bid, :acr, :email) RETURNING customer_id"
        ),
        {
            "cid": country_id,
            "name": p["customer_name"],
            "bid": board_id,
            "acr": p["customer_acronym"].upper(),
            "email": p["email_id"],
        },
    ).scalar()

    # Default login key / password: "<org_id>@<acronym>" (e.g. "101@TSRS")
    org_id = p.get("org_id", "")
    acronym = p["customer_acronym"].upper()
    login_key = f"{org_id}@{acronym}"

    # The signup flow creates this customer's owner/super admin —
    # is_sysadm=True together with a non-NULL customer_id (see models.py).
    user_id = db.execute(
        text(
            "INSERT INTO users "
            "(login_key, password_hash, user_name, email_id, country_id, "
            " customer_id, org_id, is_sysadm) "
            "VALUES (:lk, :ph, :un, :ei, :cid, :custid, :oid, TRUE) RETURNING user_id"
        ),
        {
            "lk": login_key,
            "ph": hash_password(login_key),
            "un": p["user_name"],
            "ei": p["email_id"],
            "cid": country_id,
            "custid": customer_id,
            "oid": org_id,
        },
    ).scalar()

    db.commit()
    return {"customer_id": customer_id, "user_id": user_id}

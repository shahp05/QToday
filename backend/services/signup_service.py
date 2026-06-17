import os
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from sqlalchemy import text
from sqlalchemy.orm import Session


def _mail_config() -> ConnectionConfig:
    return ConnectionConfig(
        MAIL_USERNAME=os.getenv("MAIL_USERNAME", ""),
        MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", ""),
        MAIL_FROM=os.getenv("MAIL_FROM", "noreply@qtoday.app"),
        MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
        MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
        MAIL_STARTTLS=os.getenv("MAIL_STARTTLS", "True").lower() == "true",
        MAIL_SSL_TLS=os.getenv("MAIL_SSL_TLS", "False").lower() == "true",
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


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

    await _send_code_email(email, code, ttl)


async def _send_code_email(email: str, code: str, ttl_seconds: int) -> None:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#0F8911;margin-bottom:8px">QToday — Verify your email</h2>
      <p style="color:#343434;margin-bottom:24px">
        Use the code below to complete your sign-up. It expires in
        <strong>{ttl_seconds} seconds</strong>.
      </p>
      <div style="background:#f2f4f7;border-radius:10px;padding:24px;text-align:center">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0F8911">{code}</span>
      </div>
      <p style="color:#999;font-size:12px;margin-top:24px">
        If you did not request this, you can safely ignore this email.
      </p>
    </div>
    """
    message = MessageSchema(
        subject="Your QToday verification code",
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )
    fm = FastMail(_mail_config())
    await fm.send_message(message)


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
                "INSERT INTO boards (board_name, board_code, country_id) "
                "VALUES (:n, :c, :cid) RETURNING board_id"
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

    # Create admin user (no password yet — auth comes later)
    user_id = db.execute(
        text(
            "INSERT INTO users "
            "(login_key, password_hash, user_name, email_id, country_id, "
            " customer_id, org_id, is_cust_adm) "
            "VALUES (:lk, :ph, :un, :ei, :cid, :custid, :oid, TRUE) RETURNING user_id"
        ),
        {
            "lk": p["email_id"],
            "ph": "",          # placeholder — password setup deferred to auth flow
            "un": p["user_name"],
            "ei": p["email_id"],
            "cid": country_id,
            "custid": customer_id,
            "oid": p.get("org_id", ""),
        },
    ).scalar()

    # Link user as customer admin
    db.execute(
        text(
            "INSERT INTO customer_admins (user_id, customer_id, is_superadm) "
            "VALUES (:uid, :cid, TRUE)"
        ),
        {"uid": user_id, "cid": customer_id},
    )

    db.commit()
    return {"customer_id": customer_id, "user_id": user_id}

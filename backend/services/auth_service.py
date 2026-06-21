from fastapi import Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.database import get_db
from services.jwt_service import TokenError, decode_access_token
from services.password_service import verify_password


class AuthError(Exception):
    pass


def login(db: Session, login_key: str, password: str) -> int:
    """Verify credentials and return the user_id. Callers fetch the full
    profile separately via profile_service.get_profile — this function's
    job is just the password check."""
    row = db.execute(
        text("SELECT user_id, password_hash FROM users WHERE login_key = :lk AND is_active = TRUE"),
        {"lk": login_key},
    ).fetchone()

    if row is None or not verify_password(password, row.password_hash):
        raise AuthError("Incorrect login ID or password.")

    return row.user_id


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> dict:
    """FastAPI dependency — decodes the Bearer JWT and returns its claims.
    Protected routes depend on this; routes that must stay public (signup,
    countries lookup, etc.) simply don't take this dependency."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        claims = decode_access_token(token)
    except TokenError as e:
        raise HTTPException(status_code=401, detail=str(e))

    row = db.execute(
        text("SELECT user_id FROM users WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": claims.get("user_id")},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="User no longer active.")

    return claims

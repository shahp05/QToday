import os
from datetime import datetime, timedelta, timezone

import jwt

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # school logins are long-lived sessions, not banking


class TokenError(Exception):
    pass


def _secret_key() -> str:
    key = os.getenv("SECRET_KEY")
    if not key:
        raise RuntimeError("SECRET_KEY not set in .env")
    return key


def create_access_token(claims: dict) -> str:
    payload = {
        **claims,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise TokenError("Token has expired.")
    except jwt.InvalidTokenError:
        raise TokenError("Invalid token.")

import hashlib
import hmac
import secrets

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

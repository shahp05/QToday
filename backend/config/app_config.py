"""
DB-backed business settings, cached in memory.

Used by qa_service today, and by future batch/quiz services so every
tunable parameter (thresholds, counts, distributions, provider routing)
lives in one place — app_settings table — instead of being hardcoded
per service.

Secrets (API keys, DATABASE_URL) do NOT belong here — those stay in
.env, loaded via os.getenv() directly where needed.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from config.default_settings import DEFAULT_SETTINGS
from db.database import SessionLocal
from db.models import AppSetting

_CACHE: dict = {}
_LOADED_AT: datetime | None = None
_TTL_SECONDS = 60  # re-read from DB at most once a minute


def _is_stale() -> bool:
    return _LOADED_AT is None or (datetime.now(timezone.utc) - _LOADED_AT) > timedelta(seconds=_TTL_SECONDS)


def _reload() -> None:
    global _CACHE, _LOADED_AT
    with SessionLocal() as db:
        rows = db.execute(select(AppSetting)).scalars().all()
        _CACHE = {row.setting_key: row.setting_value for row in rows}
        _LOADED_AT = datetime.now(timezone.utc)


def get_setting(key: str, default=None):
    """Fetch a config value by key, refreshing the cache if it's stale."""
    if _is_stale():
        _reload()
    return _CACHE.get(key, default)


def reload_settings() -> None:
    """Force an immediate refresh — call after an admin updates app_settings."""
    _reload()


def ensure_default_settings(db: Session) -> int:
    """Idempotent, additive-only backfill: inserts any DEFAULT_SETTINGS key
    missing from app_settings; never touches a key that already exists, so
    an admin's customized value is never overwritten by a default. Called
    from main.py's lifespan on every app startup — returns the count so the
    caller can log when it actually did something.

    Why this exists instead of a migration INSERT (which is how app_settings
    was originally seeded): Alembic tracks "has this migration run" purely
    by revision id in alembic_version, never by re-diffing the SQL inside
    it. If a migration file is edited to add/change a seed INSERT *after*
    that revision has already been applied to a database, the new INSERT
    text never runs there — silently, with no error — because Alembic
    considers that revision already done. That's exactly how app_settings
    ended up completely empty in production despite the seed being right
    there in the migration/schema.sql history the whole time. Running the
    backfill here instead makes it unconditional on migration history and
    re-checked on every boot, so a missing row self-heals on the next
    deploy rather than staying silently missing indefinitely."""
    existing_keys = set(db.execute(select(AppSetting.setting_key)).scalars().all())
    missing = [
        AppSetting(setting_key=key, setting_value=value, description=description)
        for key, (value, description) in DEFAULT_SETTINGS.items()
        if key not in existing_keys
    ]
    if not missing:
        return 0
    db.add_all(missing)
    db.commit()
    reload_settings()
    return len(missing)

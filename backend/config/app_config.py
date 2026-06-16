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

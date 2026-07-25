"""
Idempotent, additive-only backfill for reference/master data — the same
self-healing pattern as config.app_config.ensure_default_settings, and for
the identical reason: a one-time seed INSERT inside an Alembic migration
silently stops applying to a database the moment that revision has already
run, even if the migration file is later edited. That's how grades ended
up with only 6 of the expected 1-12 rows in production. See
ensure_default_settings' docstring for the full explanation.

Kept separate from app_settings (config/default_settings.py,
config/app_config.py) because this is fixed reference data — not a
business-tunable value an admin would ever change — so it doesn't belong
in the same table or module.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import Grade

DEFAULT_GRADES = list(range(1, 13))  # 1-12


def ensure_default_grades(db: Session) -> int:
    """Inserts any missing grade_name in DEFAULT_GRADES; never touches an
    existing row (grade_id is referenced by FK from teach_logs, qa,
    quizzes, student_grades, etc., so existing rows must never be altered
    or replaced, only gaps filled). Called from main.py's lifespan on every
    app startup. Returns the count inserted."""
    existing_names = set(db.execute(select(Grade.grade_name)).scalars().all())
    missing = [Grade(grade_name=name) for name in DEFAULT_GRADES if name not in existing_names]
    if not missing:
        return 0
    db.add_all(missing)
    db.commit()
    return len(missing)

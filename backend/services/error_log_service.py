"""
Single entry point for writing to error_logs — every part of the codebase
calls log_error(), never a raw INSERT, so logging stays consistent.

Synchronous, direct INSERT (not deferred via Procrastinate) — error
logging should not depend on a worker process being up, and the volume
doesn't justify the extra indirection.

Also includes the two-phase purge logic (mark, then delete), wrapped by
jobs/tasks.py into the same Procrastinate-task pattern as every other
background job.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import ErrorLog
from errors.error_codes import ERROR_DEFAULTS, ErrorCode


def log_error(
    db: Session,
    *,
    type: str,
    error_code: ErrorCode,
    user_id: int | None = None,
    description: str | None = None,
    stack_trace: str | None = None,
    context: dict | None = None,
    correlation_id: str | None = None,
) -> ErrorLog:
    if type not in ("api", "batch", "frontend"):
        raise ValueError(f"Invalid error log type: {type!r}")

    defaults = ERROR_DEFAULTS.get(error_code, {"message": "An unexpected error occurred."})

    entry = ErrorLog(
        type=type,
        error_code=error_code.value,
        err_description=description or defaults["message"],
        stack_trace=stack_trace,
        context=context,
        correlation_id=correlation_id,
        user_id=user_id,
    )
    db.add(entry)
    db.commit()
    return entry


def mark_old_error_logs_for_purge(db: Session) -> int:
    """First pass: mark rows past the retention window. Returns count marked."""
    retention_days = get_setting("error_log_soft_delete_after_days", 90)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    result = db.execute(
        update(ErrorLog)
        .where(ErrorLog.date_created < cutoff, ErrorLog.date_deleted.is_(None))
        .values(date_deleted=datetime.now(timezone.utc))
    )
    db.commit()
    return result.rowcount


def physically_delete_purged_error_logs(db: Session) -> int:
    """Second pass: hard-delete rows marked long enough ago. Returns count deleted."""
    grace_days = get_setting("error_log_purge_grace_days", 30)
    cutoff = datetime.now(timezone.utc) - timedelta(days=grace_days)

    rows = db.execute(
        select(ErrorLog.error_log_id).where(
            ErrorLog.date_deleted.is_not(None), ErrorLog.date_deleted < cutoff
        )
    ).scalars().all()

    if rows:
        db.execute(ErrorLog.__table__.delete().where(ErrorLog.error_log_id.in_(rows)))
        db.commit()
    return len(rows)

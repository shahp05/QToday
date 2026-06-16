"""
Shared helpers for batch_jobs bookkeeping — used by every background task,
present and future (country_list today; qa_generation, qa_verification,
qa_scoring, qa_time_recalibration later). Keeps the "is this due, start it,
close it out" pattern in one place rather than duplicated per task.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import BatchJob


def is_due(db: Session, request_type: str, **scope_filters) -> bool:
    """True if no successful run exists yet, or the last one is older than
    the configured interval_days for this request_type. scope_filters are
    extra BatchJob columns to scope by (e.g. subject_id=X) for job types
    that run per-entity rather than globally."""
    batch_request_types = get_setting("batch_request_types", {})
    interval_days = batch_request_types.get(request_type, {}).get("interval_days")
    if interval_days is None:
        # no interval configured -> always considered due (e.g. one-off job types)
        return True

    query = select(BatchJob).where(
        BatchJob.request_type == request_type,
        BatchJob.is_active == True,  # noqa: E712
        BatchJob.is_closed == True,  # noqa: E712
    )
    for col, value in scope_filters.items():
        query = query.where(getattr(BatchJob, col) == value)
    query = query.order_by(BatchJob.date_created.desc()).limit(1)

    last_success = db.execute(query).scalar_one_or_none()
    if last_success is None:
        return True

    cutoff = datetime.now(timezone.utc) - timedelta(days=interval_days)
    last_created = last_success.date_created
    if last_created.tzinfo is None:
        last_created = last_created.replace(tzinfo=timezone.utc)
    return last_created < cutoff


def start_job(db: Session, request_type: str, **fields) -> BatchJob:
    job = BatchJob(request_type=request_type, is_active=True, is_closed=False, **fields)
    db.add(job)
    db.flush()
    db.commit()
    return job


def close_job(db: Session, job: BatchJob) -> None:
    job.is_active = True
    job.is_closed = True
    db.commit()


def fail_job(db: Session, job: BatchJob) -> None:
    job.is_active = False
    job.is_closed = False
    db.commit()

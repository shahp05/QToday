"""
Task definitions. Each function here is the ONE shared implementation for
its job — registered once with @app.task(), it can be triggered either:
  - from API code:        await refresh_countries.defer_async()
  - from the scheduler:   automatically, via @app.periodic's cron
Both paths execute this exact function. No duplicate logic anywhere else.
"""
from db.database import SessionLocal
from jobs.app import app
from services.batch_job_service import close_job, fail_job, is_due, start_job
from services.country_service import fetch_and_sync_countries
from services.error_log_service import mark_old_error_logs_for_purge, physically_delete_purged_error_logs

REQUEST_TYPE_COUNTRY_LIST = "country_list"
REQUEST_TYPE_ERROR_LOG_PURGE_MARK = "error_log_purge_mark"
REQUEST_TYPE_ERROR_LOG_PURGE_DELETE = "error_log_purge_delete"


@app.periodic(cron="0 3 * * *", periodic_id="refresh_countries")  # checked daily; only acts when actually due
@app.task(queue="maintenance")
async def refresh_countries(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        if not is_due(db, REQUEST_TYPE_COUNTRY_LIST):
            return {"skipped": True, "reason": "not due yet"}

        job = start_job(db, REQUEST_TYPE_COUNTRY_LIST)
        try:
            summary = await fetch_and_sync_countries(db)
            db.commit()
            close_job(db, job)
            return {"skipped": False, **summary}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()


@app.periodic(cron="0 4 * * *", periodic_id="error_log_purge_mark")  # daily; interval itself is configurable
@app.task(queue="maintenance")
async def error_log_purge_mark(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        if not is_due(db, REQUEST_TYPE_ERROR_LOG_PURGE_MARK):
            return {"skipped": True, "reason": "not due yet"}

        job = start_job(db, REQUEST_TYPE_ERROR_LOG_PURGE_MARK)
        try:
            marked_count = mark_old_error_logs_for_purge(db)
            close_job(db, job)
            return {"skipped": False, "marked": marked_count}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()


@app.periodic(cron="0 5 * * *", periodic_id="error_log_purge_delete")  # daily; interval itself is configurable
@app.task(queue="maintenance")
async def error_log_purge_delete(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        if not is_due(db, REQUEST_TYPE_ERROR_LOG_PURGE_DELETE):
            return {"skipped": True, "reason": "not due yet"}

        job = start_job(db, REQUEST_TYPE_ERROR_LOG_PURGE_DELETE)
        try:
            deleted_count = physically_delete_purged_error_logs(db)
            close_job(db, job)
            return {"skipped": False, "deleted": deleted_count}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()

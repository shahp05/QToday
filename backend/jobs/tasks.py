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
from services.qa_service import top_up_qa
from services.quiz_scoring_service import score_pending_quiz

REQUEST_TYPE_COUNTRY_LIST = "country_list"
REQUEST_TYPE_ERROR_LOG_PURGE_MARK = "error_log_purge_mark"
REQUEST_TYPE_ERROR_LOG_PURGE_DELETE = "error_log_purge_delete"
REQUEST_TYPE_QUIZ_SCORING = "qa_scoring"
REQUEST_TYPE_QA_TOP_UP = "qa_generation"


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


# Not periodic — deferred once per quiz submission (routers/quizzes.py) right
# after the auto-scorable answers are saved, so it only runs when there's
# actually something an LLM needs to grade.
@app.task(queue="quiz_scoring")
async def score_quiz_task(quiz_id: int) -> dict:
    db = SessionLocal()
    try:
        job = start_job(db, REQUEST_TYPE_QUIZ_SCORING, quiz_id=quiz_id)
        try:
            result = await score_pending_quiz(db, quiz_id=quiz_id)
            close_job(db, job)
            return result
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()


# Not periodic — deferred once per quiz submission so the QA bank for a
# (subject, topic, grade) keeps growing over time. top_up_qa itself no-ops
# without calling the LLM once the pool is already large enough, so this is
# cheap to trigger on every submission rather than needing its own schedule.
@app.task(queue="qa_generation")
async def top_up_qa_task(subject_id: int, topic_id: int, grade_id: int) -> dict:
    db = SessionLocal()
    try:
        job = start_job(db, REQUEST_TYPE_QA_TOP_UP, subject_id=subject_id, topic_id=topic_id)
        try:
            added = await top_up_qa(db, subject_id=subject_id, topic_id=topic_id, grade_id=grade_id)
            close_job(db, job)
            return {"added": added}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()

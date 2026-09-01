"""
Task definitions. Each function here is the ONE shared implementation for
its job — registered once with @app.task(), it can be triggered either:
  - from API code:        await refresh_countries.defer_async()
  - from the scheduler:   automatically, via @app.periodic's cron
Both paths execute this exact function. No duplicate logic anywhere else.
"""
from sqlalchemy import select, text

from db.database import SessionLocal
from db.models import BatchJob
from jobs.app import app
from services.batch_job_service import close_job, fail_job, is_due, start_job
from services.country_service import fetch_and_sync_countries
from services.error_log_service import mark_old_error_logs_for_purge, physically_delete_purged_error_logs
from services.geo_service import seed_country_geo
from services.password_service import hash_password
from services.qa_service import (
    generate_missing_qa, poll_and_finalize_qa_batch, should_top_up_qa, submit_qa_top_up_batch, verify_pending_qa,
)
from services.quiz_scoring_service import score_pending_quiz, score_stuck_quizzes
from services.quiz_service import resolve_pending_challenges
from services.session_service import run_due_cutovers

REQUEST_TYPE_COUNTRY_LIST = "country_list"
REQUEST_TYPE_ERROR_LOG_PURGE_MARK = "error_log_purge_mark"
REQUEST_TYPE_ERROR_LOG_PURGE_DELETE = "error_log_purge_delete"
REQUEST_TYPE_QUIZ_SCORING = "qa_scoring"
REQUEST_TYPE_QA_TOP_UP = "qa_generation"
REQUEST_TYPE_QA_VERIFICATION = "qa_verification"
REQUEST_TYPE_SESSION_CUTOVER = "session_cutover"
REQUEST_TYPE_ACCOUNT_PASSWORD_HASH = "account_password_hash"
REQUEST_TYPE_COUNTRY_GEO_SEED = "country_geo_seed"


# Not periodic — deferred once per students/teachers xlsx upload (see
# routers/students.py, routers/teachers.py) right after commit, with the
# user_ids of every brand-new account. Each of those rows was inserted with
# a shared, unmatched placeholder password_hash (see
# password_service.placeholder_password_hash) purely so the row could exist
# without paying ~150ms of PBKDF2 per row on the request path — a few
# hundred new accounts in one upload was slow enough to time out. This is
# what makes each account's real default password (login_key itself —
# org_id@acronym for students/teachers, email for parents) actually usable
# to log in, off the request path.
@app.task(queue="maintenance")
async def hash_new_account_passwords_task(user_ids: list[int]) -> dict:
    if not user_ids:
        return {"hashed": 0}
    db = SessionLocal()
    try:
        job = start_job(db, REQUEST_TYPE_ACCOUNT_PASSWORD_HASH)
        try:
            rows = db.execute(
                text("SELECT user_id, login_key FROM users WHERE user_id = ANY(:ids)"),
                {"ids": user_ids},
            ).fetchall()
            ids = [r.user_id for r in rows]
            hashes = [hash_password(r.login_key) for r in rows]
            if ids:
                db.execute(
                    text(
                        "UPDATE users u SET password_hash = t.password_hash "
                        "FROM unnest((:ids)::int[], (:hashes)::text[]) AS t(user_id, password_hash) "
                        "WHERE u.user_id = t.user_id"
                    ),
                    {"ids": ids, "hashes": hashes},
                )
            db.commit()
            close_job(db, job)
            return {"hashed": len(ids)}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()


# Not periodic — deferred once per signup (services/signup_service.py)
# right after a customer/country is created, only when that country has no
# states seeded yet. seed_country_geo itself is idempotent (no-ops if
# already seeded), so a duplicate defer for the same country is harmless.
@app.task(queue="maintenance")
async def seed_country_geo_task(country_id: int, country_name: str) -> dict:
    db = SessionLocal()
    try:
        job = start_job(db, REQUEST_TYPE_COUNTRY_GEO_SEED, country_id=country_id)
        try:
            result = await seed_country_geo(db, country_id=country_id, country_name=country_name)
            db.commit()
            close_job(db, job)
            return result
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()


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


# Fallback for score_quiz_task, the same way generate_missing_qa_task is a
# fallback for real-time QA generation: score_quiz_task only ever runs once,
# right at submit time, so an LLM call that fails there previously left a
# quiz "scoring in progress" forever (see quiz_scoring_service.
# score_pending_quiz's docstring). This sweep retries every quiz still
# carrying an unscored row. 30-minute cadence for the same reason
# generate_missing_qa_task uses one — frequent enough that a stuck quiz
# doesn't sit unscored for long, without hammering the LLM on every tick.
@app.periodic(cron="*/30 * * * *", periodic_id="score_stuck_quizzes")
@app.task(queue="quiz_scoring")
async def score_stuck_quizzes_task(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        return await score_stuck_quizzes(db)
    finally:
        db.close()


# Same fallback pattern as score_stuck_quizzes_task above, for challenges
# instead of initial scoring: challenge_quiz_question's real-time LLM call
# can fail after the QuizChallenge row is already committed (see
# quiz_service.challenge_quiz_question), leaving it pending forever without
# this sweep. Same 30-minute cadence for the same reason.
@app.periodic(cron="*/30 * * * *", periodic_id="resolve_pending_challenges")
@app.task(queue="quiz_scoring")
async def resolve_pending_challenges_task(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        return await resolve_pending_challenges(db)
    finally:
        db.close()


# Not periodic — deferred once per quiz submission so the QA bank for a
# (subject, topic, grade) keeps growing over time. should_top_up_qa is a
# read-only, no-LLM check (pool count + 45-day staleness), so this is cheap
# to trigger on every submission rather than needing its own schedule. Only
# *submits* the batch — the actual QA rows land later via
# poll_qa_generation_batches once OpenAI finishes processing it, so there's
# nothing to close_job here; submit_qa_top_up_batch creates the batch_jobs
# row itself (only once it actually has a batch_id to record).
@app.task(queue="qa_generation")
async def top_up_qa_task(subject_id: int, topic_id: int, grade_id: int) -> dict:
    db = SessionLocal()
    try:
        if not should_top_up_qa(db, subject_id=subject_id, topic_id=topic_id, grade_id=grade_id):
            return {"skipped": True, "reason": "not due yet"}
        job = await submit_qa_top_up_batch(db, subject_id=subject_id, topic_id=topic_id, grade_id=grade_id)
        if job is None:
            return {"skipped": True, "reason": "nothing to submit"}
        return {"skipped": False, "batch_id": job.batch_id}
    finally:
        db.close()


# Polls every pending qa_generation batch against OpenAI's Batch API and
# finalizes any that have completed (or fails ones OpenAI reports as failed/
# expired/cancelled) — see qa_service.poll_and_finalize_qa_batch. Runs
# frequently since a batch can complete well before its 24h window closes,
# and nothing else drives this forward — unlike top_up_qa_task there's no
# per-submission trigger for "check if my batch is done".
@app.periodic(cron="*/10 * * * *", periodic_id="poll_qa_generation_batches")
@app.task(queue="qa_generation")
async def poll_qa_generation_batches(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        pending = db.execute(
            select(BatchJob).where(
                BatchJob.request_type == REQUEST_TYPE_QA_TOP_UP,
                BatchJob.is_active == True,  # noqa: E712
                BatchJob.is_closed == False,  # noqa: E712
                BatchJob.batch_id.isnot(None),
            )
        ).scalars().all()

        results = []
        for job in pending:
            try:
                results.append(await poll_and_finalize_qa_batch(db, job))
            except Exception:
                db.rollback()
                fail_job(db, job)
        return {"checked": len(pending), "results": results}
    finally:
        db.close()


# Flips any customer whose scheduled future academic session's start_date
# has arrived (session_service.run_due_cutovers) — a same-day-scheduled
# session cuts over synchronously inside schedule_next_session itself, so
# this sweep is only a safety net for dates scheduled days ahead. No
# interval configured in batch_request_types, so is_due is always True —
# this is meant to run (and check) every single day, not on a staleness
# cadence like the QA verification sweep below.
@app.periodic(cron="0 0 * * *", periodic_id="session_cutover_sweep")
@app.task(queue="maintenance")
async def session_cutover_sweep_task(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        if not is_due(db, REQUEST_TYPE_SESSION_CUTOVER):
            return {"skipped": True, "reason": "not due yet"}

        job = start_job(db, REQUEST_TYPE_SESSION_CUTOVER)
        try:
            flipped = run_due_cutovers(db)
            close_job(db, job)
            return {"skipped": False, "flipped": flipped}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()


# Fallback for real-time generation failures: the LLM call inside
# _finalize (routers/qa.py's teach-log path) can fail after the teach_log
# itself is already committed (see qa_service._finalize's except block),
# leaving that (subject, topic, grade) taught but with zero QA rows. This
# sweep picks those up and retries via the same _get_verified_qa the
# real-time path uses (qa_service.generate_missing_qa). The 30-minute
# cadence lives here, in the cron string, rather than in app_settings —
# consistent with poll_qa_generation_batches below and every other
# @app.periodic job in this file; Procrastinate reads a periodic task's
# cron at decoration time, not from the DB.
@app.periodic(cron="*/30 * * * *", periodic_id="generate_missing_qa")
@app.task(queue="qa_generation")
async def generate_missing_qa_task(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        return await generate_missing_qa(db)
    finally:
        db.close()


# Third of three places the QA quality-check call fires (see
# qa_service.verify_pending_qa's docstring for the other two) — an
# independent daily sweep so nothing generated is ever left permanently
# unverified just because both other triggers happened to miss a row.
@app.periodic(cron="0 6 * * *", periodic_id="verify_pending_qa")  # daily; is_due below makes this the real gate
@app.task(queue="qa_generation")
async def verify_pending_qa_task(timestamp: int) -> dict:
    db = SessionLocal()
    try:
        if not is_due(db, REQUEST_TYPE_QA_VERIFICATION):
            return {"skipped": True, "reason": "not due yet"}

        job = start_job(db, REQUEST_TYPE_QA_VERIFICATION)
        try:
            result = await verify_pending_qa(db)
            close_job(db, job)
            return {"skipped": False, **result}
        except Exception:
            db.rollback()
            fail_job(db, job)
            raise
    finally:
        db.close()

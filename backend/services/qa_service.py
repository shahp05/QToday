"""
Orchestrates the subject/area/topic match -> validate -> generate -> save flow.

See conversation history for the full design rationale. Summary:
  1. Resolve the subject-field input — it may be a top-level subject
     ("Mathematics") or a sub-area name ("Calculus"). Either way, the
     existing UI is unchanged; classification happens here.
  2. Match topic within the resolved subject_area (not just subject) —
     this is what lets "Equilibrium" exist distinctly under Microeconomics
     vs Macroeconomics without colliding.
  3. If everything matches and QA exists for the grade -> return it.
  4. If matched but QA missing for the grade -> generate directly
     (skip validation; already-verified records don't need re-checking).
  5. If anything is unresolved -> validate via LLM (existence, subject-vs-area
     classification, country-specificity), re-match on the LLM's canonical
     names (catches typos), then create whatever's still missing.
"""
import asyncio
import json
import math
import traceback
from datetime import date, datetime

from sqlalchemy import func, select, text, tuple_
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import (
    BatchJob, Country, Customer, Grade, QA, Student, StudentGrade, Subject, SubjectArea, TeachLog, Topic, User,
)
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from llm.factory import LLMPurpose, get_llm_client
from services.allocation_service import active_cells, compute_allocation
from services.batch_job_service import close_job, fail_job, is_due, start_job
from services.error_log_service import log_error
from services.grade_rules import grade_name_range, target_grade_name
from services.session_service import get_current_session_id
from services.subject_icon_service import resolve_icon_key
from services.matching_service import match_subject, match_subject_area, match_subject_area_globally, match_topic
from services.text_utils import title_case

_GENERAL_AREA = "General"

_TYPE_INSTRUCTIONS = {
    "descriptive": (
        "Each item needs a free-text 'question' and a model 'answer' (string). No 'options' field."
    ),
    "mcq": (
        "Each item needs 'question', exactly 4 'options' (object with keys a/b/c/d, each a string), "
        "and 'answer' as the single correct option key (e.g. \"b\") — write the options so that "
        "EXACTLY ONE is correct. Never phrase the question or options such that more than one "
        "option is defensibly correct. Every distractor must be plausible but clearly wrong on "
        "inspection — never silly, never a paraphrase/subset of another option, and never rely on "
        "'All of the above' or 'None of the above' as an option."
    ),
    "true_false": (
        "Each item needs 'question' phrased as a single, unambiguous true/false statement, and "
        "'answer' as the string 'True' or 'False'. The statement must be objectively and wholly "
        "true or wholly false — never partially true, an opinion, or dependent on interpretation. "
        "Avoid trick wording; the statement should test the concept, not close reading."
    ),
}

# Per-difficulty-level briefs used when a level is generated on its own (top-
# up path, see submit_qa_top_up_batch) — keeps the model focused on exactly
# one complexity target instead of splitting attention across a mix.
_LEVEL_BRIEFS = {
    1: "basic recall — a single, straightforward fact or step",
    2: "basic application — direct, single-step application of the concept",
    3: "moderate — connects more than one idea, or a short multi-step solution",
    4: "advanced — long-tail, computational or analytical, multi-step",
    5: "most demanding — long-tail, computational and analytical, multi-step, "
       "at the edge of what's expected for the grade",
}


async def get_or_generate_qa(
    db: Session,
    *,
    subject_name: str,
    topic_name: str,
    grade: int,
    user_id: int,
    customer_id: int,
    section: str | None = None,
    log_date: date | None = None,
) -> dict:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    user_country_id = customer.country_id

    grade_row = db.execute(select(Grade).where(Grade.grade_name == grade)).scalar_one_or_none()
    if grade_row is None:
        raise AppError(ErrorCode.GRADE_INVALID, {"grade": grade})

    if grade_row.grade_id not in _get_customer_grade_ids(db, customer_id):
        raise AppError(ErrorCode.GRADE_NOT_OFFERED, {"grade": grade, "acronym": customer.customer_acronym})

    subject, subject_area = await _resolve_subject_input(db, subject_name, user_country_id)
    topic = (
        await match_topic(db, subject_area.subject_area_id, topic_name, user_country_id)
        if subject_area
        else None
    )

    if subject and subject_area and topic:
        return await _finalize(
            db, subject, topic, subject_area, grade_row, grade, user_id, customer_id, section, log_date
        )

    # Something unresolved (subject, area, and/or topic) — validate via LLM, then create.
    validation = await _validate_subject_topic(subject_name, topic_name, grade, user_country_id, db)
    if not validation.get("valid"):
        # Never the LLM's own free-text reason — only a code + the raw
        # values the teacher typed. Display wording lives entirely in
        # errorCodes.ts; changing it never requires a backend deploy.
        if not validation.get("subject_valid", True):
            raise AppError(ErrorCode.SUBJECT_INVALID, {"subject": subject_name})
        raise AppError(ErrorCode.TOPIC_NOT_IN_SUBJECT, {"topic": topic_name, "subject": subject_name, "grade": grade})

    canonical_subject_name = title_case(validation["canonical_subject_name"])
    canonical_area_name = (
        title_case(validation["canonical_area_name"]) if validation.get("canonical_area_name") else None
    )
    canonical_topic_name = title_case(validation["canonical_topic_name"])

    # Re-match on CANONICAL names before creating anything new — catches typos/variants
    # (e.g. "Mathematic" -> "Mathematics") whose raw form scored too low to match directly.
    if subject is None:
        subject = await match_subject(db, canonical_subject_name, user_country_id)
    if subject is None:
        subject_country_id = user_country_id if validation.get("subject_is_country_specific") else None
        # is_verified=False: this row exists on the validate-LLM's say-so, not
        # a human's — same "pending review" meaning as QA.is_verified, not
        # "an LLM decided this is fine."
        subject = Subject(
            subject_name=canonical_subject_name,
            country_id=subject_country_id,
            icon_key=resolve_icon_key(canonical_subject_name),
            is_verified=False,
        )
        db.add(subject)
        db.flush()

    if subject_area is None:
        if canonical_area_name:
            subject_area = await match_subject_area(db, subject.subject_id, canonical_area_name)
            if subject_area is None:
                subject_area = SubjectArea(
                    subject_id=subject.subject_id, area_name=canonical_area_name, is_verified=False
                )
                db.add(subject_area)
                db.flush()
        else:
            subject_area = _get_or_create_general_area(db, subject.subject_id)

    if topic is None:
        topic = await match_topic(db, subject_area.subject_area_id, canonical_topic_name, user_country_id)
    if topic is None:
        topic_country_id = user_country_id if validation.get("topic_is_country_specific") else None
        topic = Topic(
            subject_id=subject.subject_id,
            subject_area_id=subject_area.subject_area_id,
            topic_name=canonical_topic_name,
            country_id=topic_country_id,
            is_verified=False,
        )
        db.add(topic)
        db.flush()

    return await _finalize(db, subject, topic, subject_area, grade_row, grade, user_id, customer_id, section, log_date)


def _get_customer_grade_ids(db: Session, customer_id: int) -> set[int]:
    """Grades this customer actually offers — derived from its active student
    roster, not a separate config table, since a school's grade range is
    whatever grades its uploaded students are actually in. Scoped to the
    CURRENT session — a grade only present in a not-yet-live pre-staged
    future roster shouldn't be loggable today."""
    current_session_id = get_current_session_id(db, customer_id)
    session_filter = (
        StudentGrade.session_id.is_(None) if current_session_id is None
        else StudentGrade.session_id == current_session_id
    )
    rows = db.execute(
        select(StudentGrade.grade_id)
        .join(Student, Student.student_id == StudentGrade.student_id)
        .where(
            Student.customer_id == customer_id, Student.is_active == True, StudentGrade.is_active == True,  # noqa: E712
            session_filter,
        )
        .distinct()
    ).scalars().all()
    return set(rows)


async def _finalize(
    db: Session,
    subject: Subject,
    topic: Topic,
    subject_area: SubjectArea,
    grade_row: Grade,
    grade: int,
    user_id: int,
    customer_id: int,
    section: str | None,
    log_date: date | None = None,
) -> dict:
    """Subject+topic+grade are all confirmed valid at this point — log the
    lesson unconditionally (point 4 of the spec: log even if QA fetch/
    generation fails), then best-effort fetch-or-generate the QA. The log is
    committed in its own transaction first so a failure partway through QA
    generation/insertion (which leaves the session needing a rollback) can
    never take the already-valid log write down with it."""
    grade_to_row = db.execute(
        select(Grade).where(Grade.grade_name == target_grade_name(grade))
    ).scalar_one()
    teach_log = TeachLog(
        user_id=user_id,
        customer_id=customer_id,
        subject_id=subject.subject_id,
        topic_id=topic.topic_id,
        grade_id=grade_row.grade_id,
        grade_to_id=grade_to_row.grade_id,
        section=section,
        session_id=get_current_session_id(db, customer_id),
    )
    if log_date is not None:
        # date_created doubles as "the date this lesson was taught" (see
        # teach_log_service.list_subjects_taught) — set explicitly to
        # backdate a lesson logged after the fact via the calendar, instead
        # of the server_default of now().
        teach_log.date_created = datetime.combine(log_date, datetime.now().time())
    db.add(teach_log)
    db.commit()

    warning_code = None
    try:
        qa_rows = await _get_verified_qa(db, subject, topic, subject_area, grade_row, grade)
        db.commit()
    except Exception as exc:
        db.rollback()
        qa_rows = []
        warning_code = ErrorCode.QA_GENERATION_FAILED
        log_error(
            db,
            type="api",
            error_code=ErrorCode.LLM_GENERATION_FAILED,
            user_id=user_id,
            description=str(exc),
            stack_trace=traceback.format_exc(),
            context={"subject_id": subject.subject_id, "topic_id": topic.topic_id, "grade_id": grade_row.grade_id},
        )
        db.commit()

    result = {
        "items": _serialize(qa_rows),
        "subject_id": subject.subject_id,
        # Canonical names, not the teacher's raw typed text — lets the
        # frontend cache this subject/topic locally (e.g. for the combobox
        # catalog) without drifting from what a fuzzy-match/LLM-canonicalize
        # pass may have resolved it to (e.g. "Math" -> "Mathematics").
        "subject_name": subject.subject_name,
        "topic_id": topic.topic_id,
        "topic_name": topic.topic_name,
        "grade_id": grade_row.grade_id,
    }
    if not qa_rows and not warning_code:
        warning_code = ErrorCode.QA_NONE_VERIFIED
    if warning_code:
        # Code only, same as every other user-facing message — the frontend
        # resolves it via errorCodes.ts, never a hardcoded string from here.
        result["warning_code"] = warning_code.value
    return result


async def _resolve_subject_input(
    db: Session, subject_name: str, user_country_id: int
) -> tuple[Subject | None, SubjectArea | None]:
    """The subject-field input may be a top-level subject ("Mathematics") or
    a sub-area name ("Calculus") — the UI doesn't distinguish, so this does.
    Returns (subject, subject_area); subject_area defaults to that subject's
    "General" area when the input matched as a plain subject. Returns
    (None, None) if neither matches — caller defers to LLM classification."""
    subject = await match_subject(db, subject_name, user_country_id)
    if subject:
        return subject, _get_or_create_general_area(db, subject.subject_id)

    area = await match_subject_area_globally(db, subject_name)
    if area:
        return db.get(Subject, area.subject_id), area

    return None, None


def _get_or_create_general_area(db: Session, subject_id: int) -> SubjectArea:
    existing = db.execute(
        select(SubjectArea).where(SubjectArea.subject_id == subject_id, SubjectArea.area_name == _GENERAL_AREA)
    ).scalar_one_or_none()
    if existing:
        return existing
    area = SubjectArea(subject_id=subject_id, area_name=_GENERAL_AREA, is_verified=True)
    db.add(area)
    db.flush()
    return area


def _find_existing_qa(db: Session, subject: Subject, topic: Topic, grade_row: Grade) -> list[QA]:
    return db.execute(
        select(QA).where(
            QA.subject_id == subject.subject_id,
            QA.topic_id == topic.topic_id,
            QA.grade_id == grade_row.grade_id,
            QA.is_active == True,  # noqa: E712
        )
    ).scalars().all()


async def _get_verified_qa(
    db: Session, subject: Subject, topic: Topic, subject_area: SubjectArea, grade_row: Grade, grade: int
) -> list[QA]:
    """Only is_verified=True rows are ever handed back to a student — see
    _verify_qa_batch. Verification runs synchronously in this same request
    (rather than a detached background batch) so a topic is never served
    content nobody has checked, even on the very first lesson for it.
    Existing rows are already verified from a prior request, or still
    pending if a previous request died before verification ran; either way
    they're reused before generating anything new. A batch that fails
    verification entirely naturally falls through to a fresh generate
    attempt on the next call, since failed rows are marked is_active=False."""
    existing = _find_existing_qa(db, subject, topic, grade_row)
    verified = [q for q in existing if q.is_verified]
    pending = [q for q in existing if not q.is_verified]

    if pending:
        verified += await _verify_qa_batch(db, subject, topic, grade_row, pending)
        db.commit()

    if verified:
        return verified

    new_rows = await _generate_and_save_qa(db, subject, topic, subject_area, grade_row, grade)
    db.commit()
    return await _verify_qa_batch(db, subject, topic, grade_row, new_rows)


_FLAG_REASONS = ("incorrect", "unclear", "irrelevant")  # must match db.models.QA's chk_flag_reason


def _verify_item_payload(qa: QA) -> dict:
    """true_false is folded into the same shape as mcq — two options,
    answer given as the option key — so the verifier needs only one item
    shape, not a third branch (per .NET: boolean questions were treated as
    MCQ with two choices there too)."""
    if qa.question_type == "true_false":
        options = {"a": "True", "b": "False"}
        answer = "a" if qa.answer.strip().lower() == "true" else "b"
    else:
        options = qa.options
        answer = qa.answer
    return {"qa_id": qa.qa_id, "question": qa.question, "options": options, "answer": answer}


def _verify_max_tokens(total_items: int) -> int:
    """Output per item is tiny (qa_id + failed + a one-word reason), so this
    scales far more gently than generation's per-item budget."""
    return min(16000, 500 + 120 * total_items)


async def _verify_qa_batch(db: Session, subject: Subject, topic: Topic, grade_row: Grade, qa_rows: list[QA]) -> list[QA]:
    """One call checks every pending row together — subject/topic/country
    context is established once instead of repeated per row (same pattern
    as quiz_scoring_service._evaluate_batch). An independent expert-
    academician persona is shown each question AND its stored answer
    directly and asked to work out its own answer and compare — not a
    blind solve; matches the .NET version this is based on, and avoids a
    second answer needing to be derived and reconciled for every item.
    Passing sets is_verified=True. Failing (can't answer it, or the stored
    answer is wrong) retires the row (is_active=False, flag_reason) the
    same way a teacher's manual flag does. A row absent from the response —
    call failure, or the model just omitted it — is left untouched
    (still pending) for a later retry rather than punished for it."""
    if not qa_rows:
        return []

    country_id = topic.country_id or subject.country_id
    country = db.get(Country, country_id) if country_id else None
    country_txt = f"in {country.country_name}" if country else "globally"
    curriculum_txt = f" specific to the school curriculum in {country.country_name}" if country else ""

    items = [_verify_item_payload(qa) for qa in qa_rows]

    llm = get_llm_client(LLMPurpose.VALIDATE)
    result = await llm.generate_json(
        system=(
            f"You are an expert academician representing schools {country_txt}, and have deep "
            f"knowledge of the curriculum subject {subject.subject_name}, topic {topic.topic_name}."
        ),
        user=(
            f"Answer each question provided in the 'content' array below, using your knowledge of "
            f"the topic {topic.topic_name} in subject {subject.subject_name}{curriculum_txt}. "
            f"Questions and answers may be in LaTeX.\n\n"
            f"Follow these rules strictly:\n"
            f"(1) Work out your own answer to each question — select from 'options' when given, "
            f"otherwise answer directly.\n"
            f"(2) Check if your answer matches the given 'answer' (match the final answer only, "
            f"allowing for different wording or equivalent units).\n"
            f"(3) If you cannot understand or answer the question, or the given answer is wrong, "
            f'set "failed": true and set "reason" to whichever of {list(_FLAG_REASONS)} best fits. '
            f'Otherwise set "failed": false and "reason": null.\n'
            f'(4) Include "qa_id" from the input in every item of your response.\n\n'
            f"Output must be only the following JSON format, with no explanation, extra text, "
            f"characters or fields:\n"
            f'{{"content": {json.dumps(items)}}}'
        ),
        temperature=0.0,
        max_tokens=_verify_max_tokens(len(items)),
    )

    by_id = {qa.qa_id: qa for qa in qa_rows}
    passed = []
    for item in result.get("content", []):
        qa = by_id.get(item.get("qa_id"))
        if qa is None:
            continue
        if item.get("failed"):
            qa.is_verified = False
            qa.is_active = False
            qa.flag_reason = item.get("reason") if item.get("reason") in _FLAG_REASONS else "incorrect"
        else:
            qa.is_verified = True
            passed.append(qa)
    return passed


def _pending_qa_groups(db: Session) -> list[tuple[int, int, int]]:
    return db.execute(
        select(QA.subject_id, QA.topic_id, QA.grade_id)
        .where(QA.is_verified == False, QA.is_active == True)  # noqa: E712
        .distinct()
    ).all()


async def verify_pending_qa(db: Session) -> dict:
    """Daily sweep (jobs/tasks.py:verify_pending_qa_task) — the third of
    three places the quality-check call fires (real-time fetch in
    _get_verified_qa; right after a batch top-up lands in
    poll_and_finalize_qa_batch; and this, independently, once a day) so
    nothing generated ever sits permanently unverified just because both of
    the other triggers happened to miss it — e.g. a batch job whose
    generation succeeded but whose verify call then errored (rows are left
    pending exactly for this to pick up, see poll_and_finalize_qa_batch),
    or any other path that saved QA rows without a verification pass
    completing. Groups pending rows by (subject, topic, grade) — the
    context _verify_qa_batch needs — and verifies one group at a time
    (sequential, not gathered: all groups share this one db Session, which
    isn't safe for concurrent use). A group whose call fails is rolled back
    and left pending for tomorrow's sweep rather than aborting the rest."""
    groups = _pending_qa_groups(db)

    groups_processed = 0
    verified_count = 0
    for subject_id, topic_id, grade_id in groups:
        subject = db.get(Subject, subject_id)
        topic = db.get(Topic, topic_id)
        grade_row = db.get(Grade, grade_id)
        if subject is None or topic is None or grade_row is None:
            continue

        pending_rows = db.execute(
            select(QA).where(
                QA.subject_id == subject_id, QA.topic_id == topic_id, QA.grade_id == grade_id,
                QA.is_verified == False, QA.is_active == True,  # noqa: E712
            )
        ).scalars().all()
        if not pending_rows:
            continue

        try:
            verified = await _verify_qa_batch(db, subject, topic, grade_row, pending_rows)
            db.commit()
        except Exception:
            db.rollback()
            continue

        groups_processed += 1
        verified_count += len(verified)

    return {"groups_found": len(groups), "groups_processed": groups_processed, "verified": verified_count}


# Must be >= jobs/tasks.py:generate_missing_qa_task's cron interval (30
# minutes): the real-time path commits teach_log BEFORE its own QA
# generate-and-verify call finishes (see _finalize), so a triple can sit
# with zero QA rows for the whole duration of that in-flight call. Without
# this buffer, a sweep landing inside that window would start a second,
# parallel generation for the same triple — wasted LLM spend and a
# duplicated question set, since qa has no uniqueness constraint on
# content. logged_at (not date_created, which qa_service._finalize
# backdates for calendar-logged lessons) is the real insertion time, so
# this buffer holds even for backdated rows.
_MISSING_QA_BUFFER_MINUTES = 30


def _teach_log_triples_missing_qa(db: Session) -> list[tuple[int, int, int]]:
    """Distinct (subject, topic, grade) triples missing QA — spanning not
    just each teach_log's own taught grade but every grade_name from that
    grade through its grade_to_id (services.grade_rules), so a topic
    taught at grade 3 also gets QA prepared for grades 4-5: a student who
    has since advanced past grade 3 can still quiz on it for retention.
    This naturally subsumes the original real-time-failure fallback too —
    the taught grade itself is always the first grade in its own range —
    without a separate code path. Excludes teach_logs younger than
    _MISSING_QA_BUFFER_MINUTES (logged_at, not date_created — see that
    constant's comment) so a still-in-flight real-time generation for the
    taught grade is never double-triggered.

    Range math is done entirely on grade_name (the real 1-12 grade
    number), never grade_id — grade_id isn't sequential with grade_name
    (seeded in migration order, not grade order), so walking grade_id
    values directly would produce a meaningless range."""
    groups = db.execute(
        select(TeachLog.subject_id, TeachLog.topic_id, TeachLog.grade_id, TeachLog.grade_to_id)
        .where(
            TeachLog.is_active == True,  # noqa: E712
            TeachLog.logged_at <= func.now() - text(f"interval '{_MISSING_QA_BUFFER_MINUTES} minutes'"),
        )
        .distinct()
    ).all()
    if not groups:
        return []

    grades = db.execute(select(Grade)).scalars().all()
    name_by_id = {g.grade_id: g.grade_name for g in grades}
    id_by_name = {g.grade_name: g.grade_id for g in grades}

    candidates: set[tuple[int, int, int]] = set()
    subject_topic_pairs: set[tuple[int, int]] = set()
    for subject_id, topic_id, grade_id, grade_to_id in groups:
        start_name = name_by_id.get(grade_id)
        end_name = name_by_id.get(grade_to_id)
        if start_name is None or end_name is None:
            continue
        subject_topic_pairs.add((subject_id, topic_id))
        for grade_name in range(start_name, end_name + 1):
            target_grade_id = id_by_name.get(grade_name)
            if target_grade_id is not None:
                candidates.add((subject_id, topic_id, target_grade_id))

    if not candidates:
        return []

    existing = db.execute(
        select(QA.subject_id, QA.topic_id, QA.grade_id)
        .where(
            QA.is_active == True,  # noqa: E712
            tuple_(QA.subject_id, QA.topic_id).in_(list(subject_topic_pairs)),
        )
        .distinct()
    ).all()
    existing_set = {(s, t, g) for s, t, g in existing}

    return [c for c in candidates if c not in existing_set]


async def generate_missing_qa(db: Session) -> dict:
    """Periodic sweep (jobs/tasks.py:generate_missing_qa_task) that (a)
    retries real-time QA generation that failed at teach-log time, and (b)
    proactively prepares QA for the retention grade range each teach_log
    defines (grade_id through grade_to_id — see
    _teach_log_triples_missing_qa). Subject/topic/grade are already
    resolved by the time a teach_log exists — logging a lesson only
    happens after get_or_generate_qa matched or created them — so unlike
    get_or_generate_qa there is no fuzzy-match/LLM-validate step here;
    this reuses _get_verified_qa directly, the exact function the
    real-time path calls once a triple is already resolved, so generation
    behaves identically either way. Runs sequentially, one triple at a
    time (shares this one db Session — not safe for concurrent use, same
    reasoning as verify_pending_qa above). A triple whose call fails is
    logged and skipped rather than aborting the rest of the sweep."""
    triples = _teach_log_triples_missing_qa(db)

    processed = 0
    generated_count = 0
    failed = 0
    for subject_id, topic_id, grade_id in triples:
        subject = db.get(Subject, subject_id)
        topic = db.get(Topic, topic_id)
        grade_row = db.get(Grade, grade_id)
        if (
            subject is None or not subject.is_active
            or topic is None or not topic.is_active
            or grade_row is None or not grade_row.is_active
        ):
            continue
        subject_area = db.get(SubjectArea, topic.subject_area_id)
        if subject_area is None or not subject_area.is_active:
            continue

        try:
            qa_rows = await _get_verified_qa(db, subject, topic, subject_area, grade_row, grade_row.grade_name)
            db.commit()
        except Exception as exc:
            db.rollback()
            failed += 1
            log_error(
                db,
                type="batch",
                error_code=ErrorCode.LLM_GENERATION_FAILED,
                description=str(exc),
                stack_trace=traceback.format_exc(),
                context={"subject_id": subject_id, "topic_id": topic_id, "grade_id": grade_id},
            )
            continue

        processed += 1
        generated_count += len(qa_rows)

    return {"triples_found": len(triples), "processed": processed, "generated": generated_count, "failed": failed}


async def _validate_subject_topic(
    subject_name: str, topic_name: str, grade: int, user_country_id: int, db: Session
) -> dict:
    country = db.get(Country, user_country_id)
    country_name = country.country_name if country else "the student's country"

    llm = get_llm_client(LLMPurpose.VALIDATE)
    result = await llm.generate_json(
        system=(
            "You are an academic concept validator. You evaluate whether a subject/topic "
            "combination represents a real, valid academic concept for the given grade level. "
            "You evaluate CONCEPTS, not curricula — never reference any specific exam board "
            "or syllabus. Math and Science subjects are universal across all countries."
        ),
        user=(
            f'Input: "{subject_name}"\n'
            f'Topic: "{topic_name}"\n'
            f"Grade: {grade}\n"
            f"Student's country: {country_name}\n\n"
            f'1. Is "{subject_name}" a real, standalone academic subject (e.g. "Mathematics", '
            f'"Biology"), or a specialized AREA within a broader subject (e.g. "Calculus" is an '
            f'area within "Mathematics", "Macroeconomics" is an area within "Economics")? Set '
            f'subject_valid to false only if "{subject_name}" is neither — not a real subject nor '
            f"a real area of one.\n"
            f"2. Give the canonical title-cased name of the SUBJECT — the broader subject, even "
            f"if the input itself was an area name.\n"
            f'3. If the input was an area (not the subject itself), give the canonical title-cased '
            f"area name. Otherwise this field should be null.\n"
            f'4. Is "{topic_name}" a valid, real topic within that subject (and area, if any) '
            f"for grade {grade}? Set topic_valid to false if it is not a real topic, regardless of "
            f"whether the subject itself is valid.\n"
            f"5. Give the canonical title-cased topic name.\n"
            f"6. Is the SUBJECT itself inherently specific to {country_name} (rare — only true "
            f"if the subject has no meaning outside that country)?\n"
            f"7. Is the SUBJECT universal, but THIS TOPIC specific to {country_name} "
            f"(e.g. currency, regional context) even though the subject is universal?\n\n"
            f'Respond as JSON: {{"valid": true/false, "reason": "<if invalid, why>", '
            f'"subject_valid": true/false, "topic_valid": true/false, '
            f'"canonical_subject_name": "...", "canonical_area_name": "..." or null, '
            f'"canonical_topic_name": "...", '
            f'"subject_is_country_specific": true/false, "topic_is_country_specific": true/false}}'
        ),
        max_tokens=800,
    )
    return result


async def _generate_and_save_qa(
    db: Session, subject: Subject, topic: Topic, subject_area: SubjectArea, grade_row: Grade, grade: int
) -> list[QA]:
    """Real-time path — only ever reached when this topic/grade has no
    active QA at all yet (see _get_verified_qa), i.e. quizzes can't be
    played on it until this returns something. That's the ONE case where a
    count is given to the LLM at all, and even then only as a floor
    ('minimum'), not an exact target — see conversation history for why an
    exact-count instruction hurts question quality. Every later top-up
    (services.qa_service.submit_qa_top_up_batch) asks for no count
    whatsoever, directly or indirectly."""
    # +50% over what one quiz needs, so verification failures still leave
    # enough to actually play a quiz on the first try.
    min_count = math.ceil(get_setting("default_questions_per_quiz", 20) * 1.5)
    allocation = compute_allocation(min_count, grade)
    type_counts = {q_type: sum(levels.values()) for q_type, levels in allocation.items()}
    is_country_specific = subject.country_id is not None or topic.country_id is not None
    area_name = subject_area.area_name if subject_area.area_name != _GENERAL_AREA else None
    prior_failures = _get_prior_failures(db, topic, grade_row)
    existing_questions = _get_existing_questions(db, topic, grade_row)

    results = await asyncio.gather(
        *[
            _generate_type_batch(
                subject.subject_name, area_name, topic.topic_name, grade, q_type, count,
                is_country_specific, prior_failures, existing_questions,
            )
            for q_type, count in type_counts.items()
        ]
    )

    qa_rows = []
    for q_type, items in zip(type_counts.keys(), results):
        for item in items:
            qa_rows.append(
                QA(
                    subject_id=subject.subject_id,
                    topic_id=topic.topic_id,
                    grade_id=grade_row.grade_id,
                    question_type=q_type,
                    question=item["question"],
                    answer=_format_answer(item["answer"]),
                    options=item.get("options"),
                    difficulty_level=item["difficulty_level"],
                    expected_time_seconds=item.get("eta"),
                    is_verified=False,  # confirmed by _verify_qa_batch before being served
                )
            )
    db.add_all(qa_rows)
    db.flush()
    return qa_rows


_PRIOR_FAILURE_LIMIT = 5


def _get_prior_failures(db: Session, topic: Topic, grade_row: Grade) -> list[dict]:
    """Previously generated items for this exact topic/grade that were pulled
    by _verify_qa_batch (is_active=False, flag_reason set) — fed back into the
    generation prompt so a systematic mistake isn't regenerated identically."""
    rows = db.execute(
        select(QA.question, QA.flag_reason)
        .where(
            QA.topic_id == topic.topic_id,
            QA.grade_id == grade_row.grade_id,
            QA.is_active == False,  # noqa: E712
            QA.flag_reason.in_(("incorrect", "unclear")),
        )
        .order_by(QA.date_modified.desc())
        .limit(_PRIOR_FAILURE_LIMIT)
    ).all()
    return [{"question": q, "reason": r} for q, r in rows]


def _prior_failures_block(prior_failures: list[dict]) -> str:
    if not prior_failures:
        return ""
    lines = "\n".join(f'- "{f["question"]}" (rejected: {f["reason"]})' for f in prior_failures)
    return (
        f"\nThe following previously generated questions for this exact topic and grade were "
        f"rejected during verification — do not repeat them, and avoid the same underlying "
        f"mistake:\n{lines}\n"
    )


def _get_existing_questions(db: Session, topic: Topic, grade_row: Grade) -> list[str]:
    """Every currently-active question (any type) already on file for this
    topic/grade, fed back into the generation prompt so the model can't
    produce a near-duplicate of something already served."""
    rows = db.execute(
        select(QA.question).where(
            QA.topic_id == topic.topic_id,
            QA.grade_id == grade_row.grade_id,
            QA.is_active == True,  # noqa: E712
        )
    ).scalars().all()
    return list(rows)


def _existing_questions_block(existing_questions: list[str]) -> str:
    if not existing_questions:
        return ""
    lines = "\n".join(f'- "{q}"' for q in existing_questions)
    return f"\nDo not duplicate or closely rephrase these existing questions:\n{lines}\n"


def _format_answer(answer) -> str:
    """MCQ answers come back as a list of option keys; store as comma-joined
    string to match the qa.answer TEXT column. Other types are already strings."""
    if isinstance(answer, list):
        return ",".join(answer)
    return str(answer)


def _generation_max_tokens(total_items: int) -> int:
    """Sized to the largest expected batch so a big qa_count doesn't get
    silently cut off mid-JSON — LLMClient.generate_json treats a truncated
    response (finish_reason == 'length') as a retryable failure rather than
    letting json.loads parse a partial payload."""
    return min(16000, 1000 + 400 * total_items)


def _validate_items(items: list, question_type: str) -> list[dict]:
    """Drop any item that doesn't structurally match what was requested.
    The LLM's JSON is otherwise trusted as-is — a malformed item (wrong
    option keys, an answer key that doesn't exist among the options, an
    out-of-range difficulty) would otherwise reach the DB and students
    unchecked."""
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if not isinstance(item.get("question"), str) or not item["question"].strip():
            continue
        if not isinstance(item.get("difficulty_level"), int) or not (1 <= item["difficulty_level"] <= 5):
            continue
        if item.get("answer") in (None, ""):
            continue

        if question_type == "mcq":
            options = item.get("options")
            if not isinstance(options, dict) or set(options.keys()) != {"a", "b", "c", "d"}:
                continue
            if not all(isinstance(v, str) and v.strip() for v in options.values()):
                continue
            if not isinstance(item["answer"], str) or item["answer"] not in options:
                continue
        elif question_type == "true_false":
            if item["answer"] not in ("True", "False"):
                continue

        valid.append(item)
    return valid


async def _generate_type_batch(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    question_type: str,
    count: int,
    is_country_specific: bool,
    prior_failures: list[dict],
    existing_questions: list[str],
) -> list[dict]:
    """Real-time path only (see _generate_and_save_qa) — one mixed-difficulty
    call asking for a MINIMUM of `count` (never 'exactly'), model's own
    judgement on the easy/hard split. If validation-eligible items come back
    under that floor, one bounded mechanical retry asks for the shortfall —
    a code-level guarantee that quizzes have enough to work with, without
    ever hardening the *prompt* itself into an exact-count demand."""
    if count <= 0:
        return []

    items = await _call_generate(
        subject_name, area_name, topic_name, grade, question_type, count,
        is_country_specific, prior_failures, existing_questions,
    )
    valid_items = _validate_items(items, question_type)

    shortfall = count - len(valid_items)
    if shortfall > 0:
        retry_items = await _call_generate(
            subject_name, area_name, topic_name, grade, question_type, shortfall,
            is_country_specific, prior_failures, existing_questions,
        )
        valid_items += _validate_items(retry_items, question_type)

    return valid_items


_TOPUP_MAX_TOKENS = 3000  # room for "a handful" of items per cell — a token ceiling, not a count told to the LLM


def _build_generate_request(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    question_type: str,
    is_country_specific: bool,
    prior_failures: list[dict],
    existing_questions: list[str],
    *,
    is_first_batch: bool,
    count: int | None = None,
    level: int | None = None,
) -> dict:
    """Builds the system/user/temperature/max_tokens for one generation
    call — pure, no LLM call — so the exact same prompt can be either
    awaited immediately (_call_generate, the real-time first-ever batch for
    a topic, `count` set) or queued as one line of an OpenAI Batch API
    submission (_build_topup_batch_lines, every top-up after that, `level`
    set, no count at all — see conversation history for why an exact- or
    even a minimum-count instruction is reserved for the real-time path
    only, where it's the difference between a quiz being playable or not)."""
    if is_first_batch:
        difficulty_instruction = (
            f"Generate a minimum of {count} questions. This is the first batch for this topic and "
            f"grade, so use your own judgement to produce a natural mix of easy, medium and hard "
            f"questions — assign each item a 'difficulty_level' from 1 (easiest) to 5 (hardest) "
            f"that honestly reflects it."
        )
        max_tokens = _generation_max_tokens(count)
    else:
        difficulty_instruction = (
            f"Generate new questions on this topic at difficulty_level {level}: "
            f"{_LEVEL_BRIEFS[level]}. Set 'difficulty_level' to {level} for every item. Write as "
            f"many meaningfully distinct, non-duplicate questions as you can for this topic at "
            f"this level — do not pad to reach any particular number; a handful of well-crafted "
            f"questions is better than a forced quantity, and it's fine to return few or even none "
            f"if the topic is genuinely exhausted at this level."
        )
        max_tokens = _TOPUP_MAX_TOKENS

    locale_instruction = (
        "This topic may be localized — use regional context (e.g. currency, place names) where "
        "natural and appropriate."
        if is_country_specific
        else "Keep all content universal — do NOT include currency symbols, place names, or any "
        "region-specific references."
    )
    area_line = f'Subject Area: "{area_name}"\n' if area_name else ""
    exam_level_instruction = _exam_level_instruction(grade)

    return {
        "system": (
            f"You are an expert academician with deep knowledge of the curriculum subject "
            f"{subject_name}. You generate academic practice questions that test CONCEPTUAL "
            f"understanding, not exam-board-specific phrasing or wording."
        ),
        "user": (
            f'Subject: "{subject_name}"\n'
            f"{area_line}"
            f'Topic: "{topic_name}"\n'
            f"Grade: {grade}\n"
            f"Question type: {question_type}\n\n"
            f"{difficulty_instruction}\n"
            f"{_TYPE_INSTRUCTIONS[question_type]}\n"
            f"{exam_level_instruction}\n"
            f"{_prior_failures_block(prior_failures)}"
            f"{_existing_questions_block(existing_questions)}\n"
            f"Follow these rules strictly:\n"
            f"(1) {locale_instruction}\n"
            f"(2) Do not add questions based on non-text content — images, audio, video, maps, "
            f"diagrams — or that require a physical action (underline, circle, tick/cross, etc.).\n"
            f"(3) Do not mention the student's grade or level in the question text.\n"
            f"(4) Do not add questions that are factually incorrect, ambiguous, or whose correct "
            f"answer could change over time or depends on real-time/current data (e.g. current "
            f"office-holders, latest statistics, today's date). Every question must have one "
            f"single, permanently correct answer.\n"
            f"(5) Do not invent or guess facts, statistics, dates, quotes, or attributions — only "
            f"use real-world facts you are confident are accurate; if unsure, write a question "
            f"that does not depend on that fact.\n"
            f"(6) Do not duplicate or repeat any question listed above as already existing or "
            f"previously rejected.\n"
            f"(7) Provide all content in English. If a question or answer contains a math "
            f"expression, write it in LaTeX compatible with KaTeX, wrapped in $...$ (inline) or "
            f"$$...$$ (block) — avoid \\begin{{align}}, \\newcommand, and other unsupported "
            f"environments.\n"
            f"(8) Estimate 'eta': the seconds a grade {grade} student would realistically need to "
            f"read and answer that specific question — short-answer items get a low eta even at "
            f"high difficulty, long/multi-step items get a higher one.\n\n"
            f'Respond as JSON: {{"items": [{{"question": "...", '
            f'"options": {{"a":"...","b":"...","c":"...","d":"..."}} or null, '
            f'"answer": ..., "difficulty_level": N, "eta": <seconds>}}, ...]}}'
        ),
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }


async def _call_generate(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    question_type: str,
    count: int,
    is_country_specific: bool,
    prior_failures: list[dict],
    existing_questions: list[str],
) -> list[dict]:
    if count <= 0:
        return []

    req = _build_generate_request(
        subject_name, area_name, topic_name, grade, question_type,
        is_country_specific, prior_failures, existing_questions,
        is_first_batch=True, count=count,
    )
    llm = get_llm_client(LLMPurpose.GENERATE)
    result = await llm.generate_json(**req)
    return result["items"]


def _exam_level_instruction(grade: int) -> str:
    """Grade 10 and grade 12 must target India's exam standards regardless
    of the student's actual country — per product spec, these two grades
    are universally benchmarked against the India curriculum (matches the
    qualifier10/qualifier12 constants from the prior .NET implementation:
    scoped to exactly grade 10 and grade 12, not their 9/11 neighbors)."""
    if grade == 10:
        return "IMPORTANT: Questions must be of highest-level complexity equivalent to grade 10 Board Exams in India."
    if grade == 12:
        return (
            "IMPORTANT: Questions must be of highest-level complexity equivalent to grade 12 Board "
            "Exams, IITJEE, NEET, CUET and other competitive exams in India."
        )
    return ""


def update_qa(db: Session, *, qa_id: int, user_id: int, customer_id: int, payload) -> dict:
    """Teacher-facing correction/flag path. Any teacher at a customer who has
    actually taught this (subject, topic) may edit or flag it — content
    edits assume good faith and mark the row verified; a flag pulls it out
    of future serving instead (is_active=False) but keeps the row for audit."""
    qa = db.get(QA, qa_id)
    if qa is None or not qa.is_active:
        raise AppError(ErrorCode.QA_NOT_FOUND)

    taught = db.execute(
        select(TeachLog.teach_log_id).where(
            TeachLog.customer_id == customer_id,
            TeachLog.subject_id == qa.subject_id,
            TeachLog.topic_id == qa.topic_id,
        )
    ).first()
    if taught is None:
        raise AppError(ErrorCode.AUTH_FORBIDDEN)

    if payload.flag_reason is not None:
        qa.is_active = False
        qa.flag_reason = payload.flag_reason
        db.commit()
        return {"qa_id": qa.qa_id, "is_active": False, "flag_reason": qa.flag_reason}

    if payload.question is not None:
        qa.question = payload.question
    if payload.answer is not None:
        qa.answer = payload.answer
    if payload.options is not None:
        qa.options = payload.options
    qa.is_verified = True

    # Frozen attribution footnote, visible to every school this QA is shared
    # with — not a live join, so it still reads correctly if the editor's
    # name or school changes later.
    user = db.get(User, user_id)
    customer = db.get(Customer, customer_id)
    qa.edited_by_name = user.user_name if user else None
    qa.edited_by_school = customer.customer_acronym if customer else None

    db.commit()
    return _serialize([qa])[0]


QA_GENERATION_REQUEST_TYPE = "qa_generation"


def _qa_pool_count(db: Session, subject_id: int, topic_id: int, grade_id: int) -> int:
    return db.execute(
        select(func.count()).select_from(QA).where(
            QA.subject_id == subject_id, QA.topic_id == topic_id, QA.grade_id == grade_id,
            QA.is_active == True, QA.is_verified == True,  # noqa: E712
        )
    ).scalar_one()


def should_top_up_qa(db: Session, *, subject_id: int, topic_id: int, grade_id: int) -> bool:
    """True if this (subject, topic, grade)'s verified+active QA pool is
    below qa_top_up_threshold, or it's been qa_generation's interval_days
    (45 by default) since the last successful top-up — whichever fires
    first. Read-only, no LLM call — gates whether jobs/tasks.py even bothers
    submitting a batch for this quiz submission."""
    threshold = get_setting("qa_top_up_threshold", 100)
    if _qa_pool_count(db, subject_id, topic_id, grade_id) < threshold:
        return True
    return is_due(db, QA_GENERATION_REQUEST_TYPE, subject_id=subject_id, topic_id=topic_id, grade_id=grade_id)


def _build_topup_batch_lines(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    cells: list[tuple[str, int]],
    is_country_specific: bool,
    prior_failures: list[dict],
    existing_questions: list[str],
) -> list[dict]:
    """One line per (question_type, difficulty_level) cell — no count
    anywhere, directly or indirectly (see conversation history: an
    exact-count instruction measurably hurts question quality, so only the
    very first, real-time batch for a topic ever gets one, and even that is
    phrased as a floor, not a target). custom_id encodes the cell so results
    can be routed back to the right QA rows once the batch lands."""
    lines = []
    for q_type, level in cells:
        req = _build_generate_request(
            subject_name, area_name, topic_name, grade, q_type,
            is_country_specific, prior_failures, existing_questions,
            is_first_batch=False, level=level,
        )
        lines.append({
            "custom_id": f"{q_type}:{level}",
            "question_type": q_type,
            "difficulty_level": level,
            **req,
        })
    return lines


async def submit_qa_top_up_batch(db: Session, *, subject_id: int, topic_id: int, grade_id: int) -> BatchJob | None:
    """Submits one OpenAI Batch API job covering the full top-up for a
    (subject, topic, grade) — called by jobs/tasks.py:top_up_qa_task once
    should_top_up_qa has confirmed one is due. Only the very first,
    teacher-triggered generation for a topic (_generate_and_save_qa, via
    get_or_generate_qa) is real-time; every top-up after that goes through
    here instead, trading immediacy (already a background job the student
    never waits on) for the Batch API's ~50% lower per-token cost — and,
    deliberately, for no item count at all: one call per (type, level) cell
    in the configured content mix, each asking for as many good, distinct
    questions as the model can produce, never a target number. Returns None
    if there was nothing to submit (no cells configured); the actual QA
    rows aren't created yet — jobs/tasks.py:poll_qa_generation_batches picks
    the result up once OpenAI finishes processing it."""
    subject = db.get(Subject, subject_id)
    topic = db.get(Topic, topic_id)
    grade_row = db.get(Grade, grade_id)
    if subject is None or topic is None or grade_row is None:
        return None

    cells = active_cells()
    if not cells:
        return None

    is_country_specific = subject.country_id is not None or topic.country_id is not None
    subject_area = db.get(SubjectArea, topic.subject_area_id)
    area_name = subject_area.area_name if subject_area.area_name != _GENERAL_AREA else None
    prior_failures = _get_prior_failures(db, topic, grade_row)
    existing_questions = _get_existing_questions(db, topic, grade_row)

    lines = _build_topup_batch_lines(
        subject.subject_name, area_name, topic.topic_name, grade_row.grade_name, cells,
        is_country_specific, prior_failures, existing_questions,
    )

    llm = get_llm_client(LLMPurpose.GENERATE)
    batch_id, input_file_id = await llm.submit_batch([
        {"custom_id": line["custom_id"], "system": line["system"], "user": line["user"],
         "temperature": line["temperature"], "max_tokens": line["max_tokens"]}
        for line in lines
    ])

    custom_id_map = [
        {"custom_id": line["custom_id"], "question_type": line["question_type"],
         "difficulty_level": line["difficulty_level"]}
        for line in lines
    ]
    return start_job(
        db, QA_GENERATION_REQUEST_TYPE,
        batch_id=batch_id, custom_ids=custom_id_map, file_ids={"input": input_file_id},
        subject_id=subject_id, topic_id=topic_id, grade_id=grade_id,
    )


async def poll_and_finalize_qa_batch(db: Session, job: BatchJob) -> dict:
    """Checks one pending qa_generation BatchJob against OpenAI's Batch API.
    Still running -> left untouched (checked again next poll). Failed/
    expired/cancelled -> fail_job. Completed -> download results, build+save
    QA rows (same validation/format path as the real-time generator), run
    the normal verification pass (_verify_qa_batch), close_job. Called by
    jobs/tasks.py:poll_qa_generation_batches, once per pending job."""
    llm = get_llm_client(LLMPurpose.GENERATE)
    status = await llm.get_batch_status(job.batch_id)

    if status["status"] in ("failed", "expired", "cancelled"):
        fail_job(db, job)
        return {"status": status["status"], "added": 0}
    if status["status"] != "completed":
        return {"status": status["status"], "added": 0}

    subject = db.get(Subject, job.subject_id)
    topic = db.get(Topic, job.topic_id)
    grade_row = db.get(Grade, job.grade_id)
    if subject is None or topic is None or grade_row is None:
        fail_job(db, job)
        return {"status": "orphaned", "added": 0}

    results = await llm.fetch_batch_results(status["output_file_id"])

    qa_rows = []
    for line in job.custom_ids or []:
        payload = results.get(line["custom_id"])
        if not payload:
            continue
        for item in _validate_items(payload.get("items", []), line["question_type"]):
            qa_rows.append(
                QA(
                    subject_id=subject.subject_id,
                    topic_id=topic.topic_id,
                    grade_id=grade_row.grade_id,
                    question_type=line["question_type"],
                    question=item["question"],
                    answer=_format_answer(item["answer"]),
                    options=item.get("options"),
                    difficulty_level=item["difficulty_level"],
                    expected_time_seconds=item.get("eta"),
                    is_verified=False,
                )
            )
    db.add_all(qa_rows)
    db.flush()
    db.commit()

    verified = await _verify_qa_batch(db, subject, topic, grade_row, qa_rows)
    db.commit()
    close_job(db, job)
    return {"status": "completed", "added": len(verified)}


def _serialize(qa_rows: list[QA]) -> list[dict]:
    return [
        {
            "qa_id": q.qa_id,
            "question_type": q.question_type,
            "question": q.question,
            "answer": q.answer,
            "options": q.options,
            "difficulty_level": q.difficulty_level,
            "is_verified": q.is_verified,
            "edited_by_name": q.edited_by_name,
            "edited_by_school": q.edited_by_school,
        }
        for q in qa_rows
    ]

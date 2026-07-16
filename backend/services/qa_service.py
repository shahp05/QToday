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
import traceback
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import Country, Customer, Grade, QA, Student, StudentGrade, Subject, SubjectArea, TeachLog, Topic, User
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from llm.factory import LLMPurpose, get_llm_client
from services.allocation_service import compute_allocation
from services.error_log_service import log_error
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
        "Each item needs 'question' phrased as a true/false statement, and 'answer' as the string "
        "'True' or 'False'."
    ),
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
        # Surface a fixed, generic message rather than the LLM's free-text
        # reason — the LLM's raw wording isn't something to show a teacher
        # verbatim, and it isn't specific about subject vs. topic either.
        if not validation.get("subject_valid", True):
            reason = "Check the subject you have entered"
        else:
            reason = "Check the topic you have entered"
        raise AppError(ErrorCode.SUBJECT_TOPIC_INVALID, {"reason": reason})

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
    whatever grades its uploaded students are actually in."""
    rows = db.execute(
        select(StudentGrade.grade_id)
        .join(Student, Student.student_id == StudentGrade.student_id)
        .where(Student.customer_id == customer_id, Student.is_active == True, StudentGrade.is_active == True)  # noqa: E712
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
    teach_log = TeachLog(
        user_id=user_id,
        customer_id=customer_id,
        subject_id=subject.subject_id,
        topic_id=topic.topic_id,
        grade_id=grade_row.grade_id,
        section=section,
    )
    if log_date is not None:
        # date_created doubles as "the date this lesson was taught" (see
        # teach_log_service.list_subjects_taught) — set explicitly to
        # backdate a lesson logged after the fact via the calendar, instead
        # of the server_default of now().
        teach_log.date_created = datetime.combine(log_date, datetime.now().time())
    db.add(teach_log)
    db.commit()

    warning = None
    try:
        qa_rows = await _get_verified_qa(db, subject, topic, subject_area, grade_row, grade)
        db.commit()
    except Exception as exc:
        db.rollback()
        qa_rows = []
        warning = "The lesson was logged, but question generation failed. Please try again."
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
        "topic_id": topic.topic_id,
        "grade_id": grade_row.grade_id,
    }
    if not qa_rows and not warning:
        warning = "No verified questions are available for this topic yet. Please try again."
    if warning:
        result["warning"] = warning
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
        verified += await _verify_qa_batch(pending)
        db.commit()

    if verified:
        return verified

    new_rows = await _generate_and_save_qa(db, subject, topic, subject_area, grade_row, grade)
    db.commit()
    return await _verify_qa_batch(new_rows)


async def _verify_qa_batch(qa_rows: list[QA]) -> list[QA]:
    """Generator/verifier pattern: an independent LLM call answers each
    question blind (never shown the stored answer, see _blind_solve) and its
    answer is graded against what's actually stored. Passing sets
    is_verified=True. Failing — either the question itself was unanswerable/
    ambiguous, or the derived answer doesn't match the stored one — retires
    the row (is_active=False, flag_reason) the same way a teacher's manual
    flag does, rather than leaving it to sit unverified and unserved
    forever. A verifier-call error (network/parse failure, not a content
    problem) leaves the row untouched so it's simply retried on a later
    request, instead of being punished for an infra hiccup."""
    results = await asyncio.gather(*[_verify_one(qa) for qa in qa_rows], return_exceptions=True)

    passed = []
    for qa, result in zip(qa_rows, results):
        if isinstance(result, BaseException):
            continue
        ok, flag_reason = result
        if ok:
            qa.is_verified = True
            passed.append(qa)
        else:
            qa.is_verified = False
            qa.is_active = False
            qa.flag_reason = flag_reason
    return passed


async def _verify_one(qa: QA) -> tuple[bool, str | None]:
    solved = await _blind_solve(qa)
    if not solved.get("answerable", True):
        return False, "unclear"

    derived = solved.get("answer")
    if qa.question_type == "descriptive":
        equivalent = await _check_equivalence(qa.question, derived, qa.answer)
        return (True, None) if equivalent else (False, "incorrect")

    matches = isinstance(derived, str) and derived.strip().lower() == qa.answer.strip().lower()
    return (True, None) if matches else (False, "incorrect")


async def _blind_solve(qa: QA) -> dict:
    """Independently answers the question WITHOUT ever seeing the stored
    answer — the model only sees what a student would see. Sending the
    'correct' answer alongside the question in the same call would make
    this a rubber stamp instead of a real check (anchoring bias)."""
    if qa.question_type == "mcq":
        options_block = "\n".join(f"{k}) {v}" for k, v in sorted(qa.options.items()))
        question_block = f'Question: "{qa.question}"\nOptions:\n{options_block}'
        answer_format = '"answer" as the single correct option key ("a", "b", "c", or "d")'
    elif qa.question_type == "true_false":
        question_block = f'Statement: "{qa.question}"\nIs this statement True or False?'
        answer_format = '"answer" as the string "True" or "False"'
    else:
        question_block = f'Question: "{qa.question}"'
        answer_format = '"answer" as your free-text answer'

    llm = get_llm_client(LLMPurpose.VALIDATE)
    return await llm.generate_json(
        system=(
            "You are a diligent student answering a practice question independently, without "
            "knowing what answer is expected. Solve it carefully and show your reasoning. If the "
            "question is ambiguous, has no single correct answer, or cannot be answered as "
            "written, say so honestly rather than guessing."
        ),
        user=(
            f"{question_block}\n\n"
            f'Respond as JSON: {{"answerable": true/false, "reasoning": "<your work>", {answer_format}}}'
        ),
        temperature=0.2,
        max_tokens=1000,
    )


async def _check_equivalence(question: str, derived_answer, stored_answer: str) -> bool:
    """Free-text answers can be phrased differently while meaning the same
    thing (e.g. "12" vs "twelve"), so equivalence is judged by the model
    rather than a string comparison that would false-negative on wording."""
    llm = get_llm_client(LLMPurpose.VALIDATE)
    result = await llm.generate_json(
        system=(
            "You judge whether two answers to the same question are substantively equivalent, "
            "allowing for different wording, formatting, or equivalent units — not exact text match."
        ),
        user=(
            f'Question: "{question}"\n'
            f'Answer A: "{derived_answer}"\n'
            f'Answer B: "{stored_answer}"\n\n'
            f'Respond as JSON: {{"equivalent": true/false}}'
        ),
        temperature=0.0,
        max_tokens=200,
    )
    return bool(result.get("equivalent"))


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
    qa_count = get_setting("qa_count", 30)
    allocation = compute_allocation(qa_count, grade)
    is_country_specific = subject.country_id is not None or topic.country_id is not None
    area_name = subject_area.area_name if subject_area.area_name != _GENERAL_AREA else None
    prior_failures = _get_prior_failures(db, topic, grade_row)

    results = await asyncio.gather(
        *[
            _generate_type_batch(
                subject.subject_name, area_name, topic.topic_name, grade, q_type, counts,
                is_country_specific, prior_failures,
            )
            for q_type, counts in allocation.items()
        ]
    )

    qa_rows = []
    for q_type, items in zip(allocation.keys(), results):
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


def _shortfall_by_level(requested: dict[int, int], valid_items: list[dict]) -> dict[int, int]:
    have: dict[int, int] = {}
    for item in valid_items:
        level = item["difficulty_level"]
        have[level] = have.get(level, 0) + 1
    return {level: max(0, count - have.get(level, 0)) for level, count in requested.items()}


async def _generate_type_batch(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    question_type: str,
    difficulty_counts: dict[int, int],
    is_country_specific: bool,
    prior_failures: list[dict],
) -> list[dict]:
    total = sum(difficulty_counts.values())
    if total == 0:
        return []

    items = await _call_generate(
        subject_name, area_name, topic_name, grade, question_type, difficulty_counts,
        is_country_specific, prior_failures,
    )
    valid_items = _validate_items(items, question_type)

    # One bounded retry for whatever fell out of validation, requesting
    # exactly the shortfall per difficulty level — not the whole batch again.
    remaining = _shortfall_by_level(difficulty_counts, valid_items)
    if sum(remaining.values()) > 0:
        retry_items = await _call_generate(
            subject_name, area_name, topic_name, grade, question_type, remaining,
            is_country_specific, prior_failures,
        )
        valid_items += _validate_items(retry_items, question_type)

    return valid_items


async def _call_generate(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    question_type: str,
    difficulty_counts: dict[int, int],
    is_country_specific: bool,
    prior_failures: list[dict],
) -> list[dict]:
    total = sum(difficulty_counts.values())
    if total == 0:
        return []

    counts_str = ", ".join(f"{n} at difficulty {level}" for level, n in difficulty_counts.items() if n > 0)
    locale_instruction = (
        "This topic may be localized — use regional context (e.g. currency, place names) where "
        "natural and appropriate."
        if is_country_specific
        else "Keep all content universal — do NOT include currency symbols, place names, or any "
        "region-specific references."
    )
    area_line = f'Subject Area: "{area_name}"\n' if area_name else ""
    exam_level_instruction = _exam_level_instruction(grade)

    llm = get_llm_client(LLMPurpose.GENERATE)
    result = await llm.generate_json(
        system=(
            "You generate academic practice questions focused on testing CONCEPTUAL understanding, "
            "not exam-board-specific phrasing or wording. Generate content in English only. "
            "Use LaTeX only for mathematical notation, restricted to syntax supported by KaTeX — "
            "avoid \\begin{align}, \\newcommand, and other unsupported environments. "
            "Wrap inline math in $...$ and block math in $$...$$. "
            "Do not invent or guess facts, statistics, dates, quotes, or attributions. Only use "
            "real-world facts you are confident are accurate; if you are not certain of a fact, "
            "write a question that does not depend on it."
        ),
        user=(
            f'Subject: "{subject_name}"\n'
            f"{area_line}"
            f'Topic: "{topic_name}"\n'
            f"Grade: {grade}\n"
            f"Question type: {question_type}\n\n"
            f"Generate exactly: {counts_str}\n"
            f"{_TYPE_INSTRUCTIONS[question_type]}\n"
            f"{locale_instruction}\n"
            f"{exam_level_instruction}\n"
            f"{_prior_failures_block(prior_failures)}\n"
            f"Difficulty guidance: levels 1-2 are recall/basic application. Levels 3-5 must be "
            f"long-tail, computational, analytical, and complex — level 5 being the most demanding.\n\n"
            f"For each item, work out the correct answer step-by-step (e.g. show the actual "
            f"arithmetic/logic) in a 'reasoning' field BEFORE writing 'answer' — commit to the "
            f"worked-out result rather than guessing, and make sure 'question'/'options'/'answer' "
            f"are all consistent with that reasoning.\n\n"
            f"Also estimate 'eta' — the time in seconds a student of that grade would realistically "
            f"need to read and answer THIS SPECIFIC question. Judge it per-question, weighing: "
            f"(a) how long-tail the question or expected answer is (a one-word/one-number answer "
            f"needs far less time than a multi-step written response), and (b) how conceptually "
            f"complex it is — whether answering requires combining multiple distinct concepts or "
            f"knowledge areas versus a single fact or operation. Do not default to a fixed number "
            f"per difficulty level or question type — a difficulty-5 question with a short, simple "
            f"answer should still get a low eta, and a difficulty-1 question should not be padded "
            f"up to some assumed minimum.\n\n"
            f'Respond as JSON: {{"items": [{{"question": "...", '
            f'"options": {{"a":"...","b":"...","c":"...","d":"..."}} or null, '
            f'"reasoning": "<step-by-step work>", "answer": ..., '
            f'"difficulty_level": N, "eta": <seconds>}}, ...]}}'
        ),
        temperature=0.3,
        max_tokens=_generation_max_tokens(total),
    )
    return result["items"]


def _exam_level_instruction(grade: int) -> str:
    """Grades 9-10 and 11-12 must target India's exam standards regardless
    of the student's actual country — per product spec, these grades are
    universally benchmarked against the India curriculum. Phrased as a
    difficulty/rigor target rather than naming exam boards, so the model
    calibrates depth without mimicking exam-paper phrasing or notation."""
    if grade in (9, 10):
        return (
            "Match the difficulty and depth expected of a strong Grade 9-10 student in India "
            "under CBSE/ICSE-level rigor, regardless of the student's actual country."
        )
    if grade in (11, 12):
        return (
            "Match the difficulty and depth expected of a strong Grade 11-12 student in India "
            "preparing for competitive entrance exams (IIT-JEE/NEET/CUET) and board-level rigor, "
            "regardless of the student's actual country."
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

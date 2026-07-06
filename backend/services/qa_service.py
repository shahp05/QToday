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

from sqlalchemy import select
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import Country, Customer, Grade, QA, Student, StudentGrade, Subject, SubjectArea, TeachLog, Topic
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from llm.factory import LLMPurpose, get_llm_client
from services.allocation_service import compute_allocation
from services.error_log_service import log_error
from services.matching_service import match_subject, match_subject_area, match_subject_area_globally, match_topic
from services.text_utils import title_case

_GENERAL_AREA = "General"

_TYPE_INSTRUCTIONS = {
    "descriptive": (
        "Each item needs a free-text 'question' and a model 'answer' (string). No 'options' field."
    ),
    "mcq": (
        "Each item needs 'question', exactly 4 'options' (object with keys a/b/c/d, each a string), "
        "and 'answer' as an array of the correct option key(s) — one or more may be correct."
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
) -> dict:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    user_country_id = customer.country_id

    grade_row = db.execute(select(Grade).where(Grade.grade_name == grade)).scalar_one_or_none()
    if grade_row is None:
        raise AppError(ErrorCode.GRADE_INVALID, {"grade": grade})

    if grade_row.grade_id not in _get_customer_grade_ids(db, customer_id):
        raise AppError(ErrorCode.GRADE_NOT_OFFERED, {"grade": grade})

    subject, subject_area = await _resolve_subject_input(db, subject_name, user_country_id)
    topic = (
        await match_topic(db, subject_area.subject_area_id, topic_name, user_country_id)
        if subject_area
        else None
    )

    if subject and subject_area and topic:
        return await _finalize(
            db, subject, topic, subject_area, grade_row, grade, user_id, customer_id, section
        )

    # Something unresolved (subject, area, and/or topic) — validate via LLM, then create.
    validation = await _validate_subject_topic(subject_name, topic_name, grade, user_country_id, db)
    if not validation.get("valid"):
        raise AppError(
            ErrorCode.SUBJECT_TOPIC_INVALID,
            {"reason": validation.get("reason", "This subject/topic combination could not be verified.")},
        )

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
        subject = Subject(subject_name=canonical_subject_name, country_id=subject_country_id, is_verified=True)
        db.add(subject)
        db.flush()

    if subject_area is None:
        if canonical_area_name:
            subject_area = await match_subject_area(db, subject.subject_id, canonical_area_name)
            if subject_area is None:
                subject_area = SubjectArea(
                    subject_id=subject.subject_id, area_name=canonical_area_name, is_verified=True
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
            is_verified=True,
        )
        db.add(topic)
        db.flush()

    return await _finalize(db, subject, topic, subject_area, grade_row, grade, user_id, customer_id, section)


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
) -> dict:
    """Subject+topic+grade are all confirmed valid at this point — log the
    lesson unconditionally (point 4 of the spec: log even if QA fetch/
    generation fails), then best-effort fetch-or-generate the QA. The log is
    committed in its own transaction first so a failure partway through QA
    generation/insertion (which leaves the session needing a rollback) can
    never take the already-valid log write down with it."""
    db.add(TeachLog(
        user_id=user_id,
        customer_id=customer_id,
        subject_id=subject.subject_id,
        topic_id=topic.topic_id,
        grade_id=grade_row.grade_id,
        section=section,
    ))
    db.commit()

    warning = None
    try:
        existing = _find_existing_qa(db, subject, topic, grade_row)
        qa_rows = existing or await _generate_and_save_qa(db, subject, topic, subject_area, grade_row, grade)
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

    result = {"items": _serialize(qa_rows)}
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
            f'1. Is "{subject_name}" a standalone academic subject (e.g. "Mathematics", "Biology"), '
            f'or is it a specialized AREA within a broader subject (e.g. "Calculus" is an area '
            f'within "Mathematics", "Macroeconomics" is an area within "Economics")?\n'
            f"2. Give the canonical title-cased name of the SUBJECT — the broader subject, even "
            f"if the input itself was an area name.\n"
            f'3. If the input was an area (not the subject itself), give the canonical title-cased '
            f"area name. Otherwise this field should be null.\n"
            f'4. Is "{topic_name}" a valid, real topic within that subject (and area, if any) '
            f"for grade {grade}?\n"
            f"5. Give the canonical title-cased topic name.\n"
            f"6. Is the SUBJECT itself inherently specific to {country_name} (rare — only true "
            f"if the subject has no meaning outside that country)?\n"
            f"7. Is the SUBJECT universal, but THIS TOPIC specific to {country_name} "
            f"(e.g. currency, regional context) even though the subject is universal?\n\n"
            f'Respond as JSON: {{"valid": true/false, "reason": "<if invalid, why>", '
            f'"canonical_subject_name": "...", "canonical_area_name": "..." or null, '
            f'"canonical_topic_name": "...", '
            f'"subject_is_country_specific": true/false, "topic_is_country_specific": true/false}}'
        ),
    )
    return result


async def _generate_and_save_qa(
    db: Session, subject: Subject, topic: Topic, subject_area: SubjectArea, grade_row: Grade, grade: int
) -> list[QA]:
    qa_count = get_setting("qa_count", 30)
    allocation = compute_allocation(qa_count, grade)
    is_country_specific = subject.country_id is not None or topic.country_id is not None
    area_name = subject_area.area_name if subject_area.area_name != _GENERAL_AREA else None

    results = await asyncio.gather(
        *[
            _generate_type_batch(
                subject.subject_name, area_name, topic.topic_name, grade, q_type, counts, is_country_specific
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
                    is_verified=False,  # verification runs as a separate batch process
                )
            )
    db.add_all(qa_rows)
    db.flush()
    return qa_rows


def _format_answer(answer) -> str:
    """MCQ answers come back as a list of option keys; store as comma-joined
    string to match the qa.answer TEXT column. Other types are already strings."""
    if isinstance(answer, list):
        return ",".join(answer)
    return str(answer)


async def _generate_type_batch(
    subject_name: str,
    area_name: str | None,
    topic_name: str,
    grade: int,
    question_type: str,
    difficulty_counts: dict[int, int],
    is_country_specific: bool,
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
            "Wrap inline math in $...$ and block math in $$...$$."
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
            f"{exam_level_instruction}\n\n"
            f"Difficulty guidance: levels 1-2 are recall/basic application. Levels 3-5 must be "
            f"long-tail, computational, analytical, and complex — level 5 being the most demanding.\n\n"
            f"For each item, work out the correct answer step-by-step (e.g. show the actual "
            f"arithmetic/logic) in a 'reasoning' field BEFORE writing 'answer' — commit to the "
            f"worked-out result rather than guessing, and make sure 'question'/'options'/'answer' "
            f"are all consistent with that reasoning.\n\n"
            f'Respond as JSON: {{"items": [{{"question": "...", '
            f'"options": {{"a":"...","b":"...","c":"...","d":"..."}} or null, '
            f'"reasoning": "<step-by-step work>", "answer": ..., '
            f'"difficulty_level": N}}, ...]}}'
        ),
        temperature=0.7,
    )
    return result["items"]


def _exam_level_instruction(grade: int) -> str:
    """Grades 9-10 and 11-12 must target India's exam standards regardless
    of the student's actual country — per product spec, these grades are
    universally benchmarked against the India curriculum."""
    if grade in (9, 10):
        return (
            "This must be at India's CBSE/ICSE Board exam level, regardless of the "
            "student's actual country."
        )
    if grade in (11, 12):
        return (
            "This must be at India's IIT-JEE, CUET, NEET, and Board exam level, "
            "regardless of the student's actual country."
        )
    return ""


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
        }
        for q in qa_rows
    ]

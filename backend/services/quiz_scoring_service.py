"""
Async LLM grading pass for whatever submit_quiz (quiz_service.py) couldn't
score outright. MCQ/true_false and exact-match descriptive answers are always
resolved in submit_quiz itself now — every row that reaches this module is a
descriptive answer that didn't exactly match its stored answer, still needing
a judgment call on partial/full credit.

Deferred from the /submit route as a Procrastinate task (jobs/tasks.py) so
the student isn't blocked waiting on the LLM call — see conversation history
for why polling was chosen over a push transport. Runs to completion
independently of the request, so it still finishes (and the DB still gets
updated) even if the student closes the app.
"""
import json
import re
import traceback
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from db.models import Board, Country, Grade, Quiz, QuizScore, Student, Subject, Topic
from errors.error_codes import ErrorCode
from llm.factory import LLMPurpose, get_llm_client
from services.error_log_service import log_error

_LATEX_PATTERN = re.compile(r"\$.+?\$")


def _has_latex(*texts: str | None) -> bool:
    return any(t and _LATEX_PATTERN.search(t) for t in texts)


class GradingContext:
    __slots__ = ("subject", "topic", "board", "country", "grade_name")

    def __init__(self, subject: Subject, topic: Topic, board: Board, country: Country, grade_name: str):
        self.subject = subject
        self.topic = topic
        self.board = board
        self.country = country
        self.grade_name = grade_name


def resolve_grading_context(db: Session, quiz: Quiz) -> GradingContext | None:
    """Everything an LLM grading prompt needs beyond the question itself.
    None if subject/topic/board/country is missing (a data-integrity gap
    upstream) — callers must not fall back to "unknown" placeholders for
    those, which would silently degrade every score/explanation the LLM
    produces. grade is the one exception: quizzes.grade_id is nullable, so a
    missing grade falls back to "unknown" rather than blocking scoring
    entirely over a single lenient/strict grading cue."""
    subject = db.get(Subject, quiz.subject_id)
    topic = db.get(Topic, quiz.topic_id)
    student = db.get(Student, quiz.student_id)
    # board comes straight off the student (NOT NULL there), not through the
    # nullable customer_id chain — country then comes off the board rather
    # than the customer, for the same reason.
    board = db.get(Board, student.board_id) if student else None
    country = db.get(Country, board.country_id) if board else None

    if not (subject and topic and board and country):
        return None

    grade = db.get(Grade, quiz.grade_id) if quiz.grade_id else None
    grade_name = str(grade.grade_name) if grade else "unknown"
    return GradingContext(subject=subject, topic=topic, board=board, country=country, grade_name=grade_name)


async def score_pending_quiz(db: Session, *, quiz_id: int) -> dict:
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        return {"skipped": True, "reason": "quiz not found"}

    pending = db.execute(
        select(QuizScore).where(QuizScore.quiz_id == quiz_id, QuizScore.is_scored == False)  # noqa: E712
    ).scalars().all()
    if not pending:
        _finalize_if_complete(db, quiz)
        return {"skipped": True, "reason": "nothing pending"}

    context = resolve_grading_context(db, quiz)
    if context is None:
        # Don't send the LLM "unknown" placeholders — skip this pass entirely
        # and leave every row is_scored=False so the periodic sweep
        # (score_stuck_quizzes below) picks the quiz up and retries later.
        return {"skipped": True, "reason": "scoring context missing"}

    try:
        items = await _evaluate_batch(pending, context)
    except Exception:
        return {"skipped": True, "reason": "LLM call failed"}

    # Matched by quiz_score_id, not position — a partial/reordered response
    # still scores whatever it did answer for; anything missing or malformed
    # stays is_scored=False for the periodic sweep (score_stuck_quizzes
    # below) to retry, rather than blocking the rows the LLM did handle
    # correctly.
    by_id = {quiz_score.quiz_score_id: quiz_score for quiz_score in pending}
    scored_count = 0
    for item in items:
        quiz_score = by_id.get(item.get("question_id"))
        if quiz_score is None:
            continue
        try:
            awarded = max(0.0, min(float(quiz_score.marks), float(item["score"])))
        except (KeyError, TypeError, ValueError):
            continue
        quiz_score.score = awarded
        quiz_score.is_scored = True
        scored_count += 1

    db.commit()
    _finalize_if_complete(db, quiz)
    return {"skipped": False, "scored": scored_count, "failed": len(pending) - scored_count}


def _finalize_if_complete(db: Session, quiz: Quiz) -> None:
    remaining = db.execute(
        select(QuizScore.quiz_score_id).where(QuizScore.quiz_id == quiz.quiz_id, QuizScore.is_scored == False)  # noqa: E712
    ).first()
    if remaining is not None:
        return
    all_scores = db.execute(select(QuizScore.score).where(QuizScore.quiz_id == quiz.quiz_id)).scalars().all()
    quiz.total_score = sum(s or 0 for s in all_scores)
    quiz.date_scored = datetime.now(timezone.utc)
    db.commit()


_STUCK_QUIZ_BUFFER_MINUTES = 30


async def score_stuck_quizzes(db: Session) -> dict:
    """Periodic sweep (jobs/tasks.py:score_stuck_quizzes_task) — the retry
    path for score_quiz_task's single at-submit-time attempt. That task
    only ever runs once, right after a student submits; if the LLM call
    inside score_pending_quiz fails (rate limit, timeout, transient error —
    see its `except Exception` branch) or the grading context is briefly
    unavailable, the quiz was previously left "scoring in progress" forever
    with nothing to retry it. This finds every quiz still carrying an
    unscored QuizScore row and calls score_pending_quiz again for each.
    Excludes quizzes younger than _STUCK_QUIZ_BUFFER_MINUTES (date_created)
    so a still-in-flight real-time scoring pass from /submit is never
    double-triggered. Runs sequentially, one quiz at a time, sharing this
    one db Session — same reasoning as qa_service.generate_missing_qa. A
    quiz whose retry raises is logged and skipped rather than aborting the
    rest of the sweep."""
    quiz_ids = [row.quiz_id for row in db.execute(
        select(Quiz.quiz_id)
        .join(QuizScore, QuizScore.quiz_id == Quiz.quiz_id)
        .where(
            Quiz.is_active == True,  # noqa: E712
            Quiz.date_scored.is_(None),
            QuizScore.is_scored == False,  # noqa: E712
            Quiz.date_created <= func.now() - text(f"interval '{_STUCK_QUIZ_BUFFER_MINUTES} minutes'"),
        )
        .distinct()
    ).all()]

    processed = 0
    scored = 0
    still_pending = 0
    for quiz_id in quiz_ids:
        try:
            result = await score_pending_quiz(db, quiz_id=quiz_id)
        except Exception as exc:
            db.rollback()
            still_pending += 1
            log_error(
                db,
                type="batch",
                error_code=ErrorCode.LLM_GENERATION_FAILED,
                description=str(exc),
                stack_trace=traceback.format_exc(),
                context={"quiz_id": quiz_id},
            )
            continue

        processed += 1
        if result.get("skipped"):
            still_pending += 1
        else:
            scored += result.get("scored", 0)

    return {"quizzes_found": len(quiz_ids), "processed": processed, "scored": scored, "still_pending": still_pending}


async def _evaluate_batch(pending: list[QuizScore], context: GradingContext) -> list[dict]:
    """One call grades every pending question in the quiz together — country/
    board/topic/subject/grade context is established once instead of being
    repeated per question. Every row here is a descriptive answer that failed
    an exact-match against its stored answer (see module docstring), so there
    is no default/reference answer worth sending: the student's own wording
    will rarely match it verbatim regardless of whether the answer is right,
    and the LLM judges correctness from its own knowledge of the question —
    the same way a teacher grades free-text answers without an answer key."""
    items = [
        {
            "question_id": quiz_score.quiz_score_id,
            "question": quiz_score.question,
            "answer": quiz_score.student_response,
            "marks": float(quiz_score.marks),
            "score": "",
        }
        for quiz_score in pending
    ]

    llm = get_llm_client(LLMPurpose.VALIDATE)
    result = await llm.generate_json(
        system=(
            f"You are an expert academician for schools in {context.country.country_name} "
            f"following the {context.board.board_name} board, and have deep knowledge of the topic "
            f"{context.topic.topic_name} in the curriculum subject {context.subject.subject_name}. "
            f"The student is of grade {context.grade_name}. Your task is to accurately evaluate and "
            f"score the student's answer for each question listed in the output json."
        ),
        user=(
            f"Evaluate each question and student's answer provided in the output json, and score "
            f"each answer on the total marks specified for each question.\n\n"
            f"Follow these rules strictly:\n"
            f"(1) Award full marks if the answer is fully correct.\n"
            f"(2) Award proportionate marks if the answer is partially correct.\n"
            f"(3) Award zero marks if the answer is wrong.\n"
            f"(4) Award marks leniently for junior grades 1 to 5, and strictly for grades 6 and "
            f"above.\n"
            f"(5) Return the marks awarded in \"score\" for every item — do not omit, merge, or "
            f"reorder items.\n\n"
            f"Output must be only the following JSON format, with no explanation, extra text, "
            f"characters or fields:\n"
            f'{{"content": {json.dumps(items)}}}'
        ),
        temperature=0.0,
        max_tokens=3200,
    )
    return result["content"]


def _build_challenge_display(quiz_score: QuizScore) -> tuple[str, str, str]:
    """Folds question-type framing (MCQ options, boolean choices) directly
    into the question/answer text so the challenge prompt doesn't need a
    separate format note per type — see conversation history for why this
    replaced the old options_block/answer_format_note split."""
    if quiz_score.question_type == "mcq":
        options = quiz_score.options
        option_lines = " ".join(f"({k}) {v}" for k, v in sorted(options.items()))
        question = f"{quiz_score.question} {option_lines}"
        default_answer = f"({quiz_score.answer}) {options[quiz_score.answer]}"
        student_answer = f"({quiz_score.student_response}) {options[quiz_score.student_response]}"
        return question, default_answer, student_answer

    if quiz_score.question_type == "true_false":
        question = f"{quiz_score.question} (a) True (b) False"
        return question, quiz_score.answer, quiz_score.student_response

    return quiz_score.question, quiz_score.answer, quiz_score.student_response


async def evaluate_challenge(
    quiz_score: QuizScore, *, context: GradingContext, grade_name: str, reason: str,
) -> dict:
    """A student disputing their score on one already-scored question. Unlike
    the batch grading pass above, this is a single synchronous call made
    directly from the request handler (quiz_service.challenge_quiz_question)
    while the student waits — there's no polling UI for it, so a failure here
    is raised straight back as an error rather than left pending for a retry.
    Marks can move in either direction: a re-check may find the original
    scoring pass (auto or LLM) was too generous, not just too strict.

    The default answer has already passed independent verification before
    ever being served to a student (see qa_service._verify_qa_batch) — this
    prompt does not ask the LLM to re-derive it from scratch, only to
    re-check it against the challenge reason and re-score the student."""
    question, default_answer, student_answer = _build_challenge_display(quiz_score)

    latex_note = ""
    if _has_latex(quiz_score.question, quiz_score.answer, quiz_score.student_response):
        latex_note = (
            "\nThis item includes LaTeX notation. Evaluate the underlying mathematical/conceptual "
            "content, not exact LaTeX syntax or formatting, unless the question specifically tests "
            "notation itself."
        )

    marks = float(quiz_score.marks)
    llm = get_llm_client(LLMPurpose.VALIDATE)
    return await llm.generate_json(
        system=(
            f"You are an expert academician in {context.country.country_name} following the "
            f"{context.board.board_name} board and have deep knowledge of the topic "
            f"{context.topic.topic_name} in the curriculum subject {context.subject.subject_name}. "
            f"A student of grade {grade_name} has challenged the marks awarded by the class teacher "
            f"and has provided the reason for the challenge. Your role is to re-check the default "
            f"answer, the student's answer, re-score the student accurately, and (a) provide the "
            f"correct answer if the default answer is wrong, and (b) re-score the student's answer "
            f"with explanation."
        ),
        user=(
            f"Re-check the given question, default answer, student's answer and the reason to "
            f"challenge the marks awarded. If the default answer is wrong, provide the correct "
            f"answer. Check the student's answer and award marks according to the rules specified "
            f"below.\n\n"
            f"Question: {question}\n"
            f"Default Answer: {default_answer}\n"
            f"Student Answer: {student_answer}\n"
            f"Full Marks: {marks}\n"
            f"Marks awarded to student: {float(quiz_score.score)}\n"
            f"Reason for challenge: {reason}"
            f"{latex_note}\n\n"
            f"Follow these rules strictly:\n"
            f"(1) If the default answer is correct, set stored_answer_correct=true; else set "
            f"stored_answer_correct=false and provide the correct answer in corrected_answer.\n"
            f"(2) If the student's answer is correct, award full {marks} marks.\n"
            f"(3) If the student's answer is partially correct, award partial marks as "
            f"appropriate.\n"
            f"(4) If the student's answer is wrong, award 0 marks.\n"
            f"(5) Return the student's marks in revised_score.\n"
            f"(6) Provide an explanation (concise and informative, like a teacher) in explanation "
            f"for the marks awarded, specifying the concepts the student should revise. Use second "
            f"person (\"you\", \"your\") sentence construct in your explanation.\n\n"
            f"Output must be only in the following JSON format, with no explanation, extra text, "
            f"characters or fields:\n"
            f'{{"stored_answer_correct": true/false, '
            f'"corrected_answer": "..." or null (only if stored_answer_correct is false), '
            f'"revised_score": <number, 0 to {marks}>, "explanation": "..."}}'
        ),
        temperature=0.0,
        max_tokens=800,
    )

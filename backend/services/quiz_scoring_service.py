"""
Async LLM grading pass for whatever submit_quiz (quiz_service.py) couldn't
score outright — a mismatched MCQ/true_false answer with no prior attempt to
trust, or a descriptive answer that didn't exactly match the stored text.

Deferred from the /submit route as a Procrastinate task (jobs/tasks.py) so
the student isn't blocked waiting on one LLM call per ambiguous question —
see conversation history for why polling was chosen over a push transport.
Runs to completion independently of the request, so it still finishes (and
the DB still gets updated) even if the student closes the app.
"""
import asyncio
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import QA, Board, Country, Quiz, QuizScore, Student, Subject, Topic
from llm.factory import LLMPurpose, get_llm_client

_LATEX_PATTERN = re.compile(r"\$.+?\$")


def _has_latex(*texts: str | None) -> bool:
    return any(t and _LATEX_PATTERN.search(t) for t in texts)


class GradingContext:
    __slots__ = ("subject", "topic", "board", "country")

    def __init__(self, subject: Subject, topic: Topic, board: Board, country: Country):
        self.subject = subject
        self.topic = topic
        self.board = board
        self.country = country


def resolve_grading_context(db: Session, quiz: Quiz) -> GradingContext | None:
    """Everything an LLM grading prompt needs beyond the question itself.
    None if any piece is missing (a data-integrity gap upstream) — callers
    must not fall back to "unknown" placeholders, which would silently
    degrade every score/explanation the LLM produces."""
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
    return GradingContext(subject=subject, topic=topic, board=board, country=country)


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
        # and leave every row is_scored=False so the periodic batch-scoring
        # process (planned; not yet built) picks the quiz up and retries once
        # this call runs again.
        return {"skipped": True, "reason": "scoring context missing"}

    results = await asyncio.gather(
        *[
            _evaluate_one(quiz_score, context.subject, context.topic, context.country.country_name, context.board.board_name)
            for quiz_score in pending
        ],
        return_exceptions=True,
    )

    scored_count = 0
    for quiz_score, result in zip(pending, results):
        if isinstance(result, BaseException):
            continue  # left is_scored=False — picked up by the next call for this quiz
        awarded = max(0.0, min(float(quiz_score.marks), float(result["awarded_score"])))
        quiz_score.score = awarded
        quiz_score.is_scored = True
        scored_count += 1

        if result.get("stored_answer_correct") is False and result.get("corrected_answer"):
            # Only the live QA row changes — QuizScore.answer stays frozen so
            # this and every already-scored quiz keeps reflecting what the
            # student actually saw (see QuizScore's class docstring). Future
            # quizzes on this qa_id pick up the correction; past ones don't.
            qa = db.get(QA, quiz_score.qa_id)
            if qa is not None:
                qa.answer = result["corrected_answer"]

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


async def _evaluate_one(
    quiz_score: QuizScore, subject: Subject, topic: Topic, country_name: str, board_name: str,
) -> dict:
    qa = quiz_score.qa  # frozen text lives on quiz_score itself; qa is only needed for its grade
    grade_name = qa.grade.grade_name if qa and qa.grade else "unknown"
    has_latex = _has_latex(quiz_score.question, quiz_score.answer, quiz_score.student_response)

    options_block = ""
    answer_format_note = ""
    if quiz_score.question_type == "mcq" and quiz_score.options:
        options_block = "\nOptions:\n" + "\n".join(f"{k}) {v}" for k, v in sorted(quiz_score.options.items()))
        answer_format_note = (
            "\nBoth the reference answer and the student's answer are given as option keys "
            "(a/b/c/d) referring to the Options listed above — resolve each key to its option "
            "text before judging it."
        )
    elif quiz_score.question_type == "true_false":
        answer_format_note = "\nBoth answers are the string \"True\" or \"False\"."

    latex_note = (
        "\nThis item includes LaTeX notation. Evaluate the underlying mathematical/conceptual "
        "content, not exact LaTeX syntax or formatting, unless the question specifically tests "
        "notation itself."
        if has_latex else ""
    )

    llm = get_llm_client(LLMPurpose.VALIDATE)
    result = await llm.generate_json(
        system=(
            f"You are an expert academician for schools in {country_name} following the "
            f"{board_name} board, with deep knowledge of the topic {topic.topic_name} in the "
            f"curriculum subject {subject.subject_name}. You are grading one quiz question at a "
            f"time and must return only the requested JSON, with no explanation, extra text, "
            f"characters, or fields outside it."
        ),
        user=(
            f"Grade: {grade_name}\n"
            f"Question type: {quiz_score.question_type}\n"
            f'Question: "{quiz_score.question}"{options_block}\n'
            f'Reference answer: "{quiz_score.answer}"\n'
            f'Student\'s answer: "{quiz_score.student_response}"\n'
            f"Marks available: {float(quiz_score.marks)}"
            f"{answer_format_note}{latex_note}\n\n"
            f"Follow these rules strictly:\n"
            f"(1) Actually work out the correct answer to this question yourself, step by step — "
            f"if it involves arithmetic, write out the calculation digit by digit rather than "
            f"estimating. Do not just check whether the reference answer looks plausible; compute "
            f"or derive the answer independently first, then compare. Do not simply assume the "
            f"reference answer is right.\n"
            f"(2) Compare your own answer to the reference answer. If they disagree, the "
            f"reference answer is wrong; note what the correct answer actually is.\n"
            f"(3) Score the student's answer against whichever answer is actually correct (your "
            f"own, if the reference was wrong).\n"
            f"(4) Award full marks if the student's answer is fully correct or equivalent in "
            f"meaning — judge concept/knowledge, not exact wording, spelling, or syntax, unless "
            f"the question specifically tests wording or syntax.\n"
            f"(5) Award proportionate marks only where the answer is genuinely partially correct "
            f"(mainly applies to descriptive answers).\n"
            f"(6) Award zero marks if the answer is wrong.\n"
            f"(7) Grade leniently for grades 1 to 5, and strictly for grade 6 and above.\n\n"
            f"Output must be only the following JSON format, with no explanation, extra text, "
            f"characters or fields. Fill 'reasoning' first — your own step-by-step worked answer, "
            f"shown in full and not skipped, the comparison against the reference, and the "
            f"justification for the score — before committing to the other fields:\n"
            f'{{"reasoning": "...", "stored_answer_correct": true/false, '
            f'"corrected_answer": "..." or null (only if stored_answer_correct is false), '
            f'"awarded_score": <number, 0 to {float(quiz_score.marks)}>}}'
        ),
        temperature=0.0,
        max_tokens=800,
    )
    return result


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

    The default answer has already passed independent blind-solve
    verification before ever being served to a student (see
    qa_service._verify_qa_batch) — this prompt does not ask the LLM to
    re-derive it from scratch, only to re-check it against the challenge
    reason and re-score the student."""
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

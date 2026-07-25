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


async def evaluate_challenge(
    quiz_score: QuizScore, *, context: GradingContext, grade_name: str, reason: str,
) -> dict:
    """A student disputing their score on one already-scored question. Unlike
    the batch grading pass above, this is a single synchronous call made
    directly from the request handler (quiz_service.challenge_quiz_question)
    while the student waits — there's no polling UI for it, so a failure here
    is raised straight back as an error rather than left pending for a retry.
    Marks can move in either direction: a re-check may find the original
    scoring pass (auto or LLM) was too generous, not just too strict."""
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
    return await llm.generate_json(
        system=(
            f"You are an expert academician in {context.country.country_name} following the "
            f"{context.board.board_name} board, with deep knowledge of the topic "
            f"{context.topic.topic_name} in the curriculum subject {context.subject.subject_name}. "
            f"A student of grade {grade_name} has challenged the marks awarded for this question "
            f"and provided a reason. Your role is to re-check the reference answer and the "
            f"student's answer, re-score the student accurately, and (a) correct the reference "
            f"answer if it is wrong, and (b) re-score the student's answer with an explanation."
        ),
        user=(
            f"Question type: {quiz_score.question_type}\n"
            f'Question: "{quiz_score.question}"{options_block}\n'
            f'Reference answer: "{quiz_score.answer}"\n'
            f'Student\'s answer: "{quiz_score.student_response}"\n'
            f"Full marks: {float(quiz_score.marks)}\n"
            f"Marks currently awarded: {float(quiz_score.score)}\n"
            f'Student\'s reason for challenging: "{reason}"'
            f"{answer_format_note}{latex_note}\n\n"
            f"Follow these rules strictly:\n"
            f"(1) Actually work out the answer to this question yourself, step by step — if it "
            f"involves arithmetic, write out the calculation digit by digit rather than "
            f"estimating. Do not just check whether the reference answer looks plausible; compute "
            f"or derive the answer independently first, then compare.\n"
            f"(2) If your own worked answer matches the reference answer, set "
            f"stored_answer_correct=true. If it disagrees, set it false and give your own answer "
            f"in corrected_answer.\n"
            f"(3) If the student's answer is fully correct or equivalent in meaning (judge "
            f"concept/knowledge, not exact wording or syntax, unless the question specifically "
            f"tests wording or syntax), award full marks.\n"
            f"(4) If the student's answer is partially correct, award proportionate marks as "
            f"appropriate (mainly applies to descriptive answers).\n"
            f"(5) If the student's answer is wrong, award 0 marks.\n"
            f"(6) Return the marks you actually arrive at in revised_score — this can be higher "
            f"or lower than what was currently awarded if the original scoring pass got it "
            f"wrong, not just a one-directional correction.\n"
            f"(7) Provide a concise, informative explanation (like a teacher would) for the marks "
            f"awarded, naming the concept(s) the student should revise if marks were lost. Write "
            f"it directly to the student, in second person ('you', 'your').\n\n"
            f"Output must be only the following JSON format, with no explanation, extra text, "
            f"characters or fields. Fill 'working' first — your own step-by-step derivation of the "
            f"answer, shown in full, not skipped — before committing to the other fields; "
            f"'explanation' is the separate, concise, student-facing summary for field (7):\n"
            f'{{"working": "...", "stored_answer_correct": true/false, '
            f'"corrected_answer": "..." or null (only if stored_answer_correct is false), '
            f'"revised_score": <number, 0 to {float(quiz_score.marks)}>, "explanation": "..."}}'
        ),
        temperature=0.0,
        max_tokens=800,
    )

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

from db.models import QA, Country, Customer, Quiz, QuizScore, Student, Subject, Topic
from llm.factory import LLMPurpose, get_llm_client

_LATEX_PATTERN = re.compile(r"\$.+?\$")


def _has_latex(*texts: str | None) -> bool:
    return any(t and _LATEX_PATTERN.search(t) for t in texts)


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

    subject = db.get(Subject, quiz.subject_id)
    topic = db.get(Topic, quiz.topic_id)
    student = db.get(Student, quiz.student_id)
    customer = db.get(Customer, student.customer_id) if student and student.customer_id else None
    country = db.get(Country, customer.country_id) if customer else None
    country_name = country.country_name if country else "the student's country"

    results = await asyncio.gather(
        *[_evaluate_one(quiz_score, subject, topic, country_name) for quiz_score in pending],
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


async def _evaluate_one(quiz_score: QuizScore, subject: Subject | None, topic: Topic | None, country_name: str) -> dict:
    qa = quiz_score.qa  # frozen text lives on quiz_score itself; qa is only needed for its grade
    grade_name = qa.grade.grade_name if qa and qa.grade else "unknown"
    has_latex = _has_latex(quiz_score.question, quiz_score.answer, quiz_score.student_response)

    options_block = ""
    if quiz_score.question_type == "mcq" and quiz_score.options:
        options_block = "\nOptions:\n" + "\n".join(f"{k}) {v}" for k, v in sorted(quiz_score.options.items()))

    latex_note = (
        "\nThis item includes LaTeX notation. Evaluate the underlying mathematical/conceptual "
        "content, not exact LaTeX syntax or formatting, unless the question specifically tests "
        "notation itself."
        if has_latex else ""
    )

    llm = get_llm_client(LLMPurpose.VALIDATE)
    result = await llm.generate_json(
        system=(
            "You are an academic grader reviewing one quiz question. Two things are stored for "
            "this question that you must both check: a reference answer (which may itself be "
            "wrong — this is part of a data-cleanup process) and a student's submitted answer. "
            "First judge whether the reference answer is actually correct. Then, using whichever "
            "answer is actually correct, score the student's submission."
        ),
        user=(
            f"Country: {country_name}\n"
            f"Subject: {subject.subject_name if subject else 'unknown'}\n"
            f"Topic: {topic.topic_name if topic else 'unknown'}\n"
            f"Grade: {grade_name}\n"
            f"Question type: {quiz_score.question_type}\n"
            f'Question: "{quiz_score.question}"{options_block}\n'
            f'Reference answer: "{quiz_score.answer}"\n'
            f'Student\'s answer: "{quiz_score.student_response}"\n'
            f"Marks available: {float(quiz_score.marks)}\n"
            f"{latex_note}\n\n"
            f"1. Is the reference answer correct? If not, give the correct answer instead.\n"
            f"2. Score the student's answer out of {float(quiz_score.marks)} marks against whichever "
            f"answer is actually correct — full marks if correct/equivalent, partial credit only "
            f"where genuinely appropriate (mainly for descriptive answers), 0 if incorrect. Judge "
            f"concept/knowledge, not exact wording or syntax, unless the question specifically "
            f"tests wording or syntax.\n\n"
            f'Respond as JSON: {{"stored_answer_correct": true/false, '
            f'"corrected_answer": "..." or null (only if stored_answer_correct is false), '
            f'"awarded_score": <number, 0 to {float(quiz_score.marks)}>, "reasoning": "..."}}'
        ),
        temperature=0.0,
        max_tokens=600,
    )
    return result

import math
import random
import re
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import QA, Quiz, QuizChallenge, QuizScore
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.auth_service import is_staff
from services.quiz_scoring_service import evaluate_challenge, resolve_grading_context
from services.session_service import get_current_session_id


def resolve_authorized_student_id(
    db: Session, *, claims: dict, requested_student_id: int | None,
) -> int:
    """A student can only ever see their own data — requested_student_id is
    optional for them (defaults to self) but must match if given. Either of
    a school's own staff (is_staff — sys admin or teacher) or a system admin
    can look up any student, but only within their own school (system
    admin: any school). Parent access is deferred (see
    teach_log_service._scope_clause for the same note on the read side)."""
    if claims.get("is_student"):
        own = db.execute(
            text("SELECT student_id FROM students WHERE user_id = :uid AND is_active = TRUE"),
            {"uid": claims["user_id"]},
        ).first()
        if own is None:
            raise AppError(ErrorCode.STUDENT_NOT_FOUND)
        if requested_student_id is not None and requested_student_id != own.student_id:
            raise AppError(ErrorCode.AUTH_FORBIDDEN)
        return own.student_id

    if is_staff(claims) or claims.get("is_system_admin"):
        if requested_student_id is None:
            raise AppError(ErrorCode.VALIDATION_ERROR)
        if claims.get("is_system_admin"):
            row = db.execute(
                text("SELECT student_id FROM students WHERE student_id = :sid AND is_active = TRUE"),
                {"sid": requested_student_id},
            ).first()
        else:
            row = db.execute(
                text("""
                    SELECT student_id FROM students
                    WHERE student_id = :sid AND customer_id = :cid AND is_active = TRUE
                """),
                {"sid": requested_student_id, "cid": claims.get("customer_id")},
            ).first()
        if row is None:
            raise AppError(ErrorCode.STUDENT_NOT_FOUND)
        return requested_student_id

    raise AppError(ErrorCode.AUTH_FORBIDDEN)


def resolve_authorized_student_ids(
    db: Session, *, claims: dict, requested_student_ids: list[int],
) -> list[int]:
    """Batched sibling of resolve_authorized_student_id for the teacher
    class-status view (Students list) — there's no batch use case for a
    student looking up their own data, so only a school's own staff
    (is_staff — any student at their own school) or system admin (any
    student at all) may call this. Silently drops any id that doesn't
    resolve rather than erroring, since the caller only ever passes ids it
    already fetched from /students/mine."""
    if not requested_student_ids:
        return []
    if claims.get("is_system_admin"):
        rows = db.execute(
            text("SELECT student_id FROM students WHERE student_id = ANY(:sids) AND is_active = TRUE"),
            {"sids": requested_student_ids},
        ).fetchall()
    elif is_staff(claims):
        rows = db.execute(
            text("""
                SELECT student_id FROM students
                WHERE student_id = ANY(:sids) AND customer_id = :cid AND is_active = TRUE
            """),
            {"sids": requested_student_ids, "cid": claims.get("customer_id")},
        ).fetchall()
    else:
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    return [r.student_id for r in rows]


def get_class_quiz_progress(db: Session, *, student_ids: list[int]) -> dict:
    """Same per-topic stats get_student_quiz_progress computes, batched across
    many students in two queries instead of one round-trip per student — the
    source for the teacher Students list's per-subject status chips. Only
    student_avg_pct, last_score_pct, and last_played are needed there (the
    same fields topicSummaryStatus() in the frontend already keys its
    red/amber/green/not-played classification on), so max_score_pct and
    attempts — only used by the student's own Progress screen — are left out."""
    if not student_ids:
        return {"progress": []}

    avg_rows = db.execute(
        text("""
            SELECT student_id, topic_id, subject_id,
                   ROUND(AVG(total_score / total_marks * 100)) AS avg_pct
            FROM quizzes
            WHERE student_id = ANY(:sids) AND is_active = TRUE AND total_score IS NOT NULL
            GROUP BY student_id, topic_id, subject_id
        """),
        {"sids": student_ids},
    ).fetchall()
    if not avg_rows:
        return {"progress": []}

    # DISTINCT ON picks each student's newest quiz per topic, same technique
    # as get_student_quiz_progress's last_rows query.
    last_rows = db.execute(
        text("""
            SELECT DISTINCT ON (student_id, topic_id) student_id, topic_id,
                   ROUND(total_score / total_marks * 100) AS last_pct,
                   date_created::date AS last_played
            FROM quizzes
            WHERE student_id = ANY(:sids) AND is_active = TRUE AND total_score IS NOT NULL
            ORDER BY student_id, topic_id, date_created DESC
        """),
        {"sids": student_ids},
    ).fetchall()
    last_by_key = {(r.student_id, r.topic_id): r for r in last_rows}

    progress = [
        {
            "student_id": r.student_id,
            "topic_id": r.topic_id,
            "subject_id": r.subject_id,
            "student_avg_pct": float(r.avg_pct),
            "last_score_pct": float(last_by_key[(r.student_id, r.topic_id)].last_pct),
            "last_played": last_by_key[(r.student_id, r.topic_id)].last_played.isoformat(),
        }
        for r in avg_rows
    ]
    return {"progress": progress}


def get_student_quiz_progress(db: Session, *, student_id: int) -> dict:
    """Per-topic quiz stats for one student: their own average score, the
    best score across every student at the same school for that topic, the
    score and date of their most recent attempt, and how many attempts
    they've made. Only quizzes that have actually been scored (total_score
    IS NOT NULL) count toward averages — an in-progress/unscored quiz
    shouldn't drag down or inflate either number. Percentages are rounded to
    the nearest whole number since that's all the progress bars display."""
    customer_row = db.execute(
        text("SELECT customer_id FROM students WHERE student_id = :sid"),
        {"sid": student_id},
    ).first()
    customer_id = customer_row.customer_id if customer_row else None

    own_rows = db.execute(
        text("""
            SELECT topic_id, subject_id,
                   ROUND(AVG(total_score / total_marks * 100)) AS avg_pct,
                   MAX(date_created)::date AS last_played,
                   COUNT(*) AS attempts
            FROM quizzes
            WHERE student_id = :sid AND is_active = TRUE AND total_score IS NOT NULL
            GROUP BY topic_id, subject_id
        """),
        {"sid": student_id},
    ).fetchall()

    max_by_topic: dict[int, float] = {}
    last_by_topic: dict[int, float] = {}
    if own_rows:
        topic_ids = [r.topic_id for r in own_rows]

        if customer_id is not None:
            max_rows = db.execute(
                text("""
                    SELECT q.topic_id, ROUND(MAX(q.total_score / q.total_marks * 100)) AS max_pct
                    FROM quizzes q
                    JOIN students st ON st.student_id = q.student_id
                    WHERE st.customer_id = :cid AND q.topic_id = ANY(:tids)
                      AND q.is_active = TRUE AND q.total_score IS NOT NULL
                    GROUP BY q.topic_id
                """),
                {"cid": customer_id, "tids": topic_ids},
            ).fetchall()
            max_by_topic = {r.topic_id: float(r.max_pct) for r in max_rows}

        # DISTINCT ON picks the newest quizzes row per topic (Postgres
        # requires the leading ORDER BY column to match the DISTINCT ON
        # expression), giving the score of the student's most recent attempt.
        last_rows = db.execute(
            text("""
                SELECT DISTINCT ON (topic_id) topic_id,
                       ROUND(total_score / total_marks * 100) AS last_pct
                FROM quizzes
                WHERE student_id = :sid AND is_active = TRUE AND total_score IS NOT NULL
                  AND topic_id = ANY(:tids)
                ORDER BY topic_id, date_created DESC
            """),
            {"sid": student_id, "tids": topic_ids},
        ).fetchall()
        last_by_topic = {r.topic_id: float(r.last_pct) for r in last_rows}

    topics = [
        {
            "topic_id": r.topic_id,
            "subject_id": r.subject_id,
            "student_avg_pct": float(r.avg_pct),
            "max_score_pct": max_by_topic.get(r.topic_id, float(r.avg_pct)),
            "last_score_pct": last_by_topic.get(r.topic_id, float(r.avg_pct)),
            "last_played": r.last_played.isoformat(),
            "attempts": r.attempts,
        }
        for r in own_rows
    ]

    return {"topics": topics}


def _resolve_own_student_id(db: Session, claims: dict) -> int:
    if not claims.get("is_student"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    own = db.execute(
        text("SELECT student_id FROM students WHERE user_id = :uid AND is_active = TRUE"),
        {"uid": claims["user_id"]},
    ).first()
    if own is None:
        raise AppError(ErrorCode.STUDENT_NOT_FOUND)
    return own.student_id


def _assert_topic_taught(db: Session, *, student_id: int, topic_id: int, grade_id: int, customer_id: int) -> None:
    """sg.session_id is scoped to the student's own school's CURRENT
    session — a topic only taught against a not-yet-live pre-staged future
    roster's grade shouldn't be quizzable today."""
    current_session_id = get_current_session_id(db, customer_id)
    session_clause = "sg.session_id IS NULL" if current_session_id is None else "sg.session_id = :current_sid"
    params = {"sid": student_id, "topic_id": topic_id, "grade_id": grade_id}
    if current_session_id is not None:
        params["current_sid"] = current_session_id

    visible = db.execute(
        text(f"""
            SELECT 1
            FROM teach_logs tl
            JOIN student_grades sg ON sg.grade_id = tl.grade_id AND sg.is_active = TRUE
            WHERE sg.student_id = :sid AND tl.is_active = TRUE
              AND tl.topic_id = :topic_id AND tl.grade_id = :grade_id
              AND {session_clause}
            LIMIT 1
        """),
        params,
    ).first()
    if not visible:
        raise AppError(ErrorCode.TEACH_LOG_NOT_FOUND)


def get_quiz_questions(db: Session, *, claims: dict, topic_id: int, grade_id: int) -> dict:
    """A random sample of verified questions for a (topic, grade) a student
    is quizzing on. Deliberately re-scoped here rather than reusing
    teach_log_service.get_topic_grade_qa: that function is teacher-facing and
    doesn't filter is_verified, and it also returns 'answer' — neither of
    which should ever reach a student before they submit. Visibility is
    proven the same way as elsewhere: a teach_logs row showing this topic was
    actually taught to the student's own grade."""
    student_id = _resolve_own_student_id(db, claims)
    _assert_topic_taught(db, student_id=student_id, topic_id=topic_id, grade_id=grade_id, customer_id=claims["customer_id"])

    qa_rows = db.execute(
        text("""
            SELECT qa_id, question_type, question, options, difficulty_level
            FROM qa
            WHERE topic_id = :topic_id AND grade_id = :grade_id
              AND is_active = TRUE AND is_verified = TRUE
        """),
        {"topic_id": topic_id, "grade_id": grade_id},
    ).fetchall()

    # Same (count, marks-per-question) settings quizzes.total_marks is
    # documented as being snapshotted from — see schema.sql's QUIZZES
    # comment — so the number shown here always matches what a submitted
    # quiz would actually be scored out of.
    count = get_setting("default_questions_per_quiz", 20)
    marks_per_qa = get_setting("default_marks_per_qa", 5)
    selected = random.sample(qa_rows, min(count, len(qa_rows)))
    questions = [
        {
            "qa_id": r.qa_id,
            "question_type": r.question_type,
            "question": r.question,
            "options": r.options,
            "difficulty_level": r.difficulty_level,
        }
        for r in selected
    ]
    return {"questions": questions, "total_marks": len(questions) * marks_per_qa}


def _normalize(value: str | None) -> str:
    # Case-insensitive and blind to all whitespace (leading, trailing, and
    # inline) — an exact-match check for short answers (a word/number/
    # option key), not a text-similarity comparison.
    return re.sub(r"\s+", "", (value or "").lower())


def submit_quiz(db: Session, *, claims: dict, payload) -> dict:
    """Creates the Quiz/QuizScore rows for one play-through (no session is
    persisted at /start — the client just holds the qa_id list until this
    call). MCQ/true_false and exact-match descriptive answers are scored
    immediately; anything else is left is_scored=False for the async LLM
    pass (services/quiz_scoring_service.score_pending_quiz) to pick up —
    the caller (router) is responsible for deferring that job when
    pending_count > 0, since deferring is async and this function isn't."""
    student_id = _resolve_own_student_id(db, claims)
    _assert_topic_taught(db, student_id=student_id, topic_id=payload.topic_id, grade_id=payload.grade_id, customer_id=claims["customer_id"])

    if not payload.answers:
        raise AppError(ErrorCode.VALIDATION_ERROR)
    qa_ids = [a.qa_id for a in payload.answers]
    if len(set(qa_ids)) != len(qa_ids):
        raise AppError(ErrorCode.VALIDATION_ERROR)

    qa_rows = db.execute(
        select(QA).where(
            QA.qa_id.in_(qa_ids),
            QA.topic_id == payload.topic_id,
            QA.grade_id == payload.grade_id,
            QA.is_active == True,  # noqa: E712
            QA.is_verified == True,  # noqa: E712
        )
    ).scalars().all()
    qa_by_id = {q.qa_id: q for q in qa_rows}
    if len(qa_by_id) != len(qa_ids):
        raise AppError(ErrorCode.QA_NOT_FOUND)

    marks_per_qa = get_setting("default_marks_per_qa", 5)
    subject_id = qa_rows[0].subject_id

    quiz = Quiz(
        subject_id=subject_id,
        topic_id=payload.topic_id,
        grade_id=payload.grade_id,
        student_id=student_id,
        total_marks=len(qa_ids) * marks_per_qa,
        total_time_taken_seconds=payload.total_time_taken_seconds,
    )
    db.add(quiz)
    db.flush()

    pending_count = 0
    quiz_scores = []
    for a in payload.answers:
        qa = qa_by_id[a.qa_id]
        response = a.student_response if a.student_response and a.student_response.strip() else None
        score: float | None = None
        is_scored = False

        if response is None:
            score, is_scored = 0, True
        elif qa.question_type in ("mcq", "true_false"):
            # qa.answer is already independently verified before ever being
            # served (see qa_service._verify_qa_batch) — no "first attempt,
            # maybe the stored answer is wrong" escape hatch needed here.
            score, is_scored = (marks_per_qa if _normalize(response) == _normalize(qa.answer) else 0), True
        else:  # descriptive
            if _normalize(response) == _normalize(qa.answer):
                score, is_scored = marks_per_qa, True
            # else: leave unscored for LLM review

        if not is_scored:
            pending_count += 1

        quiz_scores.append(QuizScore(
            quiz_id=quiz.quiz_id,
            qa_id=qa.qa_id,
            question=qa.question,
            answer=qa.answer,
            options=qa.options,
            question_type=qa.question_type,
            student_response=response,
            marks=marks_per_qa,
            score=score,
            time_taken_seconds=a.time_taken_seconds,
            is_scored=is_scored,
        ))
    db.add_all(quiz_scores)

    total_score = None
    if pending_count == 0:
        total_score = sum(qs.score for qs in quiz_scores)
        quiz.total_score = total_score
        quiz.date_scored = datetime.now(timezone.utc)

    db.commit()

    return {
        "quiz_id": quiz.quiz_id,
        "total_marks": float(quiz.total_marks),
        "total_score": float(total_score) if total_score is not None else None,
        "is_scored": pending_count == 0,
        "pending_count": pending_count,
        # Not part of SubmitQuizResponse — read by the router to decide
        # which background jobs to defer (deferring is async; this isn't).
        "subject_id": subject_id,
        "grade_id": payload.grade_id,
    }


def get_student_quiz_history(db: Session, *, student_id: int) -> dict:
    """One row per quiz ever played by this student, across every subject,
    newest first — the source list for the student-facing Progress screen.
    Unlike get_student_quiz_progress (per-topic averages), this is per-attempt
    so the screen can show each play-through with its own date and score.
    Grade comes from the quiz's own grade_id (snapshotted at submit time, see
    submit_quiz), not the student's current grade — a topic can be replayed
    across grades over time (promotion, retake at a different section, etc.),
    and each attempt must keep showing the grade it was actually played at."""
    rows = db.execute(
        text("""
            SELECT q.quiz_id, q.subject_id, s.subject_name, q.topic_id, t.topic_name,
                   q.grade_id, g.grade_name,
                   q.date_created, q.total_marks, q.total_score,
                   (q.total_score IS NOT NULL) AS is_scored
            FROM quizzes q
            JOIN subjects s ON s.subject_id = q.subject_id
            JOIN topics t ON t.topic_id = q.topic_id
            LEFT JOIN grades g ON g.grade_id = q.grade_id
            WHERE q.student_id = :sid AND q.is_active = TRUE
            ORDER BY q.date_created DESC
        """),
        {"sid": student_id},
    ).fetchall()

    quizzes = [
        {
            "quiz_id": r.quiz_id,
            "subject_id": r.subject_id,
            "subject_name": r.subject_name,
            "topic_id": r.topic_id,
            "topic_name": r.topic_name,
            "grade_name": r.grade_name,
            "date_created": r.date_created.isoformat(),
            "total_marks": float(r.total_marks),
            "total_score": float(r.total_score) if r.total_score is not None else None,
            "is_scored": r.is_scored,
        }
        for r in rows
    ]
    return {"quizzes": quizzes}


def get_quiz_detail(db: Session, *, claims: dict, quiz_id: int) -> dict:
    """Per-question breakdown of a played quiz: the frozen question/options,
    the student's response, the correct answer, and the marks awarded — for
    the review screen a student opens from their Progress list. Only the
    quiz's own student may view it."""
    student_id = _resolve_own_student_id(db, claims)
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or not quiz.is_active or quiz.student_id != student_id:
        raise AppError(ErrorCode.QUIZ_NOT_FOUND)

    grade_name = None
    if quiz.grade_id is not None:
        grade_row = db.execute(
            text("SELECT grade_name FROM grades WHERE grade_id = :gid"), {"gid": quiz.grade_id},
        ).first()
        grade_name = grade_row.grade_name if grade_row else None

    scores = db.execute(
        select(QuizScore)
        .where(QuizScore.quiz_id == quiz_id, QuizScore.is_active == True)  # noqa: E712
        .order_by(QuizScore.quiz_score_id)
    ).scalars().all()

    # One resolved challenge per qa_id at most (challenge_quiz_question blocks
    # a second one) — reason/response are shown under the question whenever
    # a challenge exists, not just while a decision is pending.
    challenge_by_qa_id = {
        c.qa_id: c for c in db.execute(
            select(QuizChallenge).where(
                QuizChallenge.quiz_id == quiz_id, QuizChallenge.is_active == True,  # noqa: E712
            )
        ).scalars().all()
    }

    return {
        "quiz_id": quiz.quiz_id,
        "subject_id": quiz.subject_id,
        "topic_id": quiz.topic_id,
        "grade_name": grade_name,
        "date_created": quiz.date_created.isoformat(),
        "total_marks": float(quiz.total_marks),
        "total_score": float(quiz.total_score) if quiz.total_score is not None else None,
        "questions": [
            {
                "qa_id": qs.qa_id,
                "question_type": qs.question_type,
                "question": qs.question,
                "options": qs.options,
                "answer": qs.answer,
                "student_response": qs.student_response,
                "marks": float(qs.marks),
                "score": float(qs.score) if qs.score is not None else None,
                "is_scored": qs.is_scored,
                "challenge_reason": challenge_by_qa_id[qs.qa_id].challenge_reason if qs.qa_id in challenge_by_qa_id else None,
                "challenge_response": challenge_by_qa_id[qs.qa_id].challenge_response if qs.qa_id in challenge_by_qa_id else None,
            }
            for qs in scores
        ],
    }


async def challenge_quiz_question(db: Session, *, claims: dict, quiz_id: int, qa_id: int, reason: str) -> dict:
    """A student disputing how one of their answers was scored: re-grades the
    question via a single synchronous LLM call (evaluate_challenge) while the
    student waits, then applies whatever it decides — this quiz's own frozen
    score/answer, the quiz's total, and (if the reference answer was wrong)
    the live QA row for every future quiz on it. Only allowed on a question
    that's actually the caller's, already scored, answered, under full marks,
    and not already challenged. Nothing is written until the LLM call
    succeeds, so a failure (network/LLM error) leaves no trace — the student
    can just submit again."""
    student_id = _resolve_own_student_id(db, claims)
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or not quiz.is_active or quiz.student_id != student_id:
        raise AppError(ErrorCode.QUIZ_NOT_FOUND)

    quiz_score = db.execute(
        select(QuizScore).where(
            QuizScore.quiz_id == quiz_id, QuizScore.qa_id == qa_id, QuizScore.is_active == True,  # noqa: E712
        )
    ).scalar_one_or_none()
    if quiz_score is None or not quiz_score.is_scored:
        raise AppError(ErrorCode.QUIZ_NOT_FOUND)
    if not quiz_score.student_response:
        raise AppError(ErrorCode.VALIDATION_ERROR)
    if quiz_score.score is not None and float(quiz_score.score) >= float(quiz_score.marks):
        raise AppError(ErrorCode.VALIDATION_ERROR)

    if not reason or not reason.strip():
        raise AppError(ErrorCode.VALIDATION_ERROR)
    reason = reason.strip()

    already_challenged = db.execute(
        select(QuizChallenge.challenge_id).where(
            QuizChallenge.quiz_id == quiz_id, QuizChallenge.qa_id == qa_id, QuizChallenge.is_active == True,  # noqa: E712
        )
    ).first()
    if already_challenged:
        raise AppError(ErrorCode.VALIDATION_ERROR)

    context = resolve_grading_context(db, quiz)
    if context is None:
        raise AppError(ErrorCode.EXTERNAL_SERVICE_FAILED)

    grade_name = str(quiz_score.qa.grade.grade_name) if quiz_score.qa and quiz_score.qa.grade else "unknown"
    previous_score = float(quiz_score.score)
    try:
        result = await evaluate_challenge(quiz_score, context=context, grade_name=grade_name, reason=reason)
        revised_score = max(0.0, min(float(quiz_score.marks), float(result["revised_score"])))
    except Exception:
        raise AppError(ErrorCode.EXTERNAL_SERVICE_FAILED)

    explanation = result.get("explanation") or ""
    # The LLM only ever writes the answer explanation — whether the score
    # changed (up, down, or partially) is a plain number comparison, not
    # something worth asking the model to classify and prefix itself.
    if not math.isclose(revised_score, previous_score, abs_tol=1e-9):
        explanation = f"Revised score: {explanation}"
    quiz_score.score = revised_score
    if result.get("stored_answer_correct") is False and result.get("corrected_answer"):
        # Unlike the batch scoring pass, a challenge is an adjudicated
        # correction the student directly proved — so this quiz's own frozen
        # answer is updated too (not just the live QA row for future quizzes).
        quiz_score.answer = result["corrected_answer"]
        qa = db.get(QA, qa_id)
        if qa is not None:
            qa.answer = result["corrected_answer"]

    challenge = QuizChallenge(
        quiz_id=quiz_id, qa_id=qa_id, challenge_reason=reason, challenge_response=explanation,
        date_closed=datetime.now(timezone.utc),
    )
    db.add(challenge)

    all_scores = db.execute(select(QuizScore.score).where(QuizScore.quiz_id == quiz_id)).scalars().all()
    quiz.total_score = sum(s or 0 for s in all_scores)

    db.commit()
    db.refresh(challenge)

    return {
        "challenge_id": challenge.challenge_id,
        "date_created": challenge.date_created.isoformat(),
        "challenge_reason": reason,
        "challenge_response": explanation,
        "score": float(quiz_score.score),
        "marks": float(quiz_score.marks),
        "answer": quiz_score.answer,
        "total_score": float(quiz.total_score),
        "total_marks": float(quiz.total_marks),
    }


def get_quiz_status(db: Session, *, claims: dict, quiz_id: int) -> dict:
    student_id = _resolve_own_student_id(db, claims)
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or not quiz.is_active or quiz.student_id != student_id:
        raise AppError(ErrorCode.QUIZ_NOT_FOUND)

    pending_count = len(db.execute(
        select(QuizScore.quiz_score_id).where(QuizScore.quiz_id == quiz_id, QuizScore.is_scored == False)  # noqa: E712
    ).scalars().all())

    return {
        "quiz_id": quiz.quiz_id,
        "topic_id": quiz.topic_id,
        "total_marks": float(quiz.total_marks),
        "total_score": float(quiz.total_score) if quiz.total_score is not None else None,
        "is_scored": quiz.date_scored is not None,
        "pending_count": pending_count,
    }

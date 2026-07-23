from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from jobs.tasks import score_quiz_task, top_up_qa_task
from schemas.quiz import QuizStatusResponse, SubmitQuizRequest, SubmitQuizResponse
from services.auth_service import get_current_user
from services.quiz_service import (
    get_quiz_questions,
    get_quiz_status,
    get_student_quiz_progress,
    resolve_authorized_student_id,
    submit_quiz,
)

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.get("/progress")
def get_progress(
    student_id: int | None = None,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resolved_student_id = resolve_authorized_student_id(db, claims=claims, requested_student_id=student_id)
    return get_student_quiz_progress(db, student_id=resolved_student_id)


@router.get("/start")
def start_quiz(
    topic_id: int,
    grade_id: int,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_quiz_questions(db, claims=claims, topic_id=topic_id, grade_id=grade_id)


@router.post("/submit", response_model=SubmitQuizResponse)
async def submit_quiz_route(
    payload: SubmitQuizRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = submit_quiz(db, claims=claims, payload=payload)

    if result["pending_count"] > 0:
        await score_quiz_task.defer_async(quiz_id=result["quiz_id"])
    # Deferred regardless of whether LLM scoring was needed — top_up_qa
    # itself no-ops (no LLM call) once the pool is already large enough.
    await top_up_qa_task.defer_async(
        subject_id=result["subject_id"], topic_id=payload.topic_id, grade_id=payload.grade_id,
    )

    return result


@router.get("/{quiz_id}/status", response_model=QuizStatusResponse)
def get_quiz_status_route(
    quiz_id: int,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_quiz_status(db, claims=claims, quiz_id=quiz_id)

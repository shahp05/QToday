from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.quiz_service import get_student_quiz_progress, resolve_authorized_student_id

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.get("/progress")
def get_progress(
    student_id: int | None = None,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resolved_student_id = resolve_authorized_student_id(db, claims=claims, requested_student_id=student_id)
    return get_student_quiz_progress(db, student_id=resolved_student_id)

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from jobs.tasks import hash_new_account_passwords_task
from schemas.students import StudentsUploadRequest
from services.auth_service import get_current_user
from services.session_service import validate_session_target
from services.students_query_service import get_my_students
from services.students_upload_service import process_students_upload

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/mine")
def list_my_students(
    session_id: int | None = Query(None),
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # session_id is an admin-only concept (browsing a specific — possibly
    # future — session's roster). Any other role passing it is silently
    # ignored, falling back to the default "current" view — session
    # selection never applies to a parent/student's own view.
    if session_id is not None and claims.get("is_school_admin"):
        customer_id = claims.get("customer_id")
        if not customer_id:
            raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
        validate_session_target(db, customer_id, session_id)
        return get_my_students(db, claims["user_id"], session_id=session_id)
    return get_my_students(db, claims["user_id"])


@router.post("/upload")
async def upload_students(
    payload: StudentsUploadRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)

    rows = [r.model_dump() for r in payload.students]
    counts, new_user_ids = process_students_upload(db, customer_id, rows, target_session_id=payload.session_id)
    if new_user_ids:
        await hash_new_account_passwords_task.defer_async(user_ids=new_user_ids)
    return counts

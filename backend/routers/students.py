from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from jobs.tasks import hash_new_account_passwords_task
from schemas.students import StudentsUploadRequest
from services.auth_service import get_current_user
from services.session_service import resolve_session_browsing_customer_id, validate_session_readable
from services.students_query_service import get_my_students
from services.students_upload_service import process_students_upload

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/mine")
def list_my_students(
    session_id: int | None = Query(None),
    student_id: int | None = Query(None),  # a parent's selected ward — see resolve_session_browsing_customer_id
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # session_id is for browsing a specific — current, future, or a past —
    # session's roster, open to every role (each sees only what
    # get_my_students already scopes them to: staff the whole school,
    # a student their own record, a parent their wards). Read-only, so
    # it's validated against the permissive readable check (any of the
    # relevant customer's own sessions), not the strict write-only one.
    if session_id is not None:
        customer_id = resolve_session_browsing_customer_id(db, claims, student_id)
        validate_session_readable(db, customer_id, session_id)
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

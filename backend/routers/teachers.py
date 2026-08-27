from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from jobs.tasks import hash_new_account_passwords_task
from schemas.teachers import SetSuperAdminRequest, TeachersUploadRequest
from services.auth_service import get_current_user
from services.session_service import (
    resolve_parent_ward_customer_id,
    resolve_session_browsing_customer_id,
    validate_session_readable,
    validate_session_target,
)
from services.teachers_query_service import get_my_teachers, get_teachers_for_session
from services.teachers_role_service import set_super_admin
from services.teachers_upload_service import process_teachers_upload

router = APIRouter(prefix="/api/teachers", tags=["teachers"])


@router.get("/mine")
def list_my_teachers(
    session_id: int | None = Query(None),
    student_id: int | None = Query(None),  # a parent's selected ward — see resolve_session_browsing_customer_id
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_student = claims.get("is_student", False)
    is_parent = claims.get("is_parent", False)
    # session_id is for browsing who taught in a past/current session (or,
    # school admin only, the future one — see validate_session_readable) —
    # mirrors GET /students/mine. Read-only, so it's derived from teach_logs
    # (get_teachers_for_session), not the live roster.
    if session_id is not None:
        customer_id = resolve_session_browsing_customer_id(db, claims, student_id)
        validate_session_readable(db, customer_id, session_id, is_school_admin=claims.get("is_school_admin", False))
        return get_teachers_for_session(
            db, customer_id, session_id,
            is_student=is_student, is_parent=is_parent, ward_student_id=student_id, user_id=claims["user_id"],
        )
    # A parent has no customer_id of their own — even the ordinary "current
    # teachers" view needs a selected ward to know which school. No ward
    # selected yet is the same "nothing to show" state as before any data
    # has loaded, not an error.
    if is_parent:
        if student_id is None:
            return {"teachers": []}
        customer_id = resolve_parent_ward_customer_id(db, claims["user_id"], student_id)
        return get_my_teachers(db, claims["user_id"], customer_id=customer_id, is_parent=True, ward_student_id=student_id)
    return get_my_teachers(db, claims["user_id"], is_student=is_student)


@router.post("/upload")
async def upload_teachers(
    payload: TeachersUploadRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    # Write path — current or the one pending future session only, never a
    # past one. Same gate as students/upload.
    if payload.session_id is not None:
        validate_session_target(db, customer_id, payload.session_id)

    rows = [r.model_dump() for r in payload.teachers]
    counts, new_user_ids = process_teachers_upload(db, customer_id, rows, target_session_id=payload.session_id)
    if new_user_ids:
        await hash_new_account_passwords_task.defer_async(user_ids=new_user_ids)
    return counts


@router.patch("/{org_id}/super-admin")
def patch_super_admin(
    org_id: str,
    payload: SetSuperAdminRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)

    return set_super_admin(db, customer_id, org_id, payload.is_super_admin)

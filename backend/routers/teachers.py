from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from jobs.tasks import hash_new_account_passwords_task
from schemas.teachers import SetSuperAdminRequest, TeachersUploadRequest
from services.auth_service import get_current_user
from services.teachers_query_service import get_my_teachers
from services.teachers_role_service import set_super_admin
from services.teachers_upload_service import process_teachers_upload

router = APIRouter(prefix="/api/teachers", tags=["teachers"])


@router.get("/mine")
def list_my_teachers(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_my_teachers(db, claims["user_id"])


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

    rows = [r.model_dump() for r in payload.teachers]
    counts, new_user_ids = process_teachers_upload(db, customer_id, rows)
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

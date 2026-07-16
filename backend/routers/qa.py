from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.qa import QARequest, QAResponse, QAUpdateRequest
from services.auth_service import get_current_user
from services.qa_service import get_or_generate_qa, update_qa

router = APIRouter(prefix="/api/qa", tags=["qa"])


@router.post("", response_model=QAResponse)
async def fetch_qa(
    payload: QARequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)

    return await get_or_generate_qa(
        db,
        subject_name=payload.subject_name,
        topic_name=payload.topic_name,
        grade=payload.grade,
        section=payload.section,
        log_date=payload.log_date,
        user_id=claims["user_id"],
        customer_id=customer_id,
    )


@router.patch("/{qa_id}")
def patch_qa(
    qa_id: int,
    payload: QAUpdateRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)

    return update_qa(db, qa_id=qa_id, user_id=claims["user_id"], customer_id=customer_id, payload=payload)

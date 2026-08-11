from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.sessions import SessionScheduleRequest
from services.auth_service import get_current_user
from services.session_service import list_sessions, schedule_next_session

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
def list_sessions_endpoint(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # No admin gate — teachers/students/parents need this too, to populate a
    # read-only session picker on their own teach-log views.
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    return list_sessions(db, customer_id)


@router.post("/schedule")
def schedule_session(
    payload: SessionScheduleRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    return schedule_next_session(db, customer_id, payload.start_date)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.error_log import ErrorLogRequest, ErrorLogResponse
from services.error_log_service import log_error

router = APIRouter(prefix="/api/error-logs", tags=["error-logs"])


@router.post("", response_model=ErrorLogResponse)
def report_frontend_error(payload: ErrorLogRequest, db: Session = Depends(get_db)):
    # TODO: derive user_id from the authenticated session once auth exists,
    # instead of always logging as anonymous (None).
    entry = log_error(
        db,
        type="frontend",
        error_code=payload.error_code,
        description=payload.description,
        stack_trace=payload.stack_trace,
        context=payload.context,
        correlation_id=payload.correlation_id,
        user_id=None,
    )
    return ErrorLogResponse(error_log_id=entry.error_log_id)

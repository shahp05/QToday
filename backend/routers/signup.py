import traceback

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.signup import SignupRequest, VerifyRequest
from services.signup_service import request_verification, verify_and_create
from services.error_log_service import log_error

router = APIRouter(prefix="/api/signup", tags=["signup"])


@router.post("/request")
async def signup_request(payload: SignupRequest, db: Session = Depends(get_db)):
    """Send a verification code to the email. Idempotent — resending always creates
    a fresh code and invalidates any prior pending row for the same email."""
    try:
        await request_verification(db, payload.model_dump())
    except Exception as e:
        # Logged here (rather than left to the generic handler in main.py)
        # so the email is captured as context.
        log_error(
            db,
            type="api",
            error_code=ErrorCode.EXTERNAL_SERVICE_FAILED,
            description=str(e),
            stack_trace=traceback.format_exc(),
            context={"email": payload.email_id},
        )
        raise AppError(ErrorCode.EXTERNAL_SERVICE_FAILED)
    return {"status": "sent"}


@router.post("/verify")
def signup_verify(payload: VerifyRequest, db: Session = Depends(get_db)):
    """Verify the code and, on success, create the customer account."""
    return verify_and_create(db, payload.email_id, payload.code)

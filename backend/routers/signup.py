import traceback

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.signup import SignupRequest, VerifyRequest
from services.signup_service import request_verification, verify_and_create
from services.error_log_service import log_error
from services.jwt_service import create_access_token
from services.profile_service import get_profile

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
    """Verify the code and, on success, create the customer account, then
    log the new admin straight in — same token/profile shape as /auth/login,
    since the frontend navigates straight to the dashboard afterward."""
    result = verify_and_create(db, payload.email_id, payload.code)
    profile = get_profile(db, result["user_id"])
    token = create_access_token({
        "user_id":           profile["user_id"],
        "customer_id":       profile["customer_id"],
        "is_school_admin":   profile["is_school_admin"],
        "is_school_teacher": profile["is_school_teacher"],
        "is_system_admin":   profile["is_system_admin"],
        "is_student":        profile["is_student"],
        "is_parent":         profile["is_parent"],
    })
    return {"access_token": token, "token_type": "bearer", "profile": profile}

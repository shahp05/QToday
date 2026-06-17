from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.signup import SignupRequest, VerifyRequest
from services.signup_service import request_verification, verify_and_create, VerificationError

router = APIRouter(prefix="/api/signup", tags=["signup"])


@router.post("/request")
async def signup_request(payload: SignupRequest, db: Session = Depends(get_db)):
    """Send a verification code to the email. Idempotent — resending always creates
    a fresh code and invalidates any prior pending row for the same email."""
    try:
        await request_verification(db, payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not send email: {e}")
    return {"detail": "Verification code sent."}


@router.post("/verify")
def signup_verify(payload: VerifyRequest, db: Session = Depends(get_db)):
    """Verify the code and, on success, create the customer account."""
    try:
        result = verify_and_create(db, payload.email_id, payload.code)
    except VerificationError as e:
        status = 410 if str(e) == "expired" else 400
        detail = "expired" if str(e) == "expired" else str(e)
        raise HTTPException(status_code=status, detail=detail)
    return result

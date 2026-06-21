import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.auth import LoginRequest
from services.auth_service import login, get_current_user, AuthError
from services.error_log_service import log_error
from services.jwt_service import create_access_token
from services.profile_service import get_profile
from errors.error_codes import ErrorCode

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def auth_login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        user_id = login(db, payload.login_key.strip(), payload.password)
        profile = get_profile(db, user_id)
        token = create_access_token({
            "user_id":           profile["user_id"],
            "customer_id":       profile["customer_id"],
            "is_customer_admin": profile["is_customer_admin"],
            "is_admin":          profile["is_admin"],
            "is_super_admin":    profile["is_super_admin"],
        })
        return {"access_token": token, "token_type": "bearer", "profile": profile}
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        log_error(
            db,
            type="api",
            error_code=ErrorCode.UNKNOWN_ERROR,
            description=str(e),
            stack_trace=traceback.format_exc(),
            context={"login_key": payload.login_key},
        )
        raise HTTPException(status_code=500, detail="Something went wrong. Please try again.")


@router.get("/me")
def auth_me(claims: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = get_profile(db, claims["user_id"])
    if profile is None:
        raise HTTPException(status_code=401, detail="User no longer active.")
    return profile

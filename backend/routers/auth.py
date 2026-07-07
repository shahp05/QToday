import traceback

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.auth import LoginRequest
from services.auth_service import login, get_current_user
from services.error_log_service import log_error
from services.jwt_service import create_access_token
from services.profile_service import get_profile

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def auth_login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        user_id = login(db, payload.login_key.strip(), payload.password)
        profile = get_profile(db, user_id)
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
    except AppError:
        raise
    except Exception as e:
        # Logged here (rather than left to the generic handler in main.py)
        # so the login_key is captured as context — the global handler
        # only sees the request path/method.
        log_error(
            db,
            type="api",
            error_code=ErrorCode.UNKNOWN_ERROR,
            description=str(e),
            stack_trace=traceback.format_exc(),
            context={"login_key": payload.login_key},
        )
        raise AppError(ErrorCode.UNKNOWN_ERROR)


@router.get("/me")
def auth_me(claims: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = get_profile(db, claims["user_id"])
    if profile is None:
        raise AppError(ErrorCode.ACCOUNT_INACTIVE)
    return profile

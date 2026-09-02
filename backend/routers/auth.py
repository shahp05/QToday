import traceback

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.auth import LoginRequest, ChangePasswordRequest, LoginKeyRequest, VerifyResetCodeRequest
from services.auth_service import login, get_current_user
from services.error_log_service import log_error
from services.jwt_service import create_access_token
from services.password_service import change_own_password
from services.profile_service import get_profile
from services.reset_password_service import (
    check_login_key, request_reset_code, verify_reset_code, raise_student_request,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_token(profile: dict) -> str:
    return create_access_token({
        "user_id":           profile["user_id"],
        "customer_id":       profile["customer_id"],
        "is_school_admin":   profile["is_school_admin"],
        "is_school_teacher": profile["is_school_teacher"],
        "is_system_admin":   profile["is_system_admin"],
        "is_student":        profile["is_student"],
        "is_parent":         profile["is_parent"],
    })


@router.post("/login")
def auth_login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        user_id = login(db, payload.login_key.strip(), payload.password)
        profile = get_profile(db, user_id)
        token = _issue_token(profile)
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


@router.post("/reset-password/check")
def auth_reset_password_check(payload: LoginKeyRequest, db: Session = Depends(get_db)):
    """Step (a)/(b)/(c): unauthenticated — resolves the login key and tells
    the caller whether it's a student account (who can't self-verify) or
    not (who goes on to /reset-password/request)."""
    return check_login_key(db, payload.login_key)


@router.post("/reset-password/request")
async def auth_reset_password_request(payload: LoginKeyRequest, db: Session = Depends(get_db)):
    """Step (d): non-student path — emails a verification code."""
    result = check_login_key(db, payload.login_key)
    await request_reset_code(db, result["user_id"])
    return {}


@router.post("/reset-password/verify")
def auth_reset_password_verify(payload: VerifyResetCodeRequest, db: Session = Depends(get_db)):
    """Step (d) continued: verifies the code, resets the password to
    default (login_key itself — see reset_password_service._reset_to_default),
    and auto-logs the user in with it — same response shape as /login,
    since the frontend treats a successful verify as a login."""
    result = check_login_key(db, payload.login_key)
    verify_reset_code(db, result["user_id"], payload.code)
    profile = get_profile(db, result["user_id"])
    if profile is None:
        raise AppError(ErrorCode.ACCOUNT_INACTIVE)
    token = _issue_token(profile)
    return {"access_token": token, "token_type": "bearer", "profile": profile}


@router.post("/reset-password/raise-request")
def auth_reset_password_raise_request(payload: LoginKeyRequest, db: Session = Depends(get_db)):
    """Step (e): student path — raises (or no-ops onto an already-open)
    reset request for a teacher/parent/admin to approve."""
    result = check_login_key(db, payload.login_key)
    raise_student_request(db, result["user_id"])
    return {}


@router.get("/me")
def auth_me(claims: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = get_profile(db, claims["user_id"])
    if profile is None:
        raise AppError(ErrorCode.ACCOUNT_INACTIVE)
    return profile


@router.put("/password")
def auth_change_password(
    payload: ChangePasswordRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    change_own_password(
        db,
        user_id=claims["user_id"],
        current_password=payload.current_password,
        new_password=payload.new_password,
        is_student=claims.get("is_student", False),
    )
    profile = get_profile(db, claims["user_id"])
    if profile is None:
        raise AppError(ErrorCode.ACCOUNT_INACTIVE)
    return profile

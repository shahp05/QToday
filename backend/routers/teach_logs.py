from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.auth_service import get_current_user, is_staff
from services.session_service import validate_session_readable
from services.teach_log_service import get_topic_catalog, get_topic_grade_qa, list_subjects_taught

router = APIRouter(prefix="/api/teach-logs", tags=["teach-logs"])


@router.get("/subjects-taught")
def get_subjects_taught(
    session_id: int | None = Query(None),
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Every role may browse their own history by session (see sessions.py's
    # "No admin gate" GET /sessions) — unlike Students/Teachers this isn't
    # admin-only, just validated so a stale or foreign session_id gets a
    # clear error instead of silently resolving to an empty result.
    if session_id is not None:
        customer_id = claims.get("customer_id")
        if not customer_id:
            raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
        validate_session_readable(db, customer_id, session_id)
    return list_subjects_taught(
        db,
        customer_id=claims["customer_id"],
        user_id=claims["user_id"],
        is_school_admin=claims.get("is_school_admin", False),
        is_system_admin=claims.get("is_system_admin", False),
        is_student=claims.get("is_student", False),
        is_parent=claims.get("is_parent", False),
        session_id=session_id,
    )


@router.get("/qa")
def get_qa_for_topic_grade(
    topic_id: int,
    grade_id: int,
    session_id: int | None = Query(None),
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if session_id is not None:
        customer_id = claims.get("customer_id")
        if not customer_id:
            raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
        validate_session_readable(db, customer_id, session_id)
    qa_items = get_topic_grade_qa(
        db,
        customer_id=claims["customer_id"],
        user_id=claims["user_id"],
        topic_id=topic_id,
        grade_id=grade_id,
        is_school_admin=claims.get("is_school_admin", False),
        is_system_admin=claims.get("is_system_admin", False),
        is_student=claims.get("is_student", False),
        is_parent=claims.get("is_parent", False),
        session_id=session_id,
    )
    if qa_items is None:
        raise AppError(ErrorCode.TEACH_LOG_NOT_FOUND)
    return {"qa_items": qa_items}


@router.get("/topic-catalog")
def get_topic_catalog_endpoint(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_staff(claims):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    return {"topics": get_topic_catalog(db, customer_id=customer_id, user_id=claims["user_id"])}

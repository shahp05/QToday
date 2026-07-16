from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.teach_log_service import get_topic_grade_qa, list_subjects_taught

router = APIRouter(prefix="/api/teach-logs", tags=["teach-logs"])


@router.get("/subjects-taught")
def get_subjects_taught(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_subjects_taught(
        db,
        customer_id=claims["customer_id"],
        user_id=claims["user_id"],
        is_school_admin=claims.get("is_school_admin", False),
        is_system_admin=claims.get("is_system_admin", False),
        is_student=claims.get("is_student", False),
        is_parent=claims.get("is_parent", False),
    )


@router.get("/qa")
def get_qa_for_topic_grade(
    topic_id: int,
    grade_id: int,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    )
    if qa_items is None:
        raise HTTPException(status_code=404, detail="No teaching log found for this topic and grade")
    return {"qa_items": qa_items}

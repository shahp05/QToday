from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.teach_log_service import list_subjects_taught

router = APIRouter(prefix="/api/teach-logs", tags=["teach-logs"])


@router.get("/subjects-taught")
def get_subjects_taught(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subjects = list_subjects_taught(
        db,
        customer_id=claims["customer_id"],
        user_id=claims["user_id"],
        is_school_admin=claims.get("is_school_admin", False),
        is_system_admin=claims.get("is_system_admin", False),
        is_student=claims.get("is_student", False),
        is_parent=claims.get("is_parent", False),
    )
    return {"subjects": subjects}

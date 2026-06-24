from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from schemas.students import StudentsUploadRequest
from services.auth_service import get_current_user
from services.students_query_service import get_my_students
from services.students_upload_service import process_students_upload

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/mine")
def list_my_students(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_my_students(db, claims["user_id"])


@router.post("/upload")
def upload_students(
    payload: StudentsUploadRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not claims.get("is_school_admin"):
        raise HTTPException(status_code=403, detail="Only a school admin can upload students.")
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No school is associated with this account.")

    rows = [r.model_dump() for r in payload.students]
    counts = process_students_upload(db, customer_id, rows)
    return counts

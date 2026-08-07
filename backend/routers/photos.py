from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.photo_service import upload_own_photo, upload_student_photo

router = APIRouter(prefix="/api", tags=["photos"])


@router.post("/users/me/photo")
async def upload_my_photo_route(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await upload_own_photo(db, file=file, user_id=claims["user_id"])


@router.post("/students/{student_id}/photo")
async def upload_student_photo_route(
    student_id: int,
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await upload_student_photo(db, file=file, claims=claims, student_id=student_id)

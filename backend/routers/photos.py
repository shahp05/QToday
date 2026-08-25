from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.photo_service import upload_own_photo

router = APIRouter(prefix="/api", tags=["photos"])


@router.post("/users/me/photo")
async def upload_my_photo_route(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Self-upload only, per spec — no route exists to set another user's
    # (e.g. a student's) photo on their behalf.
    return await upload_own_photo(db, file=file, user_id=claims["user_id"])

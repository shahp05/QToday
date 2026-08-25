import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode

# Local disk storage — no S3/cloud config exists yet in this app (see
# .env.example), so photos land under backend/uploads/photos and are served
# back out via the /static mount main.py sets up over UPLOAD_ROOT.
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
PHOTOS_DIR = UPLOAD_ROOT / "photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def _save_uploaded_photo(file: UploadFile) -> str:
    """Validates and writes the uploaded file to disk under a generated
    filename (never the client-supplied one, to avoid any path-traversal /
    collision concerns), returning the relative URL to store in file_url."""
    ext = ALLOWED_CONTENT_TYPES.get(file.content_type)
    if ext is None:
        raise AppError(ErrorCode.VALIDATION_ERROR)

    contents = await file.read()
    if not contents or len(contents) > MAX_PHOTO_BYTES:
        raise AppError(ErrorCode.VALIDATION_ERROR)

    filename = f"{uuid.uuid4().hex}{ext}"
    (PHOTOS_DIR / filename).write_bytes(contents)
    return f"/static/photos/{filename}"


def _set_user_photo(db: Session, *, user_id: int, photo_url: str) -> dict:
    db.execute(
        text("UPDATE users SET file_url = :url, date_modified = NOW() WHERE user_id = :uid"),
        {"url": photo_url, "uid": user_id},
    )
    db.commit()
    return {"photo_url": photo_url}


async def upload_own_photo(db: Session, *, file: UploadFile, user_id: int) -> dict:
    """Any authenticated user may set their own photo — students, teachers
    and parents alike, no role check needed since it's always self-targeted.
    Per spec, this is the ONLY way to set a photo — no staff-on-behalf-of-
    another-user path exists (see git history for the removed
    upload_student_photo, which violated that rule)."""
    photo_url = await _save_uploaded_photo(file)
    return _set_user_photo(db, user_id=user_id, photo_url=photo_url)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.teach_log_service import list_my_teach_logs

router = APIRouter(prefix="/api/teach-logs", tags=["teach-logs"])


@router.get("/mine")
def get_my_teach_logs(
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"subjects": list_my_teach_logs(db, claims["user_id"])}

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from services.auth_service import get_current_user
from services.reset_password_service import list_reset_requests, approve_reset_request

router = APIRouter(prefix="/api/reset-requests", tags=["reset-requests"])


@router.get("")
def list_reset_requests_route(claims: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"requests": list_reset_requests(db, claims)}


@router.post("/{request_id}/approve")
def approve_reset_request_route(
    request_id: int,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    approve_reset_request(db, claims, request_id)
    return {}

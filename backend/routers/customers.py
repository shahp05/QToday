from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.customers import CustomerUpdateRequest
from services.auth_service import get_current_user
from services.customer_service import get_my_customer, update_my_customer

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _require_school_admin(claims: dict) -> int:
    if not claims.get("is_school_admin"):
        raise AppError(ErrorCode.AUTH_FORBIDDEN)
    customer_id = claims.get("customer_id")
    if not customer_id:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    return customer_id


@router.get("/me")
def get_my_customer_route(claims: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    customer_id = _require_school_admin(claims)
    customer = get_my_customer(db, customer_id)
    if customer is None:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    return customer


@router.put("/me")
def update_my_customer_route(
    payload: CustomerUpdateRequest,
    claims: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    customer_id = _require_school_admin(claims)
    return update_my_customer(db, customer_id=customer_id, editor_user_id=claims["user_id"], payload=payload)

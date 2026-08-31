from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode
from schemas.customers import CustomerUpdateRequest

_SELECT = (
    "SELECT c.customer_id, c.customer_name, c.customer_acronym, "
    "       c.customer_address, c.customer_city, c.customer_state, c.customer_zip, "
    "       c.customer_email, c.customer_phone, c.customer_gstn, "
    "       c.date_created, c.date_modified, c.modified_by_user_id, "
    "       m.user_name AS modified_by_name, "
    "       b.board_code, b.board_name, co.country_code, co.country_name "
    "FROM customers c "
    "LEFT JOIN boards b ON b.board_id = c.board_id "
    "LEFT JOIN countries co ON co.country_id = c.country_id "
    "LEFT JOIN users m ON m.user_id = c.modified_by_user_id "
    "WHERE c.customer_id = :cid AND c.is_active = TRUE"
)


def get_my_customer(db: Session, customer_id: int) -> dict | None:
    row = db.execute(text(_SELECT), {"cid": customer_id}).fetchone()
    if row is None:
        return None
    return dict(row._mapping)


def update_my_customer(db: Session, *, customer_id: int, editor_user_id: int, payload: CustomerUpdateRequest) -> dict:
    """Every field here is editable per the doc's Manage School Account
    rules — acronym, country and board are deliberately excluded (not in
    CustomerUpdateRequest), since those are locked at signup."""
    db.execute(
        text(
            "UPDATE customers SET "
            "  customer_name = :name, customer_address = :address, customer_city = :city, "
            "  customer_state = :state, customer_zip = :zip, customer_email = :email, "
            "  customer_phone = :phone, customer_gstn = :gstn, "
            "  date_modified = NOW(), modified_by_user_id = :editor_id "
            "WHERE customer_id = :cid AND is_active = TRUE"
        ),
        {
            "cid": customer_id,
            "editor_id": editor_user_id,
            "name": payload.customer_name,
            "address": payload.customer_address,
            "city": payload.customer_city,
            "state": payload.customer_state,
            "zip": payload.customer_zip,
            "email": payload.customer_email,
            "phone": payload.customer_phone,
            "gstn": payload.customer_gstn,
        },
    )
    db.commit()

    customer = get_my_customer(db, customer_id)
    if customer is None:
        raise AppError(ErrorCode.SCHOOL_NOT_ASSOCIATED)
    return customer

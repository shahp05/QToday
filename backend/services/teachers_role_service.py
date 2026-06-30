from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode


def set_super_admin(db: Session, customer_id: int, org_id: str, is_super_admin: bool) -> dict:
    """Promotes/demotes a teacher between is_adm (ordinary admin/teacher)
    and is_sysadm (school owner/super admin) — the two are mutually
    exclusive scopes for the same customer_id (see models.py). Refuses to
    demote the school's last remaining super admin."""
    row = db.execute(
        text(
            "SELECT user_id, is_sysadm FROM users "
            "WHERE org_id = :oid AND customer_id = :cid AND is_active = TRUE "
            "AND (is_adm = TRUE OR is_sysadm = TRUE)"
        ),
        {"oid": org_id, "cid": customer_id},
    ).fetchone()
    if row is None:
        raise AppError(ErrorCode.TEACHER_NOT_FOUND)

    if not is_super_admin and row.is_sysadm:
        remaining = db.execute(
            text(
                "SELECT COUNT(*) FROM users "
                "WHERE customer_id = :cid AND is_sysadm = TRUE AND is_active = TRUE AND user_id != :uid"
            ),
            {"cid": customer_id, "uid": row.user_id},
        ).scalar()
        if remaining == 0:
            raise AppError(ErrorCode.LAST_SUPER_ADMIN)

    db.execute(
        text(
            "UPDATE users SET is_sysadm = :sysadm, is_adm = :adm, date_modified = NOW() "
            "WHERE user_id = :uid"
        ),
        {"sysadm": is_super_admin, "adm": not is_super_admin, "uid": row.user_id},
    )
    db.commit()

    return {"org_id": org_id, "is_super_admin": is_super_admin}

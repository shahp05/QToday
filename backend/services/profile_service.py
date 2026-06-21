from sqlalchemy import text
from sqlalchemy.orm import Session


def get_profile(db: Session, user_id: int) -> dict | None:
    row = db.execute(
        text(
            "SELECT u.user_id, u.customer_id, u.org_id, u.user_name, u.email_id, "
            "       u.is_student, u.is_parent, u.is_cust_adm, u.is_sysadm, u.is_superadm, "
            "       u.date_created, u.password_date_created, "
            "       c.customer_name, c.customer_acronym, "
            "       b.board_code, b.board_name, co.country_code, co.country_name "
            "FROM users u "
            "LEFT JOIN customers c ON c.customer_id = u.customer_id "
            "LEFT JOIN boards b ON b.board_id = c.board_id "
            "LEFT JOIN countries co ON co.country_id = c.country_id "
            "WHERE u.user_id = :uid AND u.is_active = TRUE"
        ),
        {"uid": user_id},
    ).fetchone()

    if row is None:
        return None

    profile = {
        "user_id":             row.user_id,
        "customer_id":         row.customer_id,
        "org_id":              row.org_id,
        "user_name":           row.user_name,
        "email_id":            row.email_id,
        "is_student":          row.is_student,
        "is_parent":           row.is_parent,
        "is_customer_admin":   row.is_cust_adm,
        "is_admin":            row.is_sysadm,
        "is_super_admin":      row.is_superadm,
        "customer_name":       row.customer_name,
        "customer_acronym":    row.customer_acronym,
        "board_code":          row.board_code,
        "board_name":          row.board_name,
        "country_code":        row.country_code,
        "country_name":        row.country_name,
        "is_default_password": row.password_date_created == row.date_created,
    }

    if row.customer_id is not None:
        counts = db.execute(
            text(
                "SELECT "
                "  COUNT(*) FILTER (WHERE is_cust_adm = TRUE AND user_id != :uid) AS admin_count, "
                "  COUNT(*) FILTER (WHERE is_student = TRUE AND user_id != :uid) AS student_count "
                "FROM users "
                "WHERE customer_id = :cid AND is_active = TRUE"
            ),
            {"uid": user_id, "cid": row.customer_id},
        ).fetchone()
        profile["admin_count"] = counts.admin_count
        profile["student_count"] = counts.student_count

    return profile

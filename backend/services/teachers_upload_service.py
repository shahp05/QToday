from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.password_service import hash_password


def process_teachers_upload(db: Session, customer_id: int, rows: list[dict]) -> dict:
    """Reconciles the uploaded roster against the db for this customer:
    creates/updates/reactivates teachers present in the upload, and
    deactivates teachers that exist for this customer but are no longer
    in it. Teachers are users rows with is_adm=TRUE, is_sysadm=FALSE,
    customer_id set — there is no separate teachers table. Every upload
    is treated as the complete current roster for this customer. Runs as
    one transaction — any error rolls back the whole upload."""
    customer = db.execute(
        text("SELECT customer_acronym, country_id FROM customers WHERE customer_id = :cid"),
        {"cid": customer_id},
    ).fetchone()
    acronym = customer.customer_acronym

    counts = {"teachers_created": 0, "teachers_updated": 0, "teachers_deactivated": 0}
    seen_org_ids: set[str] = set()

    seen_in_file: set[str] = set()
    for row in rows:
        oid = row["org_id"].strip()
        if oid in seen_in_file:
            raise AppError(ErrorCode.DUPLICATE_ID, context={"id": oid})
        seen_in_file.add(oid)

    try:
        for row in rows:
            org_id = row["org_id"].strip()
            name = row["name"].strip()
            email = row["email"].strip().lower()
            seen_org_ids.add(org_id)

            email_conflict = db.execute(
                text(
                    "SELECT 1 FROM users WHERE customer_id = :cid AND is_adm = TRUE "
                    "AND lower(email_id) = :e AND org_id != :oid"
                ),
                {"cid": customer_id, "e": email, "oid": org_id},
            ).fetchone()
            if email_conflict is not None:
                raise AppError(ErrorCode.EMAIL_ALREADY_USED, context={"email": email})

            existing = db.execute(
                text(
                    "SELECT user_id, user_name, email_id, is_active FROM users "
                    "WHERE org_id = :oid AND customer_id = :cid AND is_adm = TRUE"
                ),
                {"oid": org_id, "cid": customer_id},
            ).fetchone()

            if existing is None:
                # org_id@acronym is also how students build their login_key
                # (globally unique on users) — an Id already claimed by a
                # student (or any other user) at this school would otherwise
                # surface as a raw DB constraint violation on INSERT.
                id_conflict = db.execute(
                    text("SELECT is_sysadm FROM users WHERE customer_id = :cid AND org_id = :oid"),
                    {"cid": customer_id, "oid": org_id},
                ).fetchone()
                if id_conflict is not None:
                    if id_conflict.is_sysadm:
                        # The school owner's own id — already has full access
                        # and isn't a separate teacher row; including them in
                        # the roster is a no-op, not a conflict.
                        continue
                    raise AppError(ErrorCode.DUPLICATE_ID, context={"id": org_id})

                login_key = f"{org_id}@{acronym}"
                db.execute(
                    text(
                        "INSERT INTO users (login_key, password_hash, user_name, email_id, "
                        "country_id, customer_id, org_id, is_adm, is_sysadm) "
                        "VALUES (:lk, :ph, :un, :ei, :cy, :cid, :oid, TRUE, FALSE)"
                    ),
                    {
                        "lk": login_key, "ph": hash_password(login_key), "un": name, "ei": email,
                        "cy": customer.country_id, "cid": customer_id, "oid": org_id,
                    },
                )
                counts["teachers_created"] += 1
            else:
                if existing.user_name != name or existing.email_id != email or not existing.is_active:
                    db.execute(
                        text(
                            "UPDATE users SET user_name = :un, email_id = :ei, is_active = TRUE, "
                            "date_modified = NOW() WHERE user_id = :uid"
                        ),
                        {"un": name, "ei": email, "uid": existing.user_id},
                    )
                    counts["teachers_updated"] += 1

        missing_teachers = db.execute(
            text(
                "SELECT user_id FROM users WHERE customer_id = :cid AND is_adm = TRUE "
                "AND is_active = TRUE AND NOT (org_id = ANY(:org_ids))"
            ),
            {"cid": customer_id, "org_ids": list(seen_org_ids)},
        ).fetchall()
        for row in missing_teachers:
            db.execute(
                text("UPDATE users SET is_active = FALSE, date_modified = NOW() WHERE user_id = :uid"),
                {"uid": row.user_id},
            )
        counts["teachers_deactivated"] = len(missing_teachers)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return counts

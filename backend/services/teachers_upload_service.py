from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.password_service import placeholder_password_hash


def process_teachers_upload(db: Session, customer_id: int, rows: list[dict]) -> tuple[dict, list[int]]:
    """Reconciles the uploaded roster against the db for this customer:
    creates/updates/reactivates teachers present in the upload, and
    deactivates teachers that exist for this customer but are no longer
    in it. Teachers are users rows with is_adm=TRUE, is_sysadm=FALSE,
    customer_id set — there is no separate teachers table. Every upload
    is treated as the complete current roster for this customer. Runs as
    one transaction — any error rolls back the whole upload.

    Set-based throughout (see students_upload_service for why) — a
    handful of bulk queries total instead of one round trip per row.

    Returns (counts, new_user_ids) — new_user_ids is every brand-new
    teacher account just inserted, each still holding a placeholder
    password_hash (see password_service.placeholder_password_hash). The
    caller defers jobs.tasks.hash_new_account_passwords_task with this list
    right after commit, same as students_upload_service."""
    customer = db.execute(
        text("SELECT customer_acronym, country_id FROM customers WHERE customer_id = :cid"),
        {"cid": customer_id},
    ).fetchone()
    acronym = customer.customer_acronym

    counts = {"teachers_created": 0, "teachers_updated": 0, "teachers_deactivated": 0}

    for row in rows:
        row["org_id"] = row["org_id"].strip()
        row["name"] = row["name"].strip()
        row["email"] = row["email"].strip().lower()

    seen_in_file: set[str] = set()
    for row in rows:
        if row["org_id"] in seen_in_file:
            raise AppError(ErrorCode.DUPLICATE_ID, context={"id": row["org_id"]})
        seen_in_file.add(row["org_id"])

    # Mirrors what the old per-row loop incidentally caught for free by
    # re-querying the db mid-loop and seeing its own prior writes: two rows
    # in the same file claiming the same email under different org_ids.
    org_id_by_email_in_file: dict[str, str] = {}
    for row in rows:
        prior = org_id_by_email_in_file.get(row["email"])
        if prior is not None and prior != row["org_id"]:
            raise AppError(ErrorCode.EMAIL_ALREADY_USED, context={"email": row["email"]})
        org_id_by_email_in_file[row["email"]] = row["org_id"]

    seen_org_ids = {row["org_id"] for row in rows}
    new_user_ids: list[int] = []

    try:
        if rows:
            org_ids = [row["org_id"] for row in rows]

            org_id_by_email_in_db = {
                r.email: r.org_id
                for r in db.execute(
                    text(
                        "SELECT org_id, lower(email_id) AS email FROM users "
                        "WHERE customer_id = :cid AND is_adm = TRUE AND email_id IS NOT NULL"
                    ),
                    {"cid": customer_id},
                ).fetchall()
            }
            for row in rows:
                conflict_org_id = org_id_by_email_in_db.get(row["email"])
                if conflict_org_id is not None and conflict_org_id != row["org_id"]:
                    raise AppError(ErrorCode.EMAIL_ALREADY_USED, context={"email": row["email"]})

            existing_by_org_id = {
                r.org_id: r
                for r in db.execute(
                    text(
                        "SELECT user_id, org_id, user_name, email_id, is_active, is_adm, is_sysadm "
                        "FROM users WHERE customer_id = :cid AND org_id = ANY(:org_ids)"
                    ),
                    {"cid": customer_id, "org_ids": org_ids},
                ).fetchall()
            }

            to_insert = []
            to_update = []
            for row in rows:
                existing = existing_by_org_id.get(row["org_id"])
                if existing is None:
                    to_insert.append(row)
                elif not existing.is_adm:
                    # org_id already belongs to a non-teacher user at this
                    # school (a student, or the school's own sysadmin).
                    if existing.is_sysadm:
                        continue
                    raise AppError(ErrorCode.DUPLICATE_ID, context={"id": row["org_id"]})
                else:
                    to_update.append(row)

            if to_insert:
                login_keys = [f"{row['org_id']}@{acronym}" for row in to_insert]
                placeholder = placeholder_password_hash()
                password_hashes = [placeholder] * len(to_insert)
                inserted = db.execute(
                    text(
                        "INSERT INTO users (login_key, password_hash, user_name, email_id, country_id, "
                        "customer_id, org_id, is_adm, is_sysadm) "
                        "SELECT login_key, password_hash, user_name, email, :country_id, :customer_id, org_id, TRUE, FALSE "
                        "FROM unnest((:login_keys)::text[], (:password_hashes)::text[], (:names)::text[], (:emails)::text[], (:org_ids)::text[]) "
                        "AS t(login_key, password_hash, user_name, email, org_id) "
                        "RETURNING user_id"
                    ),
                    {
                        "country_id": customer.country_id, "customer_id": customer_id,
                        "login_keys": login_keys, "password_hashes": password_hashes,
                        "names": [row["name"] for row in to_insert],
                        "emails": [row["email"] for row in to_insert],
                        "org_ids": [row["org_id"] for row in to_insert],
                    },
                ).fetchall()
                new_user_ids = [r.user_id for r in inserted]
            counts["teachers_created"] = len(to_insert)

            users_to_touch = []  # (user_id, name, email)
            for row in to_update:
                existing = existing_by_org_id[row["org_id"]]
                if existing.user_name != row["name"] or existing.email_id != row["email"] or not existing.is_active:
                    users_to_touch.append((existing.user_id, row["name"], row["email"]))
            if users_to_touch:
                ids, names, emails = zip(*users_to_touch)
                db.execute(
                    text(
                        "UPDATE users u SET user_name = t.user_name, email_id = t.email, "
                        "is_active = TRUE, date_modified = NOW() "
                        "FROM unnest((:ids)::int[], (:names)::text[], (:emails)::text[]) AS t(user_id, user_name, email) "
                        "WHERE u.user_id = t.user_id"
                    ),
                    {"ids": list(ids), "names": list(names), "emails": list(emails)},
                )
            counts["teachers_updated"] = len(users_to_touch)

        missing = db.execute(
            text(
                "SELECT user_id FROM users WHERE customer_id = :cid AND is_adm = TRUE "
                "AND is_active = TRUE AND NOT (org_id = ANY(:org_ids))"
            ),
            {"cid": customer_id, "org_ids": list(seen_org_ids)},
        ).fetchall()
        if missing:
            db.execute(
                text("UPDATE users SET is_active = FALSE, date_modified = NOW() WHERE user_id = ANY(:ids)"),
                {"ids": [r.user_id for r in missing]},
            )
        counts["teachers_deactivated"] = len(missing)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return counts, new_user_ids

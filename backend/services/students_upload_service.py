from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.password_service import hash_password


def _get_or_create_grade(db: Session, grade_name: int) -> int:
    row = db.execute(
        text("SELECT grade_id FROM grades WHERE grade_name = :g"), {"g": grade_name}
    ).fetchone()
    if row:
        return row.grade_id
    return db.execute(
        text("INSERT INTO grades (grade_name) VALUES (:g) RETURNING grade_id"), {"g": grade_name}
    ).scalar()


def _upsert_parent(db: Session, email: str, student_id: int, customer_id: int) -> bool:
    """Find-or-create the parent's user account (matched globally by email,
    among parent-flagged rows only), then find-or-create/reactivate their
    parents row for this student+customer. Returns True if a new parent
    user account was created."""
    email = email.strip().lower()

    parent_user = db.execute(
        text("SELECT user_id, is_active FROM users WHERE email_id = :e AND is_parent = TRUE"),
        {"e": email},
    ).fetchone()

    created = False
    if parent_user is None:
        user_id = db.execute(
            text(
                "INSERT INTO users (login_key, password_hash, user_name, email_id, is_parent) "
                "VALUES (:lk, :ph, :un, :ei, TRUE) RETURNING user_id"
            ),
            {"lk": email, "ph": hash_password(email), "un": email, "ei": email},
        ).scalar()
        created = True
    else:
        user_id = parent_user.user_id
        if not parent_user.is_active:
            db.execute(
                text("UPDATE users SET is_active = TRUE, date_modified = NOW() WHERE user_id = :uid"),
                {"uid": user_id},
            )

    parent_row = db.execute(
        text(
            "SELECT parent_id, is_active FROM parents "
            "WHERE user_id = :uid AND student_id = :sid AND customer_id = :cid"
        ),
        {"uid": user_id, "sid": student_id, "cid": customer_id},
    ).fetchone()

    if parent_row is None:
        db.execute(
            text(
                "INSERT INTO parents (user_id, student_id, customer_id) "
                "VALUES (:uid, :sid, :cid)"
            ),
            {"uid": user_id, "sid": student_id, "cid": customer_id},
        )
    elif not parent_row.is_active:
        db.execute(
            text("UPDATE parents SET is_active = TRUE, date_modified = NOW() WHERE parent_id = :pid"),
            {"pid": parent_row.parent_id},
        )

    return created


def process_students_upload(db: Session, customer_id: int, rows: list[dict]) -> dict:
    """Reconciles the uploaded roster against the db for this customer:
    creates/updates/reactivates students and parents present in the upload,
    and deactivates students/parents that exist for this customer but are
    no longer in it. Every upload is treated as the complete current
    roster for this customer. Runs as one transaction — any error rolls
    back the whole upload."""
    customer = db.execute(
        text("SELECT customer_acronym, board_id, country_id FROM customers WHERE customer_id = :cid"),
        {"cid": customer_id},
    ).fetchone()
    acronym = customer.customer_acronym

    counts = {
        "students_created": 0, "students_updated": 0, "students_deactivated": 0,
        "parents_created": 0, "parents_deactivated": 0,
    }
    seen_org_ids: set[str] = set()
    seen_parent_emails: set[str] = set()

    seen_in_file: set[str] = set()
    for row in rows:
        oid = row["org_id"].strip()
        if oid in seen_in_file:
            raise AppError(ErrorCode.DUPLICATE_ID, context={"id": oid})
        seen_in_file.add(oid)

    try:
        for row in rows:
            org_id = row["org_id"].strip()
            seen_org_ids.add(org_id)
            grade_id = _get_or_create_grade(db, row["grade"])

            existing = db.execute(
                text(
                    "SELECT u.user_id, u.user_name, u.is_active, s.student_id "
                    "FROM users u JOIN students s ON s.user_id = u.user_id "
                    "WHERE u.org_id = :oid AND u.customer_id = :cid"
                ),
                {"oid": org_id, "cid": customer_id},
            ).fetchone()

            if existing is None:
                # org_id@acronym is also how teachers build their login_key
                # (globally unique on users) — an Id already claimed by a
                # teacher (or any other user) at this school would otherwise
                # surface as a raw DB constraint violation on INSERT.
                id_conflict = db.execute(
                    text("SELECT 1 FROM users WHERE customer_id = :cid AND org_id = :oid"),
                    {"cid": customer_id, "oid": org_id},
                ).fetchone()
                if id_conflict is not None:
                    raise AppError(ErrorCode.DUPLICATE_ID, context={"id": org_id})

                login_key = f"{org_id}@{acronym}"
                user_id = db.execute(
                    text(
                        "INSERT INTO users (login_key, password_hash, user_name, country_id, "
                        "customer_id, org_id, is_student) "
                        "VALUES (:lk, :ph, :un, :cy, :cid, :oid, TRUE) RETURNING user_id"
                    ),
                    {
                        "lk": login_key, "ph": hash_password(login_key), "un": row["name"],
                        "cy": customer.country_id, "cid": customer_id, "oid": org_id,
                    },
                ).scalar()
                student_id = db.execute(
                    text(
                        "INSERT INTO students (user_id, customer_id, board_id) "
                        "VALUES (:uid, :cid, :bid) RETURNING student_id"
                    ),
                    {"uid": user_id, "cid": customer_id, "bid": customer.board_id},
                ).scalar()
                db.execute(
                    text(
                        "INSERT INTO student_grades (student_id, grade_id, section) "
                        "VALUES (:sid, :gid, :sec)"
                    ),
                    {"sid": student_id, "gid": grade_id, "sec": row.get("section")},
                )
                counts["students_created"] += 1
            else:
                student_id = existing.student_id
                changed = False

                if existing.user_name != row["name"] or not existing.is_active:
                    db.execute(
                        text(
                            "UPDATE users SET user_name = :un, is_active = TRUE, date_modified = NOW() "
                            "WHERE user_id = :uid"
                        ),
                        {"un": row["name"], "uid": existing.user_id},
                    )
                    db.execute(
                        text("UPDATE students SET is_active = TRUE, date_modified = NOW() WHERE student_id = :sid"),
                        {"sid": student_id},
                    )
                    changed = True

                current_grade = db.execute(
                    text(
                        "SELECT student_grade_id, grade_id, section FROM student_grades "
                        "WHERE student_id = :sid AND is_active = TRUE"
                    ),
                    {"sid": student_id},
                ).fetchone()

                if current_grade is None or current_grade.grade_id != grade_id:
                    if current_grade is not None:
                        db.execute(
                            text(
                                "UPDATE student_grades SET is_active = FALSE, date_modified = NOW() "
                                "WHERE student_grade_id = :sgid"
                            ),
                            {"sgid": current_grade.student_grade_id},
                        )
                    db.execute(
                        text(
                            "INSERT INTO student_grades (student_id, grade_id, section) "
                            "VALUES (:sid, :gid, :sec)"
                        ),
                        {"sid": student_id, "gid": grade_id, "sec": row.get("section")},
                    )
                    changed = True
                elif current_grade.section != row.get("section"):
                    db.execute(
                        text(
                            "UPDATE student_grades SET section = :sec, date_modified = NOW() "
                            "WHERE student_grade_id = :sgid"
                        ),
                        {"sec": row.get("section"), "sgid": current_grade.student_grade_id},
                    )
                    changed = True

                if changed:
                    counts["students_updated"] += 1

            for email in (row.get("parent1_email"), row.get("parent2_email")):
                if not email:
                    continue
                normalized = email.strip().lower()
                seen_parent_emails.add(normalized)
                if _upsert_parent(db, normalized, student_id, customer_id):
                    counts["parents_created"] += 1

        # Deactivate students that exist for this customer but are missing from the upload.
        missing_students = db.execute(
            text(
                "SELECT s.student_id, u.user_id FROM students s "
                "JOIN users u ON u.user_id = s.user_id "
                "WHERE u.customer_id = :cid AND u.is_active = TRUE "
                "AND NOT (u.org_id = ANY(:org_ids))"
            ),
            {"cid": customer_id, "org_ids": list(seen_org_ids)},
        ).fetchall()
        for row in missing_students:
            db.execute(text("UPDATE users SET is_active = FALSE, date_modified = NOW() WHERE user_id = :uid"), {"uid": row.user_id})
            db.execute(text("UPDATE students SET is_active = FALSE, date_modified = NOW() WHERE student_id = :sid"), {"sid": row.student_id})
            db.execute(
                text(
                    "UPDATE student_grades SET is_active = FALSE, date_modified = NOW() "
                    "WHERE student_id = :sid AND is_active = TRUE"
                ),
                {"sid": row.student_id},
            )
        counts["students_deactivated"] = len(missing_students)

        # Deactivate parents (for this customer) missing from the upload, then
        # deactivate the parent's user account too if they have no other active children.
        missing_parents = db.execute(
            text(
                "SELECT p.parent_id, p.user_id FROM parents p "
                "JOIN users u ON u.user_id = p.user_id "
                "WHERE p.customer_id = :cid AND p.is_active = TRUE "
                "AND NOT (u.email_id = ANY(:emails))"
            ),
            {"cid": customer_id, "emails": list(seen_parent_emails)},
        ).fetchall()
        for row in missing_parents:
            db.execute(text("UPDATE parents SET is_active = FALSE, date_modified = NOW() WHERE parent_id = :pid"), {"pid": row.parent_id})
            remaining = db.execute(
                text("SELECT COUNT(*) FROM parents WHERE user_id = :uid AND is_active = TRUE"),
                {"uid": row.user_id},
            ).scalar()
            if remaining == 0:
                db.execute(text("UPDATE users SET is_active = FALSE, date_modified = NOW() WHERE user_id = :uid"), {"uid": row.user_id})
        counts["parents_deactivated"] = len(missing_parents)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return counts

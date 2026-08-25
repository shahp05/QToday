from sqlalchemy import text
from sqlalchemy.orm import Session

from errors.app_error import AppError
from errors.error_codes import ErrorCode
from services.password_service import placeholder_password_hash
from services.session_service import ensure_session_bootstrapped, get_current_session_id, validate_session_target


def _resolve_target_session(db: Session, customer_id: int, requested_session_id: int | None) -> tuple[int, bool]:
    """Resolves which session this upload writes into, and whether that's
    the pending future session (as opposed to the live current one).
    requested_session_id is None for the common case (upload the current
    roster) or an explicit choice from the dual-session upload selector
    (only ever shown when a future session exists). Bootstraps session #1
    if this customer has never written anything session-tracked yet — the
    first upload for a brand new or pre-feature customer."""
    current_session_id = get_current_session_id(db, customer_id)
    if current_session_id is None:
        current_session_id = ensure_session_bootstrapped(db, customer_id)

    if requested_session_id is None:
        return current_session_id, False

    validate_session_target(db, customer_id, requested_session_id)
    return requested_session_id, requested_session_id != current_session_id


def process_students_upload(
    db: Session, customer_id: int, rows: list[dict], target_session_id: int | None = None
) -> tuple[dict, list[int]]:
    """Reconciles the uploaded roster against the db for this customer:
    creates/updates/reactivates students and parents present in the upload,
    and deactivates students/parents that exist for this customer but are
    no longer in it. Every upload is treated as the complete roster for
    its TARGET session (current, or the pending future one — see
    _resolve_target_session). Runs as one transaction — any error rolls
    back the whole upload.

    A future-session upload pre-stages next year's roster without
    disturbing the still-live current one: it writes student_grades rows
    tagged with the future session_id, and — critically — never touches
    users.is_active/students.is_active, since those accounts are still
    fully enrolled under the CURRENT session right up to cutover. See
    _deactivate_missing_students_future vs _deactivate_missing_students_current.

    Set-based throughout (a handful of bulk queries total, each covering
    every row via unnest()/ANY()) instead of one round trip per row per
    field — a few hundred students used to mean a few thousand sequential
    round trips to the db, which is what made this endpoint slow enough to
    time out, especially against a remote/pooled db.

    Returns (counts, new_user_ids) — new_user_ids is every brand-new
    student/parent account just inserted, each still holding a placeholder
    password_hash (see password_service.placeholder_password_hash). The
    caller defers jobs.tasks.hash_new_account_passwords_task with this list
    right after commit — hashing hundreds of real default passwords
    synchronously was the actual cause of upload timeouts, not the SQL."""
    customer = db.execute(
        text("SELECT customer_acronym, board_id, country_id FROM customers WHERE customer_id = :cid"),
        {"cid": customer_id},
    ).fetchone()
    acronym = customer.customer_acronym

    counts = {
        "students_created": 0, "students_updated": 0, "students_deactivated": 0,
        "parents_created": 0, "parents_deactivated": 0,
    }

    for row in rows:
        row["org_id"] = row["org_id"].strip()

    seen_in_file: set[str] = set()
    for row in rows:
        if row["org_id"] in seen_in_file:
            raise AppError(ErrorCode.DUPLICATE_ID, context={"id": row["org_id"]})
        seen_in_file.add(row["org_id"])
        # Per spec, grade must be 1-12 — checked here, before _resolve_grades
        # ever runs, since that function get-or-creates a `grades` row for
        # any value it's given: an unchecked typo (e.g. 47) would otherwise
        # permanently pollute the global grades table, not just this row.
        if not (1 <= row["grade"] <= 12):
            raise AppError(ErrorCode.GRADE_INVALID, context={"id": row["org_id"], "grade": row["grade"]})

    seen_org_ids = {row["org_id"] for row in rows}
    seen_parent_emails: set[str] = set()

    try:
        session_id, is_future_target = _resolve_target_session(db, customer_id, target_session_id)
        grade_id_by_name = _resolve_grades(db, rows)

        org_ids = [row["org_id"] for row in rows]
        existing_rows = db.execute(
            text(
                "SELECT u.user_id, u.org_id, u.user_name, u.is_active, u.is_sysadm, s.student_id "
                "FROM users u LEFT JOIN students s ON s.user_id = u.user_id "
                "WHERE u.customer_id = :cid AND u.org_id = ANY(:org_ids)"
            ),
            {"cid": customer_id, "org_ids": org_ids},
        ).fetchall()
        existing_by_org_id = {r.org_id: r for r in existing_rows}

        # Classify every row up front (and raise on the first real conflict,
        # in file order — same row the old per-row loop would have hit
        # first) before any write happens.
        to_insert = []
        to_update = []
        for row in rows:
            existing = existing_by_org_id.get(row["org_id"])
            if existing is None:
                to_insert.append(row)
            elif existing.student_id is None:
                # org_id already belongs to a non-student user at this school
                # (a teacher, or the school's own sysadmin — see comment on
                # the equivalent check in teachers_upload_service).
                if existing.is_sysadm:
                    continue
                raise AppError(ErrorCode.DUPLICATE_ID, context={"id": row["org_id"]})
            else:
                to_update.append(row)

        student_id_by_org_id, new_user_ids = _insert_new_students(db, customer_id, customer, to_insert, grade_id_by_name, session_id)
        counts["students_created"] = len(to_insert)

        updated_org_ids = _update_existing_students(db, existing_by_org_id, to_update, grade_id_by_name, session_id)
        for row in to_update:
            student_id_by_org_id[row["org_id"]] = existing_by_org_id[row["org_id"]].student_id

        parents_created, parent_changed_student_ids, new_parent_user_ids = _upsert_parents(
            db, customer_id, to_insert + to_update, student_id_by_org_id, seen_parent_emails
        )
        counts["parents_created"] = parents_created
        new_user_ids += new_parent_user_ids

        if is_future_target:
            counts["students_deactivated"] = _deactivate_missing_students_future(db, customer_id, session_id, seen_org_ids)
        else:
            counts["students_deactivated"] = _deactivate_missing_students_current(db, customer_id, seen_org_ids)
        parents_deactivated, parent_deactivated_student_ids = _deactivate_missing_parents(
            db, customer_id, seen_parent_emails
        )
        counts["parents_deactivated"] = parents_deactivated

        # A student's parent list changing (a new/removed/reactivated link)
        # is a data change for that student too, same as their name/grade —
        # but only for rows that already existed; a brand new student's
        # parent links are part of being "created", not "updated" on top of
        # that.
        to_insert_org_ids = {row["org_id"] for row in to_insert}
        org_id_by_student_id = {sid: oid for oid, sid in student_id_by_org_id.items()}
        for student_id in parent_changed_student_ids | parent_deactivated_student_ids:
            org_id = org_id_by_student_id.get(student_id)
            if org_id is not None and org_id not in to_insert_org_ids:
                updated_org_ids.add(org_id)

        counts["students_updated"] = len(updated_org_ids)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return counts, new_user_ids


def _resolve_grades(db: Session, rows: list[dict]) -> dict[int, int]:
    """Get-or-create every distinct grade_name referenced in this upload,
    in bulk — grades are global (not customer-scoped), so this is cheap
    and rarely inserts anything after the first upload anywhere."""
    distinct_grades = sorted({row["grade"] for row in rows})
    if not distinct_grades:
        return {}

    grade_id_by_name = {
        g.grade_name: g.grade_id
        for g in db.execute(
            text("SELECT grade_id, grade_name FROM grades WHERE grade_name = ANY(:names)"),
            {"names": distinct_grades},
        ).fetchall()
    }

    missing = [g for g in distinct_grades if g not in grade_id_by_name]
    if missing:
        inserted = db.execute(
            text(
                "INSERT INTO grades (grade_name) "
                "SELECT * FROM unnest((:names)::smallint[]) AS t(grade_name) "
                "ON CONFLICT (grade_name) DO NOTHING "
                "RETURNING grade_id, grade_name"
            ),
            {"names": missing},
        ).fetchall()
        for g in inserted:
            grade_id_by_name[g.grade_name] = g.grade_id

        # Only possible if another upload/request inserted the same missing
        # grade_name concurrently between our SELECT and INSERT above —
        # ON CONFLICT DO NOTHING means RETURNING won't include it.
        still_missing = [g for g in missing if g not in grade_id_by_name]
        if still_missing:
            for g in db.execute(
                text("SELECT grade_id, grade_name FROM grades WHERE grade_name = ANY(:names)"),
                {"names": still_missing},
            ).fetchall():
                grade_id_by_name[g.grade_name] = g.grade_id

    return grade_id_by_name


def _insert_new_students(db: Session, customer_id: int, customer, to_insert: list[dict], grade_id_by_name: dict[int, int], session_id: int | None) -> tuple[dict[str, int], list[int]]:
    """Bulk-inserts users+students+student_grades for brand new org_ids.
    Returns ({org_id: student_id}, new_user_ids) for the rows just inserted.
    Every row gets the same placeholder password_hash (see
    password_service.placeholder_password_hash) — the caller defers a
    background job to set each account's real default-password hash, so
    hundreds of individual PBKDF2 calls never happen on the request path."""
    if not to_insert:
        return {}, []

    login_keys = [f"{row['org_id']}@{customer.customer_acronym}" for row in to_insert]
    placeholder = placeholder_password_hash()
    password_hashes = [placeholder] * len(to_insert)
    names = [row["name"] for row in to_insert]
    org_ids = [row["org_id"] for row in to_insert]

    inserted_users = db.execute(
        text(
            "INSERT INTO users (login_key, password_hash, user_name, country_id, customer_id, org_id, is_student) "
            "SELECT login_key, password_hash, user_name, :country_id, :customer_id, org_id, TRUE "
            "FROM unnest((:login_keys)::text[], (:password_hashes)::text[], (:names)::text[], (:org_ids)::text[]) "
            "AS t(login_key, password_hash, user_name, org_id) "
            "RETURNING user_id, org_id"
        ),
        {
            "country_id": customer.country_id, "customer_id": customer_id,
            "login_keys": login_keys, "password_hashes": password_hashes, "names": names, "org_ids": org_ids,
        },
    ).fetchall()
    user_id_by_org_id = {r.org_id: r.user_id for r in inserted_users}

    user_ids = [user_id_by_org_id[oid] for oid in org_ids]
    inserted_students = db.execute(
        text(
            "INSERT INTO students (user_id, customer_id, board_id) "
            "SELECT user_id, :customer_id, :board_id FROM unnest((:user_ids)::int[]) AS t(user_id) "
            "RETURNING student_id, user_id"
        ),
        {"customer_id": customer_id, "board_id": customer.board_id, "user_ids": user_ids},
    ).fetchall()
    student_id_by_user_id = {r.user_id: r.student_id for r in inserted_students}

    student_id_by_org_id = {
        row["org_id"]: student_id_by_user_id[user_id_by_org_id[row["org_id"]]] for row in to_insert
    }

    student_ids = [student_id_by_org_id[row["org_id"]] for row in to_insert]
    grade_ids = [grade_id_by_name[row["grade"]] for row in to_insert]
    sections = [row.get("section") for row in to_insert]
    session_ids = [session_id] * len(student_ids)
    db.execute(
        text(
            "INSERT INTO student_grades (student_id, grade_id, section, session_id) "
            "SELECT * FROM unnest((:sids)::int[], (:gids)::int[], (:secs)::text[], (:ssid)::int[]) "
            "AS t(student_id, grade_id, section, session_id)"
        ),
        {"sids": student_ids, "gids": grade_ids, "secs": sections, "ssid": session_ids},
    )

    return student_id_by_org_id, list(user_id_by_org_id.values())


def _update_existing_students(db: Session, existing_by_org_id: dict, to_update: list[dict], grade_id_by_name: dict[int, int], session_id: int) -> set[str]:
    """Reconciles name/active/grade/section for rows that already have a
    student. Returns the org_ids of rows that actually changed something.

    The "current grade" lookup is scoped to THIS upload's target session_id
    — for a current-session upload this matches the live active row
    (every active row is guaranteed to carry a real session_id once a
    customer has bootstrapped, see session_service.ensure_session_bootstrapped,
    so a strict equality filter is exact, no NULL fallback needed). For a
    future-session upload this naturally matches nothing on its first
    upload (everyone is "new" to that session — correct, a fresh staged
    row gets created for each) and matches previously-staged rows on later
    revisions (correct reconciliation against what's already been staged,
    not against the still-live current roster)."""
    if not to_update:
        return set()

    student_ids = [existing_by_org_id[row["org_id"]].student_id for row in to_update]
    current_grade_by_student_id = {
        g.student_id: g
        for g in db.execute(
            text(
                "SELECT student_grade_id, student_id, grade_id, section "
                "FROM student_grades WHERE student_id = ANY(:ids) AND is_active = TRUE AND session_id = :sid"
            ),
            {"ids": student_ids, "sid": session_id},
        ).fetchall()
    }

    users_to_touch = []       # (user_id, name)
    students_to_reactivate = []  # student_id
    grades_to_deactivate = []    # student_grade_id
    grades_to_insert = []        # (student_id, grade_id, section)
    sections_to_update = []      # (student_grade_id, section)
    updated_org_ids = set()

    for row in to_update:
        existing = existing_by_org_id[row["org_id"]]
        student_id = existing.student_id
        changed = False

        if existing.user_name != row["name"] or not existing.is_active:
            users_to_touch.append((existing.user_id, row["name"]))
            students_to_reactivate.append(student_id)
            changed = True

        new_grade_id = grade_id_by_name[row["grade"]]
        current_grade = current_grade_by_student_id.get(student_id)
        if current_grade is None or current_grade.grade_id != new_grade_id:
            if current_grade is not None:
                grades_to_deactivate.append(current_grade.student_grade_id)
            grades_to_insert.append((student_id, new_grade_id, row.get("section")))
            changed = True
        elif current_grade.section != row.get("section"):
            sections_to_update.append((current_grade.student_grade_id, row.get("section")))
            changed = True

        if changed:
            updated_org_ids.add(row["org_id"])

    if users_to_touch:
        ids, names = zip(*users_to_touch)
        db.execute(
            text(
                "UPDATE users u SET user_name = t.user_name, is_active = TRUE, date_modified = NOW() "
                "FROM unnest((:ids)::int[], (:names)::text[]) AS t(user_id, user_name) "
                "WHERE u.user_id = t.user_id"
            ),
            {"ids": list(ids), "names": list(names)},
        )
    if students_to_reactivate:
        db.execute(
            text("UPDATE students SET is_active = TRUE, date_modified = NOW() WHERE student_id = ANY(:ids)"),
            {"ids": students_to_reactivate},
        )
    if grades_to_deactivate:
        db.execute(
            text("UPDATE student_grades SET is_active = FALSE, date_modified = NOW() WHERE student_grade_id = ANY(:ids)"),
            {"ids": grades_to_deactivate},
        )
    if grades_to_insert:
        sids, gids, secs = zip(*grades_to_insert)
        db.execute(
            text(
                "INSERT INTO student_grades (student_id, grade_id, section, session_id) "
                "SELECT * FROM unnest((:sids)::int[], (:gids)::int[], (:secs)::text[], (:ssid)::int[]) "
                "AS t(student_id, grade_id, section, session_id)"
            ),
            {"sids": list(sids), "gids": list(gids), "secs": list(secs), "ssid": [session_id] * len(sids)},
        )
    if sections_to_update:
        ids, secs = zip(*sections_to_update)
        db.execute(
            text(
                "UPDATE student_grades sg SET section = t.section, date_modified = NOW() "
                "FROM unnest((:ids)::int[], (:secs)::text[]) AS t(student_grade_id, section) "
                "WHERE sg.student_grade_id = t.student_grade_id"
            ),
            {"ids": list(ids), "secs": list(secs)},
        )

    return updated_org_ids


def _upsert_parents(
    db: Session, customer_id: int, rows: list[dict], student_id_by_org_id: dict[str, int], seen_parent_emails: set[str]
) -> tuple[int, set[int], list[int]]:
    """Find-or-creates every parent user account referenced in this upload
    (matched globally by email, among parent-flagged rows only), then
    find-or-creates/reactivates their parents row for each student they're
    linked to. Returns (new parent user accounts created, student_ids whose
    parent links actually changed, new parent user_ids) — a parent gaining a
    link to an additional child isn't a new *account*, but it is a data
    change for that student. New accounts get a shared placeholder
    password_hash, same as new students — see _insert_new_students."""
    needed: list[tuple[str, int]] = []  # (email, student_id), one per row+slot
    for row in rows:
        student_id = student_id_by_org_id[row["org_id"]]
        for field in ("parent1_email", "parent2_email"):
            raw = row.get(field)
            if not raw:
                continue
            email = raw.strip().lower()
            seen_parent_emails.add(email)
            needed.append((email, student_id))

    if not needed:
        return 0, set(), []

    distinct_emails = sorted({email for email, _ in needed})
    existing_parent_by_email = {
        r.email_id: r
        for r in db.execute(
            text("SELECT user_id, email_id, is_active FROM users WHERE is_parent = TRUE AND email_id = ANY(:emails)"),
            {"emails": distinct_emails},
        ).fetchall()
    }

    missing_emails = [e for e in distinct_emails if e not in existing_parent_by_email]
    parent_user_id_by_email = {email: r.user_id for email, r in existing_parent_by_email.items()}
    new_parent_user_ids: list[int] = []
    if missing_emails:
        placeholder = placeholder_password_hash()
        password_hashes = [placeholder] * len(missing_emails)
        inserted = db.execute(
            text(
                "INSERT INTO users (login_key, password_hash, user_name, email_id, is_parent) "
                "SELECT email, password_hash, email, email, TRUE "
                "FROM unnest((:emails)::text[], (:hashes)::text[]) AS t(email, password_hash) "
                "RETURNING user_id, email_id"
            ),
            {"emails": missing_emails, "hashes": password_hashes},
        ).fetchall()
        for r in inserted:
            parent_user_id_by_email[r.email_id] = r.user_id
            new_parent_user_ids.append(r.user_id)

    to_reactivate_users = [
        r.user_id for email, r in existing_parent_by_email.items() if not r.is_active
    ]
    if to_reactivate_users:
        db.execute(
            text("UPDATE users SET is_active = TRUE, date_modified = NOW() WHERE user_id = ANY(:ids)"),
            {"ids": to_reactivate_users},
        )

    needed_pairs = {(parent_user_id_by_email[email], student_id) for email, student_id in needed}
    uids = [uid for uid, _ in needed_pairs]
    sids = [sid for _, sid in needed_pairs]
    existing_links = {
        (r.user_id, r.student_id): r
        for r in db.execute(
            text(
                "SELECT p.parent_id, p.user_id, p.student_id, p.is_active FROM parents p "
                "JOIN unnest((:uids)::int[], (:sids)::int[]) AS t(user_id, student_id) "
                "ON p.user_id = t.user_id AND p.student_id = t.student_id "
                "WHERE p.customer_id = :cid"
            ),
            {"uids": uids, "sids": sids, "cid": customer_id},
        ).fetchall()
    }

    links_to_insert = [pair for pair in needed_pairs if pair not in existing_links]
    links_to_reactivate = [
        (link.parent_id, sid) for (_, sid), link in existing_links.items() if not link.is_active
    ]

    if links_to_insert:
        insert_uids = [uid for uid, _ in links_to_insert]
        insert_sids = [sid for _, sid in links_to_insert]
        db.execute(
            text(
                "INSERT INTO parents (user_id, student_id, customer_id) "
                "SELECT user_id, student_id, :cid FROM unnest((:uids)::int[], (:sids)::int[]) AS t(user_id, student_id)"
            ),
            {"cid": customer_id, "uids": insert_uids, "sids": insert_sids},
        )
    if links_to_reactivate:
        db.execute(
            text("UPDATE parents SET is_active = TRUE, date_modified = NOW() WHERE parent_id = ANY(:ids)"),
            {"ids": [pid for pid, _ in links_to_reactivate]},
        )

    changed_student_ids = {sid for _, sid in links_to_insert} | {sid for _, sid in links_to_reactivate}
    return len(missing_emails), changed_student_ids, new_parent_user_ids


def _deactivate_missing_students_current(db: Session, customer_id: int, seen_org_ids: set[str]) -> int:
    """Current-session upload (the ordinary case, unaffected by future-
    session staging): a missing org_id deactivates the whole account —
    they're gone from the school entirely as of today, exactly as before
    this feature existed."""
    missing = db.execute(
        text(
            "SELECT s.student_id, u.user_id FROM students s "
            "JOIN users u ON u.user_id = s.user_id "
            "WHERE u.customer_id = :cid AND u.is_active = TRUE "
            "AND NOT (u.org_id = ANY(:org_ids))"
        ),
        {"cid": customer_id, "org_ids": list(seen_org_ids)},
    ).fetchall()
    if missing:
        user_ids = [r.user_id for r in missing]
        student_ids = [r.student_id for r in missing]
        db.execute(text("UPDATE users SET is_active = FALSE, date_modified = NOW() WHERE user_id = ANY(:ids)"), {"ids": user_ids})
        db.execute(text("UPDATE students SET is_active = FALSE, date_modified = NOW() WHERE student_id = ANY(:ids)"), {"ids": student_ids})
        db.execute(
            text("UPDATE student_grades SET is_active = FALSE, date_modified = NOW() WHERE student_id = ANY(:ids) AND is_active = TRUE"),
            {"ids": student_ids},
        )
    return len(missing)


def _deactivate_missing_students_future(db: Session, customer_id: int, session_id: int, seen_org_ids: set[str]) -> int:
    """Future-session upload: a student dropped from a later revision of
    the staged roster is NOT deactivated at the account level — they're
    still fully enrolled and using the app under the current session right
    up to cutover. Only their student_grades row staged under this future
    session_id gets deactivated, so they simply won't have an active row
    in the new session once cutover happens."""
    missing = db.execute(
        text(
            "SELECT sg.student_grade_id FROM student_grades sg "
            "JOIN students st ON st.student_id = sg.student_id "
            "JOIN users u ON u.user_id = st.user_id "
            "WHERE u.customer_id = :cid AND sg.session_id = :sid AND sg.is_active = TRUE "
            "AND NOT (u.org_id = ANY(:org_ids))"
        ),
        {"cid": customer_id, "sid": session_id, "org_ids": list(seen_org_ids)},
    ).fetchall()
    if missing:
        db.execute(
            text("UPDATE student_grades SET is_active = FALSE, date_modified = NOW() WHERE student_grade_id = ANY(:ids)"),
            {"ids": [r.student_grade_id for r in missing]},
        )
    return len(missing)


def _deactivate_missing_parents(db: Session, customer_id: int, seen_parent_emails: set[str]) -> tuple[int, set[int]]:
    missing = db.execute(
        text(
            "SELECT p.parent_id, p.user_id, p.student_id FROM parents p "
            "JOIN users u ON u.user_id = p.user_id "
            "WHERE p.customer_id = :cid AND p.is_active = TRUE "
            "AND NOT (u.email_id = ANY(:emails))"
        ),
        {"cid": customer_id, "emails": list(seen_parent_emails)},
    ).fetchall()
    if missing:
        db.execute(
            text("UPDATE parents SET is_active = FALSE, date_modified = NOW() WHERE parent_id = ANY(:ids)"),
            {"ids": [r.parent_id for r in missing]},
        )
        candidate_user_ids = list({r.user_id for r in missing})
        no_active_links_left = db.execute(
            text(
                "SELECT user_id FROM users WHERE user_id = ANY(:ids) "
                "AND NOT EXISTS (SELECT 1 FROM parents p2 WHERE p2.user_id = users.user_id AND p2.is_active = TRUE)"
            ),
            {"ids": candidate_user_ids},
        ).fetchall()
        if no_active_links_left:
            db.execute(
                text("UPDATE users SET is_active = FALSE, date_modified = NOW() WHERE user_id = ANY(:ids)"),
                {"ids": [r.user_id for r in no_active_links_left]},
            )
    return len(missing), {r.student_id for r in missing}

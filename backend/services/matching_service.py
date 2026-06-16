"""
Subject/area/topic fuzzy matching, tiered to avoid false-positive matches
between similar-but-different concepts (e.g. "Newton's First Law" vs
"Newton's Second Law" — high trigram similarity, different topics).

Tiers:
  >= match_auto_accept_threshold (default 0.98) -> auto-accept, no LLM call
  match_llm_verify_floor..auto_accept (default 0.90-0.98) -> ask the LLM
     "same or different?" for the top candidate(s)
  < match_llm_verify_floor -> no match, caller proceeds to the new-record path
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from config.app_config import get_setting
from db.models import Subject, SubjectArea, Topic
from llm.factory import LLMPurpose, get_llm_client

_CANDIDATE_LIMIT = 3


async def match_subject(db: Session, subject_name: str, user_country_id: int) -> Subject | None:
    rows = db.execute(
        text("""
            SELECT subject_id, subject_name, similarity(subject_name, :name) AS score
            FROM subjects
            WHERE is_active = true
              AND (country_id IS NULL OR country_id = :country_id)
            ORDER BY score DESC
            LIMIT :limit
        """),
        {"name": subject_name, "country_id": user_country_id, "limit": _CANDIDATE_LIMIT},
    ).fetchall()

    matched_id = await _resolve_match(
        rows, subject_name, id_field="subject_id", name_field="subject_name", description="academic subject"
    )
    return db.get(Subject, matched_id) if matched_id else None


async def match_subject_area(db: Session, subject_id: int, area_name: str) -> SubjectArea | None:
    """Match an area name scoped to a known subject — used once the subject
    has already been resolved (e.g. while classifying a new topic)."""
    rows = db.execute(
        text("""
            SELECT subject_area_id, area_name, similarity(area_name, :name) AS score
            FROM subject_areas
            WHERE subject_id = :subject_id AND is_active = true
            ORDER BY score DESC
            LIMIT :limit
        """),
        {"name": area_name, "subject_id": subject_id, "limit": _CANDIDATE_LIMIT},
    ).fetchall()

    matched_id = await _resolve_match(
        rows, area_name, id_field="subject_area_id", name_field="area_name", description="subject area"
    )
    return db.get(SubjectArea, matched_id) if matched_id else None


async def match_subject_area_globally(db: Session, area_name: str) -> SubjectArea | None:
    """Match an area name across ALL subjects — used when classifying the
    raw subject-field input, since at that point we don't yet know which
    subject it might belong to (e.g. user typed "Calculus" instead of "Math")."""
    rows = db.execute(
        text("""
            SELECT subject_area_id, area_name, similarity(area_name, :name) AS score
            FROM subject_areas
            WHERE is_active = true
            ORDER BY score DESC
            LIMIT :limit
        """),
        {"name": area_name, "limit": _CANDIDATE_LIMIT},
    ).fetchall()

    matched_id = await _resolve_match(
        rows, area_name, id_field="subject_area_id", name_field="area_name", description="subject area"
    )
    return db.get(SubjectArea, matched_id) if matched_id else None


async def match_topic(db: Session, subject_area_id: int, topic_name: str, user_country_id: int) -> Topic | None:
    rows = db.execute(
        text("""
            SELECT topic_id, topic_name, similarity(topic_name, :name) AS score
            FROM topics
            WHERE subject_area_id = :subject_area_id
              AND is_active = true
              AND (country_id IS NULL OR country_id = :country_id)
            ORDER BY score DESC
            LIMIT :limit
        """),
        {"name": topic_name, "subject_area_id": subject_area_id, "country_id": user_country_id, "limit": _CANDIDATE_LIMIT},
    ).fetchall()

    matched_id = await _resolve_match(
        rows, topic_name, id_field="topic_id", name_field="topic_name", description="academic topic"
    )
    return db.get(Topic, matched_id) if matched_id else None


async def _resolve_match(rows, input_name: str, *, id_field: str, name_field: str, description: str) -> int | None:
    if not rows:
        return None

    auto_threshold = get_setting("match_auto_accept_threshold", 0.98)
    llm_floor = get_setting("match_llm_verify_floor", 0.90)

    best = rows[0]
    if best.score >= auto_threshold:
        return getattr(best, id_field)

    if best.score >= llm_floor:
        candidates = [getattr(r, name_field) for r in rows if r.score >= llm_floor]
        llm = get_llm_client(LLMPurpose.VALIDATE)
        result = await llm.generate_json(
            system=(
                f"You determine whether two {description} names refer to the same "
                f"underlying concept. Be strict — similar wording does not mean the "
                f"same concept (e.g. 'Newton's First Law' and 'Newton's Second Law' "
                f"are DIFFERENT despite high text similarity)."
            ),
            user=(
                f'Input {description}: "{input_name}"\n'
                f"Candidates: {candidates}\n\n"
                f'Respond as JSON: {{"same": true/false, "matched_name": "<exact candidate '
                f'string if same, else null>"}}'
            ),
        )
        if result.get("same") and result.get("matched_name"):
            match = next((r for r in rows if getattr(r, name_field) == result["matched_name"]), None)
            if match:
                return getattr(match, id_field)

    return None

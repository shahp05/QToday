"""
Canonical defaults for every app_settings row — the single source of truth.

Historically these defaults were duplicated as raw SQL: once in schema.sql
(for a from-scratch manual bootstrap) and once as a one-time INSERT inside
an Alembic migration. That's exactly what caused this table to end up
empty in production — see ensure_default_settings's docstring in
config/app_config.py. Add a new tunable here, once, and both a fresh
install and every existing deployment pick it up the same way (via
ensure_default_settings running at app startup) — never add it as a
migration INSERT again.
"""
from typing import Any

DEFAULT_SETTINGS: dict[str, tuple[Any, str]] = {
    "match_auto_accept_threshold": (
        0.98, "Trigram similarity score above which a subject/topic match is auto-accepted without an LLM check",
    ),
    "match_llm_verify_floor": (
        0.90, "Trigram similarity score above which an ambiguous match is sent to the LLM for same/different disambiguation",
    ),
    "descriptive_pct": (0.20, "Share of generated questions that should be descriptive"),
    "mcq_pct": (0.60, "Share of generated questions that should be MCQ"),
    "difficulty_default": (
        [0.20, 0.20, 0.20, 0.20, 0.20], "Difficulty level 1-5 distribution for grades below the skew threshold",
    ),
    "difficulty_skewed": (
        [0.10, 0.10, 0.10, 0.30, 0.40], "Difficulty level 1-5 distribution for grades at/above the skew threshold",
    ),
    "difficulty_skew_grade_threshold": (9, "Grade at which the skewed (harder) difficulty distribution kicks in"),
    "grade_relevant_to_increment": (
        2, "Default +N applied to grade to compute grade_relevant_to for grades below the override bands",
    ),
    "grade_relevant_to_override_grade_6": (10, "grade_relevant_to value forced for grades 6-7"),
    "grade_relevant_to_override_grade_8": (12, "grade_relevant_to value forced for grades 8 and above"),
    "title_case_stopwords": (
        ["a", "an", "the", "of", "in", "on", "and", "or", "for", "to", "with", "at", "by", "is", "are"],
        "Words kept lowercase in title-cased subject/topic names unless first or last word",
    ),
    "llm_model_map": (
        {"validate": "gpt-4o", "generate": "gpt-4o"}, "Which OpenAI model handles each LLM purpose",
    ),
    "default_marks_per_qa": (5, "Default marks assigned to each question when a quiz is created"),
    "default_questions_per_quiz": (
        20, "Default number of questions per quiz (20 x 5 marks = 100 total by default)",
    ),
    "default_expected_time_seconds": (
        60, "Fallback expected_time_seconds for qa rows before an LLM estimate or empirical recalibration is available",
    ),
    "qa_time_recalibration_min_attempts": (
        10, "Minimum quiz_scores attempts for a qa_id before empirical time data overrides the LLM estimate",
    ),
    "descriptive_match_auto_score_threshold": (
        0.85,
        "Trigram similarity score above which a descriptive answer is auto-scored from a precedent match "
        "(master answer or another student's past scored response) without an LLM call",
    ),
    "qa_top_up_threshold": (
        100, "Verified+active qa row count per subject+topic+grade below which a top-up is triggered",
    ),
    "rest_countries_api_url": (
        "https://api.worldbank.org/v2/country?format=json&per_page=300",
        "External source for the country_list background job (World Bank — free, no key; REST Countries deprecated its free tier)",
    ),
    "error_log_soft_delete_after_days": (
        90, "Age in days after which error_logs rows are marked date_deleted by the purge-mark job",
    ),
    "error_log_purge_grace_days": (
        30, "Days after date_deleted before error_logs rows are physically deleted by the purge-delete job",
    ),
    "batch_request_types": (
        {
            "country_list": {"interval_days": 90},
            "qa_generation": {"interval_days": 45},
            "qa_verification": {"interval_days": 1},
            "qa_scoring": {},
            "qa_time_recalibration": {"interval_days": 7},
            "error_log_purge_mark": {"interval_days": 1},
            "error_log_purge_delete": {"interval_days": 1},
        },
        "Valid batch_jobs.request_type values and their default run interval where applicable",
    ),
    "signup_verification_ttl_seconds": (60, "Seconds before a signup email verification code expires"),
    "signup_verification_max_attempts": (
        5, "Max wrong-code attempts before the code is invalidated and a new one must be requested",
    ),
}

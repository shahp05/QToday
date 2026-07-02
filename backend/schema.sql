-- ============================================================
-- QToday Database Schema
-- CBSE EdTech · Grades 1–12
-- ============================================================

-- pg_trgm enables similarity()/trigram matching used by the
-- subject/topic matching service (qa_service and friends).
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ------------------------------------------------------------
-- 1. COUNTRIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS countries (
    country_id      SERIAL          PRIMARY KEY,
    country_code    VARCHAR(3)      NOT NULL UNIQUE,
    country_name    VARCHAR(100)    NOT NULL,
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 2. BOARDS  (master — per country; added at signup if new)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boards (
    board_id        SERIAL          PRIMARY KEY,
    board_code      VARCHAR(20)     NOT NULL,
    board_name      VARCHAR(200)    NOT NULL,
    country_id      INTEGER         NOT NULL REFERENCES countries(country_id),
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    UNIQUE (board_code, country_id)
);


-- ------------------------------------------------------------
-- 3. GRADES  (master)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grades (
    grade_id        SERIAL          PRIMARY KEY,
    grade_name      SMALLINT        NOT NULL UNIQUE CHECK (grade_name BETWEEN 1 AND 12),
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 4. CUSTOMERS  (schools / tuition groups)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    customer_id       SERIAL          PRIMARY KEY,
    country_id        INTEGER         NOT NULL REFERENCES countries(country_id),
    customer_name     VARCHAR(200)    NOT NULL,
    board_id          INTEGER         NOT NULL REFERENCES boards(board_id),
    customer_acronym  VARCHAR(20)     NOT NULL UNIQUE,
    customer_address  VARCHAR(300)    NULL,
    customer_city     VARCHAR(100)    NULL,
    customer_state    VARCHAR(100)    NULL,
    customer_zip      VARCHAR(20)     NULL,
    customer_gstn     VARCHAR(20)     NULL,
    customer_email    VARCHAR(200)    NULL,
    customer_phone    VARCHAR(20)     NULL,
    date_created      TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified     TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted      TIMESTAMP       NULL,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 5. USERS
--
--   password_date_created : defaults to NOW() at signup, same INSERT as
--   date_created, so they share one transaction timestamp. Equal values
--   means the password has never been changed — any password-change flow
--   must bump this column independently of date_created/date_modified.
--
--   email_id is unique only among parent accounts (see uidx_users_email_parent
--   below) — a parent and an admin/teacher can share the same email, since
--   they're separate login identities (parent logs in with their email,
--   staff/students use org_id@acronym).
--
--   is_sysadm / is_adm are read together with customer_id (one admin account
--   never manages more than one school, so there's no admin-roles join
--   table — customer_id doubles as the scope selector):
--     is_sysadm=TRUE, customer_id set  -> that school's owner/super admin
--     is_adm=TRUE,    customer_id set  -> that school's ordinary admin/teacher
--     is_sysadm=TRUE, customer_id NULL -> platform-level system admin
--     is_adm=TRUE,    customer_id NULL -> reserved, unused for now
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id         SERIAL          PRIMARY KEY,
    login_key       VARCHAR(200)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    password_date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    user_name       VARCHAR(200)    NOT NULL,
    email_id        VARCHAR(200)    NULL,
    country_id      INTEGER         NULL REFERENCES countries(country_id),
    customer_id     INTEGER         NULL REFERENCES customers(customer_id),
    org_id          VARCHAR(50)     NULL,
    is_student      BOOLEAN         NOT NULL DEFAULT FALSE,
    is_parent       BOOLEAN         NOT NULL DEFAULT FALSE,
    is_sysadm       BOOLEAN         NOT NULL DEFAULT FALSE,
    is_adm          BOOLEAN         NOT NULL DEFAULT FALSE,
    file_url        VARCHAR(500)    NULL,
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email_parent ON users(email_id) WHERE is_parent = TRUE;


-- ------------------------------------------------------------
-- 6. STUDENTS  (board_id: individual and customer students always
--               belong to exactly one board)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    student_id      SERIAL          PRIMARY KEY,
    user_id         INTEGER         NOT NULL REFERENCES users(user_id),
    customer_id     INTEGER         NULL REFERENCES customers(customer_id),
    board_id        INTEGER         NOT NULL REFERENCES boards(board_id),
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 7. STUDENT_GRADES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_grades (
    student_grade_id  SERIAL          PRIMARY KEY,
    student_id        INTEGER         NOT NULL REFERENCES students(student_id),
    grade_id          INTEGER         NOT NULL REFERENCES grades(grade_id),
    section           VARCHAR(5)      NULL,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
    date_created      TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified     TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted      TIMESTAMP       NULL
);


-- ------------------------------------------------------------
-- 9. PARENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
    parent_id       SERIAL          PRIMARY KEY,
    user_id         INTEGER         NOT NULL REFERENCES users(user_id),
    student_id      INTEGER         NOT NULL REFERENCES students(student_id),
    customer_id     INTEGER         NULL REFERENCES customers(customer_id),
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_customer          ON users(customer_id);
CREATE INDEX IF NOT EXISTS idx_users_org               ON users(customer_id, org_id);
CREATE INDEX IF NOT EXISTS idx_students_user           ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_customer       ON students(customer_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_student  ON student_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_active   ON student_grades(student_id, is_active);
CREATE INDEX IF NOT EXISTS idx_parents_student         ON parents(student_id);


-- ------------------------------------------------------------
-- 10. SUBJECTS  (master)
--
--   country_id : NULL = universal subject (Math, Science).
--                Set   = subject itself is country-specific
--                        (e.g. a "Civics" subject tied to one
--                        country's government structure).
--                Concepts, not curriculum — board never enters
--                this table or its validation logic.
--
--   Uniqueness is country-aware: the same subject_name can exist
--   once universally (country_id NULL) and once per country that
--   needs its own tagged version — see partial indexes below.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
    subject_id      SERIAL          PRIMARY KEY,
    subject_name    VARCHAR(200)    NOT NULL,
    country_id      INTEGER         NULL REFERENCES countries(country_id),
    is_verified     BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_subjects_name_universal
    ON subjects (subject_name)
    WHERE country_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_subjects_name_country
    ON subjects (subject_name, country_id)
    WHERE country_id IS NOT NULL;


-- ------------------------------------------------------------
-- 11. SUBJECT_AREAS  (master — sub-categories within a subject,
--                     e.g. Calculus/Trigonometry under Mathematics,
--                     Macroeconomics/Microeconomics under Economics)
--
--   Every subject gets a "General" area as a fallback for topics
--   that don't need finer categorization — created lazily, not
--   pre-seeded, so subjects without natural sub-areas don't carry
--   unused rows.
--
--   No country_id here — areas like "Calculus" are the same concept
--   everywhere; only topics/QA carry country-specificity.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subject_areas (
    subject_area_id SERIAL          PRIMARY KEY,
    subject_id      INTEGER         NOT NULL REFERENCES subjects(subject_id),
    area_name       VARCHAR(200)    NOT NULL,
    is_verified     BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted    TIMESTAMP       NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    UNIQUE (subject_id, area_name)
);


-- ------------------------------------------------------------
-- 12. TOPICS  (master — grade-agnostic)
--
--   subject_area_id : always set (defaults to the subject's
--                      "General" area). Scopes topic uniqueness
--                      one level deeper than subject alone — this
--                      is what lets "Equilibrium" exist once under
--                      Microeconomics and once under Macroeconomics
--                      without colliding.
--   subject_id      : denormalized from subject_area_id's parent,
--                      kept for query convenience — must always
--                      match subject_areas.subject_id for the same row
--                      (enforced at the application layer).
--   country_id      : NULL = universal topic. Set = this topic is
--                      country-specific even though the subject/area
--                      is universal (e.g. "Money" under Maths).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
    topic_id          SERIAL          PRIMARY KEY,
    subject_id        INTEGER         NOT NULL REFERENCES subjects(subject_id),
    subject_area_id   INTEGER         NOT NULL REFERENCES subject_areas(subject_area_id),
    topic_name        VARCHAR(200)    NOT NULL,
    country_id        INTEGER         NULL REFERENCES countries(country_id),
    is_verified       BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created      TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified     TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted      TIMESTAMP       NULL,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_topics_name_universal
    ON topics (subject_area_id, topic_name)
    WHERE country_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_topics_name_country
    ON topics (subject_area_id, topic_name, country_id)
    WHERE country_id IS NOT NULL;


-- ------------------------------------------------------------
-- 13. QA  (universal — shared across all accounts)
--
--   question_type    : 'descriptive' | 'mcq' | 'true_false'
--   question / answer: LaTeX text
--   options (JSONB, MCQ only):
--     { "a": "...", "b": "...", "c": "...", "d": "...", "correct": "a" }
--   difficulty_level : 1 (default) – 5; per grade, for future use
--   is_verified      : false until reviewed; students see only true rows
--   expected_time_seconds : LLM-estimated at generation time (accounts for
--                      difficulty, computation, multi-correct MCQ); later
--                      recalibrated from actual quiz_scores.time_taken_seconds
--                      via a separate background job (median, once enough
--                      attempts exist)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa (
    qa_id                   SERIAL          PRIMARY KEY,
    subject_id              INTEGER         NOT NULL REFERENCES subjects(subject_id),
    topic_id                INTEGER         NOT NULL REFERENCES topics(topic_id),
    grade_id                INTEGER         NOT NULL REFERENCES grades(grade_id),
    question_type           VARCHAR(20)     NOT NULL
                                CHECK (question_type IN ('descriptive', 'mcq', 'true_false')),
    question                TEXT            NOT NULL,
    answer                  TEXT            NOT NULL,
    options                 JSONB           NULL,
    difficulty_level        SMALLINT        NOT NULL DEFAULT 1
                                CHECK (difficulty_level BETWEEN 1 AND 5),
    expected_time_seconds   INTEGER         NULL,
    is_verified             BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created            TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_modified           TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted            TIMESTAMP       NULL,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_options CHECK (
        (question_type = 'mcq' AND options IS NOT NULL) OR
        (question_type != 'mcq' AND options IS NULL)
    )
);


-- ------------------------------------------------------------
-- 15. QUIZZES
--
--   student_id  : the academic actor taking the quiz (not user_id —
--                 a parent's login may differ from the student playing).
--   date_scored : set only once EVERY quiz_scores row for this quiz
--                 has is_scored = true. Source of truth is the
--                 aggregate over quiz_scores; this column is a cache
--                 written by the scoring-completion check, not a
--                 second independent source of truth.
--   total_marks : snapshot — default_questions_per_quiz x
--                 default_marks_per_qa at creation time (app_settings),
--                 not recomputed later even if config defaults change.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
    quiz_id                     SERIAL          PRIMARY KEY,
    subject_id                  INTEGER         NOT NULL REFERENCES subjects(subject_id),
    topic_id                    INTEGER         NOT NULL REFERENCES topics(topic_id),
    student_id                  INTEGER         NOT NULL REFERENCES students(student_id),
    date_created                TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_scored                 TIMESTAMP       NULL,
    total_score                 NUMERIC(6,2)    NULL,
    total_marks                 NUMERIC(6,2)    NOT NULL,
    total_time_taken_seconds    INTEGER         NULL,
    date_deleted                TIMESTAMP       NULL,
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 16. QUIZ_SCORES  (one row per question within a quiz)
--
--   question/answer/options/question_type : FROZEN COPIES of the qa
--   row at quiz-creation time — not live references. If qa is later
--   corrected, already-played quizzes must still show what the
--   student actually saw and was scored against.
--
--   student_response : the student's submitted answer. Compared
--   against `answer` (exact match for mcq/true_false) or, for
--   descriptive, matched via trigram similarity against `answer`
--   and other students' past scored responses to the same qa_id
--   before falling back to an LLM scoring call (qa_scoring batch job).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_scores (
    quiz_score_id       SERIAL          PRIMARY KEY,
    quiz_id             INTEGER         NOT NULL REFERENCES quizzes(quiz_id),
    qa_id               INTEGER         NOT NULL REFERENCES qa(qa_id),
    question            TEXT            NOT NULL,
    answer              TEXT            NOT NULL,
    options             JSONB           NULL,
    question_type       VARCHAR(20)     NOT NULL,
    student_response    TEXT            NULL,
    marks               NUMERIC(6,2)    NOT NULL,
    score                NUMERIC(6,2)    NULL,
    time_taken_seconds   INTEGER         NULL,
    is_scored            BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created         TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted          TIMESTAMP       NULL,
    is_active              BOOLEAN         NOT NULL DEFAULT TRUE,
    UNIQUE (quiz_id, qa_id)
);


-- ------------------------------------------------------------
-- 17. QUIZ_CHALLENGES
--
--   is_upheld    : LLM's determination — was the student's challenge
--                  valid? NULL until resolved.
--   date_closed  : NULL = open/unresolved, set = resolved. Doubles as
--                  the closed-flag, no separate boolean needed.
--   Auto-correction of qa.answer when is_upheld=true is deferred —
--   not implemented yet.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_challenges (
    challenge_id         SERIAL          PRIMARY KEY,
    quiz_id              INTEGER         NOT NULL REFERENCES quizzes(quiz_id),
    qa_id                INTEGER         NOT NULL REFERENCES qa(qa_id),
    challenge_reason     TEXT            NOT NULL,
    challenge_response   TEXT            NULL,
    is_upheld            BOOLEAN         NULL,
    date_created         TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_closed          TIMESTAMP       NULL,
    date_deleted         TIMESTAMP       NULL,
    is_active            BOOLEAN         NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 18. BATCH_JOBS  (generic background-job tracker — covers both
--                  true LLM batch jobs and simple scheduled tasks)
--
--   batch_id     : external batch ID (e.g. OpenAI "batch_xxx").
--                  NULL for jobs with no external batch system
--                  (e.g. country_list refresh).
--   custom_ids   : JSONB array of per-request custom_id strings used
--                  within an OpenAI batch, to map results back to
--                  specific (grade, question_type) combos on completion.
--   file_ids     : JSONB, e.g. {"input": "file-xxx", "output": "file-yyy"}.
--   request_type : validated against app_settings.batch_request_types
--                  at the application layer (not DB-enforced).
--
--   NOTE — is_active here does NOT mean "not soft-deleted" like every
--   other table. It means "still a live/successful run":
--     is_active=true,  is_closed=false -> currently running
--     is_active=true,  is_closed=true  -> completed successfully
--     is_active=false, is_closed=false -> failed before completing
--   "Last successful run" query:
--     WHERE request_type = ? AND is_active = true AND is_closed = true
--     ORDER BY date_created DESC LIMIT 1
--
--   No date_modified/date_deleted — rows are write-once after
--   creation except for the is_active/is_closed flags themselves.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_jobs (
    batch_job_id    SERIAL          PRIMARY KEY,
    batch_id        VARCHAR(100)    NULL,
    custom_ids      JSONB           NULL,
    file_ids        JSONB           NULL,
    request_type    VARCHAR(50)     NULL,
    country_id      INTEGER         NULL REFERENCES countries(country_id),
    subject_id      INTEGER         NULL REFERENCES subjects(subject_id),
    topic_id        INTEGER         NULL REFERENCES topics(topic_id),
    qa_id           INTEGER         NULL REFERENCES qa(qa_id),
    quiz_id         INTEGER         NULL REFERENCES quizzes(quiz_id),
    challenge_id    INTEGER         NULL REFERENCES quiz_challenges(challenge_id),
    user_id         INTEGER         NULL REFERENCES users(user_id),
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    is_closed       BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created    TIMESTAMP       NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- 19. ERROR_LOGS
--
--   type            : source category — fixed set (CHECK constraint,
--                     not app_settings — adding a new source means
--                     writing new integration code anyway).
--   error_code      : validated against the shared registry in
--                     error_codes.json at the application layer, not
--                     DB-enforced — kept a plain VARCHAR so logging
--                     stays a single fast INSERT, no join required.
--   err_description : human-readable; falls back to the error code's
--                     default message from ERROR_DEFAULTS if none given.
--   stack_trace     : raw traceback/JS stack — separate from
--                     err_description so the description stays short
--                     and consistent while this carries full detail.
--   context         : flexible JSONB bag (relevant IDs, request
--                     payload, etc.) — errors can occur anywhere in
--                     the system, so this avoids replicating
--                     batch_jobs' "one nullable FK per entity" pattern.
--   correlation_id  : ties together log entries from one logical
--                     operation across frontend/backend/batch layers.
--   date_deleted    : two-phase purge — a background job marks rows
--                     past the retention window, a second pass
--                     physically deletes them after a grace period
--                     (app_settings: error_log_soft_delete_after_days,
--                     error_log_purge_grace_days).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS error_logs (
    error_log_id    SERIAL          PRIMARY KEY,
    type             VARCHAR(20)     NOT NULL CHECK (type IN ('api', 'batch', 'frontend')),
    error_code       VARCHAR(50)     NOT NULL,
    err_description  TEXT            NOT NULL,
    stack_trace      TEXT            NULL,
    context          JSONB           NULL,
    correlation_id   VARCHAR(50)     NULL,
    user_id          INTEGER         NULL REFERENCES users(user_id),
    date_created     TIMESTAMP       NOT NULL DEFAULT NOW(),
    date_deleted     TIMESTAMP       NULL
);


-- ------------------------------------------------------------
-- INDEXES (subjects / topics / qa / quizzes /
--          quiz_scores / quiz_challenges / batch_jobs / error_logs)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_topics_subject        ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject_area    ON topics(subject_area_id);
CREATE INDEX IF NOT EXISTS idx_subject_areas_subject  ON subject_areas(subject_id);
CREATE INDEX IF NOT EXISTS idx_subjects_country       ON subjects(country_id);
CREATE INDEX IF NOT EXISTS idx_topics_country         ON topics(country_id);
CREATE INDEX IF NOT EXISTS idx_qa_subject_topic      ON qa(subject_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_qa_grade              ON qa(grade_id);
CREATE INDEX IF NOT EXISTS idx_qa_type               ON qa(question_type);
CREATE INDEX IF NOT EXISTS idx_qa_verified           ON qa(is_verified);
CREATE INDEX IF NOT EXISTS idx_quizzes_student       ON quizzes(student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_topic         ON quizzes(topic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_scores_quiz      ON quiz_scores(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_scores_qa        ON quiz_scores(qa_id);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_quiz  ON quiz_challenges(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_qa    ON quiz_challenges(qa_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_country    ON batch_jobs(country_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_subject    ON batch_jobs(subject_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_topic      ON batch_jobs(topic_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_lookup      -- "find last successful run" query
    ON batch_jobs(request_type, is_active, is_closed, date_created);
CREATE INDEX IF NOT EXISTS idx_error_logs_type        ON error_logs(type);
CREATE INDEX IF NOT EXISTS idx_error_logs_code        ON error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_user        ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created     ON error_logs(date_created);
CREATE INDEX IF NOT EXISTS idx_error_logs_correlation ON error_logs(correlation_id);


-- ------------------------------------------------------------
-- SEED: grades master (1–12)
-- ------------------------------------------------------------
INSERT INTO grades (grade_name)
VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)
ON CONFLICT (grade_name) DO NOTHING;


-- ------------------------------------------------------------
-- 20. APP_SETTINGS  (business-tunable config — no hardcoding)
--
--   Read by config/app_config.py and cached in memory. Change a
--   row + call reload_settings() to take effect without a deploy.
--   Secrets (API keys, DATABASE_URL) stay in .env — never here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    setting_key     VARCHAR(100)    PRIMARY KEY,
    setting_value   JSONB           NOT NULL,
    description     VARCHAR(500)    NULL,
    date_modified   TIMESTAMP       NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (setting_key, setting_value, description) VALUES
    ('match_auto_accept_threshold', '0.98', 'Trigram similarity score above which a subject/topic match is auto-accepted without an LLM check'),
    ('match_llm_verify_floor',      '0.90', 'Trigram similarity score above which an ambiguous match is sent to the LLM for same/different disambiguation'),
    ('qa_count',                    '30',   'Total QA items generated per subject+topic+grade'),
    ('descriptive_pct',             '0.20', 'Share of qa_count that should be descriptive questions'),
    ('mcq_pct',                     '0.60', 'Share of qa_count that should be MCQ questions'),
    ('difficulty_default',          '[0.20,0.20,0.20,0.20,0.20]', 'Difficulty level 1-5 distribution for grades below the skew threshold'),
    ('difficulty_skewed',           '[0.10,0.10,0.10,0.30,0.40]', 'Difficulty level 1-5 distribution for grades at/above the skew threshold'),
    ('difficulty_skew_grade_threshold', '9', 'Grade at which the skewed (harder) difficulty distribution kicks in'),
    ('grade_relevant_to_increment', '2',    'Default +N applied to grade to compute grade_relevant_to for grades below the override bands'),
    ('grade_relevant_to_override_grade_6', '10', 'grade_relevant_to value forced for grades 6-7'),
    ('grade_relevant_to_override_grade_8', '12', 'grade_relevant_to value forced for grades 8 and above'),
    ('title_case_stopwords',        '["a","an","the","of","in","on","and","or","for","to","with","at","by","is","are"]', 'Words kept lowercase in title-cased subject/topic names unless first or last word'),
    ('llm_provider_map',            '{"validate":"groq","generate":"openai"}', 'Which provider handles each LLM purpose'),
    ('llm_model_map',               '{"groq":"llama-3.3-70b-versatile","openai":"gpt-4o"}', 'Which model each provider uses'),
    ('default_marks_per_qa',        '5',    'Default marks assigned to each question when a quiz is created'),
    ('default_questions_per_quiz',  '20',   'Default number of questions per quiz (20 x 5 marks = 100 total by default)'),
    ('default_expected_time_seconds', '60', 'Fallback expected_time_seconds for qa rows before an LLM estimate or empirical recalibration is available'),
    ('qa_time_recalibration_min_attempts', '10', 'Minimum quiz_scores attempts for a qa_id before empirical time data overrides the LLM estimate'),
    ('descriptive_match_auto_score_threshold', '0.85', 'Trigram similarity score above which a descriptive answer is auto-scored from a precedent match (master answer or another student''s past scored response) without an LLM call'),
    ('qa_pool_min_size',            '30',   'Minimum qa rows per subject+topic+grade before usage-triggered replenishment is considered'),
    ('rest_countries_api_url',      '"https://api.worldbank.org/v2/country?format=json&per_page=300"', 'External source for the country_list background job (World Bank — free, no key; REST Countries deprecated its free tier)'),
    ('error_log_soft_delete_after_days', '90', 'Age in days after which error_logs rows are marked date_deleted by the purge-mark job'),
    ('error_log_purge_grace_days',  '30',   'Days after date_deleted before error_logs rows are physically deleted by the purge-delete job'),
    ('batch_request_types',         '{"country_list":{"interval_days":90},"qa_generation":{},"qa_verification":{},"qa_scoring":{},"qa_time_recalibration":{"interval_days":7},"error_log_purge_mark":{"interval_days":1},"error_log_purge_delete":{"interval_days":1}}', 'Valid batch_jobs.request_type values and their default run interval where applicable'),
    ('signup_verification_ttl_seconds', '60',  'Seconds before a signup email verification code expires'),
    ('signup_verification_max_attempts', '5',  'Max wrong-code attempts before the code is invalidated and a new one must be requested')
ON CONFLICT (setting_key) DO NOTHING;


-- ------------------------------------------------------------
-- 21. SIGNUP_VERIFICATIONS  (ephemeral — pending email verifs)
--
--   payload  : JSONB snapshot of the signup form so /verify can
--              create customer+user without a session store.
--   attempt_count : incremented on each wrong guess; locked out
--                   once it hits signup_verification_max_attempts.
--   expires_at    : NOW() + signup_verification_ttl_seconds at
--                   insert time.
--   No date_modified / is_active — rows are write-once after
--   creation except is_verified and attempt_count.
--   Cleanup: a background job or lazy prune on insert removes
--   rows where expires_at < NOW() - interval '1 day'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signup_verifications (
    verification_id   SERIAL          PRIMARY KEY,
    email_id          VARCHAR(200)    NOT NULL,
    code              VARCHAR(10)     NOT NULL,
    payload           JSONB           NOT NULL,
    attempt_count     SMALLINT        NOT NULL DEFAULT 0,
    expires_at        TIMESTAMP       NOT NULL,
    is_verified       BOOLEAN         NOT NULL DEFAULT FALSE,
    date_created      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_verif_email
    ON signup_verifications (email_id, is_verified, expires_at);

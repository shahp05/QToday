from datetime import datetime
from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import expression
from db.database import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    setting_key:    Mapped[str]           = mapped_column(String(100), primary_key=True)
    setting_value:  Mapped[dict|list|int|float|str] = mapped_column(JSONB, nullable=False)
    description:    Mapped[str|None]      = mapped_column(String(500))
    date_modified:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())


class Board(Base):
    __tablename__ = "boards"
    __table_args__ = (UniqueConstraint("board_code", "country_id"),)

    board_id:      Mapped[int]           = mapped_column(Integer, primary_key=True)
    board_code:    Mapped[str]           = mapped_column(String(20), nullable=False)
    board_name:    Mapped[str]           = mapped_column(String(200), nullable=False)
    country_id:    Mapped[int]           = mapped_column(ForeignKey("countries.country_id"), nullable=False)
    date_created:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    country:   Mapped["Country"]         = relationship(back_populates="boards")
    customers: Mapped[list["Customer"]]  = relationship(back_populates="board")
    students:  Mapped[list["Student"]]   = relationship(back_populates="board")


class Country(Base):
    __tablename__ = "countries"

    country_id:    Mapped[int]      = mapped_column(Integer, primary_key=True)
    country_code:  Mapped[str]      = mapped_column(String(3), nullable=False, unique=True)
    country_name:  Mapped[str]      = mapped_column(String(100), nullable=False)
    date_created:  Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]     = mapped_column(Boolean, nullable=False, default=True)

    boards:    Mapped[list["Board"]]    = relationship(back_populates="country")
    customers: Mapped[list["Customer"]] = relationship(back_populates="country")
    users:     Mapped[list["User"]]     = relationship(back_populates="country")
    subjects:  Mapped[list["Subject"]]  = relationship(back_populates="country")
    topics:    Mapped[list["Topic"]]    = relationship(back_populates="country")


class Grade(Base):
    __tablename__ = "grades"

    grade_id:      Mapped[int]      = mapped_column(Integer, primary_key=True)
    grade_name:    Mapped[int]      = mapped_column(SmallInteger, nullable=False, unique=True)
    date_created:  Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]     = mapped_column(Boolean, nullable=False, default=True)

    student_grades: Mapped[list["StudentGrade"]] = relationship(back_populates="grade")


class Customer(Base):
    __tablename__ = "customers"

    customer_id:       Mapped[int]           = mapped_column(Integer, primary_key=True)
    country_id:        Mapped[int]           = mapped_column(ForeignKey("countries.country_id"), nullable=False)
    board_id:          Mapped[int]           = mapped_column(ForeignKey("boards.board_id"), nullable=False)
    customer_name:     Mapped[str]           = mapped_column(String(200), nullable=False)
    customer_acronym:  Mapped[str]           = mapped_column(String(20), nullable=False, unique=True)
    customer_address:  Mapped[str | None]    = mapped_column(String(300))
    customer_city:     Mapped[str | None]    = mapped_column(String(100))
    customer_state:    Mapped[str | None]    = mapped_column(String(100))
    customer_zip:      Mapped[str | None]    = mapped_column(String(20))
    customer_gstn:     Mapped[str | None]    = mapped_column(String(20))
    customer_email:    Mapped[str | None]    = mapped_column(String(200))
    customer_phone:    Mapped[str | None]    = mapped_column(String(20))
    date_created:      Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified:     Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:      Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active:         Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    country:           Mapped["Country"]            = relationship(back_populates="customers")
    board:             Mapped["Board"]              = relationship(back_populates="customers")
    users:             Mapped[list["User"]]          = relationship(back_populates="customer")
    students:          Mapped[list["Student"]]       = relationship(back_populates="customer")
    parents:           Mapped[list["Parent"]]        = relationship(back_populates="customer")


class User(Base):
    """password_date_created == date_created means the password set at
    account creation has never been changed (both default to NOW() in the
    same INSERT, so Postgres resolves them to the same transaction
    timestamp). A password-change flow must bump password_date_created.

    email_id is unique only among parent accounts (see uidx_users_email_parent
    below) — a parent and an admin/teacher can share the same email address,
    since they are separate login identities (parents log in with their
    email as login_key; staff/students use org_id@acronym).

    is_sysadm / is_adm are read together with customer_id, which doubles as
    the scope selector — one admin account never manages more than one
    school, so there's no separate admin-roles join table:
      is_sysadm=True,  customer_id set  -> that school's owner/super admin
      is_adm=True,     customer_id set  -> that school's ordinary admin/teacher
      is_sysadm=True,  customer_id NULL -> platform-level system admin
      is_adm=True,     customer_id NULL -> reserved, unused for now"""

    __tablename__ = "users"
    __table_args__ = (
        Index("uidx_users_email_parent", "email_id",
              postgresql_where=expression.text("is_parent = true"), unique=True),
    )

    user_id:       Mapped[int]           = mapped_column(Integer, primary_key=True)
    login_key:     Mapped[str]           = mapped_column(String(200), nullable=False, unique=True)
    password_hash: Mapped[str]           = mapped_column(String(255), nullable=False)
    password_date_created: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    user_name:     Mapped[str]           = mapped_column(String(200), nullable=False)
    email_id:      Mapped[str | None]    = mapped_column(String(200))
    country_id:    Mapped[int | None]    = mapped_column(ForeignKey("countries.country_id"))
    customer_id:   Mapped[int | None]    = mapped_column(ForeignKey("customers.customer_id"))
    org_id:        Mapped[str | None]    = mapped_column(String(50))
    is_student:    Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    is_parent:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    is_sysadm:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    is_adm:        Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    file_url:      Mapped[str | None]    = mapped_column(String(500))
    date_created:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    country:         Mapped["Country | None"]    = relationship(back_populates="users")
    customer:        Mapped["Customer | None"]   = relationship(back_populates="users")
    student:         Mapped["Student | None"]    = relationship(back_populates="user", uselist=False)
    parent:          Mapped["Parent | None"]     = relationship(back_populates="user", uselist=False)


class Student(Base):
    __tablename__ = "students"

    student_id:    Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:       Mapped[int]           = mapped_column(ForeignKey("users.user_id"), nullable=False)
    customer_id:   Mapped[int | None]    = mapped_column(ForeignKey("customers.customer_id"))
    board_id:      Mapped[int]           = mapped_column(ForeignKey("boards.board_id"), nullable=False)
    date_created:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    user:           Mapped["User"]               = relationship(back_populates="student")
    customer:       Mapped["Customer | None"]    = relationship(back_populates="students")
    board:          Mapped["Board"]              = relationship(back_populates="students")
    student_grades: Mapped[list["StudentGrade"]] = relationship(back_populates="student")
    parents:        Mapped[list["Parent"]]       = relationship(back_populates="student")
    quizzes:        Mapped[list["Quiz"]]         = relationship(back_populates="student")


class StudentGrade(Base):
    __tablename__ = "student_grades"

    student_grade_id: Mapped[int]          = mapped_column(Integer, primary_key=True)
    student_id:       Mapped[int]          = mapped_column(ForeignKey("students.student_id"), nullable=False)
    grade_id:         Mapped[int]          = mapped_column(ForeignKey("grades.grade_id"), nullable=False)
    section:          Mapped[str | None]   = mapped_column(String(5))
    is_active:        Mapped[bool]         = mapped_column(Boolean, nullable=False, default=True)
    date_created:     Mapped[datetime]     = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified:    Mapped[datetime]     = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:     Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    student: Mapped["Student"] = relationship(back_populates="student_grades")
    grade:   Mapped["Grade"]   = relationship(back_populates="student_grades")


class Parent(Base):
    __tablename__ = "parents"

    parent_id:     Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:       Mapped[int]           = mapped_column(ForeignKey("users.user_id"), nullable=False)
    student_id:    Mapped[int]           = mapped_column(ForeignKey("students.student_id"), nullable=False)
    customer_id:   Mapped[int | None]    = mapped_column(ForeignKey("customers.customer_id"))
    date_created:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    user:     Mapped["User"]            = relationship(back_populates="parent")
    student:  Mapped["Student"]         = relationship(back_populates="parents")
    customer: Mapped["Customer | None"] = relationship(back_populates="parents")


class Subject(Base):
    __tablename__ = "subjects"
    __table_args__ = (
        Index("uidx_subjects_name_universal", "subject_name",
              postgresql_where=expression.text("country_id IS NULL"), unique=True),
        Index("uidx_subjects_name_country", "subject_name", "country_id",
              postgresql_where=expression.text("country_id IS NOT NULL"), unique=True),
    )

    subject_id:    Mapped[int]           = mapped_column(Integer, primary_key=True)
    subject_name:  Mapped[str]           = mapped_column(String(200), nullable=False)
    country_id:    Mapped[int|None]      = mapped_column(ForeignKey("countries.country_id"))
    is_verified:   Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    date_created:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    country:        Mapped["Country|None"]       = relationship(back_populates="subjects")
    subject_areas:  Mapped[list["SubjectArea"]]  = relationship(back_populates="subject")
    topics:         Mapped[list["Topic"]]        = relationship(back_populates="subject")
    qa:             Mapped[list["QA"]]           = relationship(back_populates="subject")
    quizzes:        Mapped[list["Quiz"]]         = relationship(back_populates="subject")


class SubjectArea(Base):
    """Sub-category within a subject — e.g. Calculus under Mathematics,
    Macroeconomics under Economics. Every subject gets a lazily-created
    "General" area as a fallback for topics that don't need finer
    categorization. No country_id — areas are universal concepts."""

    __tablename__ = "subject_areas"
    __table_args__ = (UniqueConstraint("subject_id", "area_name"),)

    subject_area_id: Mapped[int]           = mapped_column(Integer, primary_key=True)
    subject_id:      Mapped[int]           = mapped_column(ForeignKey("subjects.subject_id"), nullable=False)
    area_name:       Mapped[str]           = mapped_column(String(200), nullable=False)
    is_verified:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    date_created:    Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified:   Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:    Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    is_active:       Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    subject: Mapped["Subject"]      = relationship(back_populates="subject_areas")
    topics:  Mapped[list["Topic"]]  = relationship(back_populates="subject_area")


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        Index("uidx_topics_name_universal", "subject_area_id", "topic_name",
              postgresql_where=expression.text("country_id IS NULL"), unique=True),
        Index("uidx_topics_name_country", "subject_area_id", "topic_name", "country_id",
              postgresql_where=expression.text("country_id IS NOT NULL"), unique=True),
    )

    topic_id:         Mapped[int]           = mapped_column(Integer, primary_key=True)
    subject_id:       Mapped[int]           = mapped_column(ForeignKey("subjects.subject_id"), nullable=False)
    subject_area_id:  Mapped[int]           = mapped_column(ForeignKey("subject_areas.subject_area_id"), nullable=False)
    topic_name:       Mapped[str]           = mapped_column(String(200), nullable=False)
    country_id:       Mapped[int|None]      = mapped_column(ForeignKey("countries.country_id"))
    is_verified:      Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    date_created:     Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified:    Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:     Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    is_active:        Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    country:        Mapped["Country|None"]       = relationship(back_populates="topics")
    subject:        Mapped["Subject"]            = relationship(back_populates="topics")
    subject_area:   Mapped["SubjectArea"]        = relationship(back_populates="topics")
    qa:             Mapped[list["QA"]]           = relationship(back_populates="topic")
    quizzes:        Mapped[list["Quiz"]]         = relationship(back_populates="topic")


class QA(Base):
    __tablename__ = "qa"
    __table_args__ = (
        CheckConstraint(
            "question_type IN ('descriptive', 'mcq', 'true_false')",
            name="chk_question_type"
        ),
        CheckConstraint(
            "(question_type = 'mcq' AND options IS NOT NULL) OR "
            "(question_type != 'mcq' AND options IS NULL)",
            name="chk_options"
        ),
        CheckConstraint("difficulty_level BETWEEN 1 AND 5", name="chk_difficulty"),
        CheckConstraint(
            "flag_reason IS NULL OR flag_reason IN ('incorrect', 'unclear', 'irrelevant')",
            name="chk_flag_reason"
        ),
    )

    qa_id:            Mapped[int]           = mapped_column(Integer, primary_key=True)
    subject_id:       Mapped[int]           = mapped_column(ForeignKey("subjects.subject_id"), nullable=False)
    topic_id:         Mapped[int]           = mapped_column(ForeignKey("topics.topic_id"), nullable=False)
    grade_id:         Mapped[int]           = mapped_column(ForeignKey("grades.grade_id"), nullable=False)
    question_type:    Mapped[str]           = mapped_column(String(20), nullable=False)
    question:         Mapped[str]           = mapped_column(Text, nullable=False)
    answer:           Mapped[str]           = mapped_column(Text, nullable=False)
    # none_as_null: without it, a Python None serializes as a JSONB 'null'
    # value (not SQL NULL), which fails chk_options for non-mcq rows.
    options:          Mapped[dict|None]     = mapped_column(JSONB(none_as_null=True), nullable=True)
    difficulty_level: Mapped[int]           = mapped_column(SmallInteger, nullable=False, server_default=expression.literal(1))
    expected_time_seconds: Mapped[int|None] = mapped_column(Integer, nullable=True)
    is_verified:      Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    # Set when a teacher flags this QA as bad instead of editing it — paired
    # with is_active=False so the row drops out of future serving but stays
    # around for audit (why it was pulled), instead of a hard delete.
    flag_reason:      Mapped[str|None]      = mapped_column(String(20), nullable=True)
    # Denormalized attribution footnote for the last content edit — frozen
    # text at edit time (not a live join to users/customers), same reasoning
    # as a print footnote: it should read the same later even if the editor
    # is renamed or leaves the school.
    edited_by_name:   Mapped[str|None]      = mapped_column(String(200), nullable=True)
    edited_by_school: Mapped[str|None]      = mapped_column(String(20), nullable=True)
    date_created:     Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified:    Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:     Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    is_active:        Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    subject:         Mapped["Subject"]            = relationship(back_populates="qa")
    topic:           Mapped["Topic"]              = relationship(back_populates="qa")
    grade:           Mapped["Grade"]              = relationship(foreign_keys=[grade_id])
    quiz_scores:     Mapped[list["QuizScore"]]    = relationship(back_populates="qa")
    quiz_challenges: Mapped[list["QuizChallenge"]] = relationship(back_populates="qa")


class Quiz(Base):
    """student_id (not user_id) — the academic actor taking the quiz,
    not the login. date_scored is a cache
    written by the scoring-completion check once every QuizScore row for
    this quiz has is_scored=true — source of truth lives in QuizScore."""

    __tablename__ = "quizzes"

    quiz_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.subject_id"), nullable=False)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.topic_id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id"), nullable=False)
    date_created: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_scored: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    total_score: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    total_marks: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    total_time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_deleted: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    subject:     Mapped["Subject"]             = relationship(back_populates="quizzes")
    topic:       Mapped["Topic"]               = relationship(back_populates="quizzes")
    student:     Mapped["Student"]             = relationship(back_populates="quizzes")
    quiz_scores: Mapped[list["QuizScore"]]     = relationship(back_populates="quiz")
    challenges:  Mapped[list["QuizChallenge"]] = relationship(back_populates="quiz")


class QuizScore(Base):
    """question/answer/options/question_type are FROZEN COPIES of the qa
    row at quiz-creation time, not live references — if qa is corrected
    later, already-played quizzes must still reflect what the student
    actually saw and was scored against."""

    __tablename__ = "quiz_scores"
    __table_args__ = (UniqueConstraint("quiz_id", "qa_id"),)

    quiz_score_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.quiz_id"), nullable=False)
    qa_id: Mapped[int] = mapped_column(ForeignKey("qa.qa_id"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    student_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    marks: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    score: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_scored: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    date_created: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    quiz: Mapped["Quiz"] = relationship(back_populates="quiz_scores")
    qa:   Mapped["QA"]   = relationship(back_populates="quiz_scores")


class QuizChallenge(Base):
    """is_upheld: LLM's determination, NULL until resolved. date_closed
    doubles as the closed-flag (NULL=open, set=resolved) — no separate
    boolean needed. Auto-correction of qa.answer when upheld is deferred."""

    __tablename__ = "quiz_challenges"

    challenge_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.quiz_id"), nullable=False)
    qa_id: Mapped[int] = mapped_column(ForeignKey("qa.qa_id"), nullable=False)
    challenge_reason: Mapped[str] = mapped_column(Text, nullable=False)
    challenge_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_upheld: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    date_created: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_closed: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    date_deleted: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    quiz: Mapped["Quiz"] = relationship(back_populates="challenges")
    qa:   Mapped["QA"]   = relationship(back_populates="quiz_challenges")


class TeachLog(Base):
    __tablename__ = "teach_logs"

    teach_log_id:  Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_id:       Mapped[int]           = mapped_column(ForeignKey("users.user_id"), nullable=False)
    customer_id:   Mapped[int]           = mapped_column(ForeignKey("customers.customer_id"), nullable=False)
    subject_id:    Mapped[int]           = mapped_column(ForeignKey("subjects.subject_id"), nullable=False)
    topic_id:      Mapped[int]           = mapped_column(ForeignKey("topics.topic_id"), nullable=False)
    grade_id:      Mapped[int]           = mapped_column(ForeignKey("grades.grade_id"), nullable=False)
    section:       Mapped[str|None]      = mapped_column(String(5))
    date_created:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_modified: Mapped[datetime]      = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted:  Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)

    user:     Mapped["User"]    = relationship(foreign_keys=[user_id])
    customer: Mapped["Customer"] = relationship(foreign_keys=[customer_id])
    subject:  Mapped["Subject"] = relationship(foreign_keys=[subject_id])
    topic:    Mapped["Topic"]   = relationship(foreign_keys=[topic_id])
    grade:    Mapped["Grade"]   = relationship(foreign_keys=[grade_id])


class BatchJob(Base):
    """Generic background-job tracker — covers true LLM batch jobs and
    simple scheduled tasks alike.

    NOTE: is_active here does NOT mean "not soft-deleted" like every other
    table — it means "still a live/successful run":
      is_active=True,  is_closed=False -> currently running
      is_active=True,  is_closed=True  -> completed successfully
      is_active=False, is_closed=False -> failed before completing
    "Last successful run" query:
      WHERE request_type = ? AND is_active = True AND is_closed = True
      ORDER BY date_created DESC LIMIT 1

    No date_modified/date_deleted — rows are write-once after creation
    except for the is_active/is_closed flags themselves.
    request_type is validated against app_settings.batch_request_types
    at the application layer, not DB-enforced.
    """

    __tablename__ = "batch_jobs"

    batch_job_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    custom_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    file_ids: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    country_id: Mapped[int | None] = mapped_column(ForeignKey("countries.country_id"), nullable=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.subject_id"), nullable=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.topic_id"), nullable=True)
    qa_id: Mapped[int | None] = mapped_column(ForeignKey("qa.qa_id"), nullable=True)
    quiz_id: Mapped[int | None] = mapped_column(ForeignKey("quizzes.quiz_id"), nullable=True)
    challenge_id: Mapped[int | None] = mapped_column(ForeignKey("quiz_challenges.challenge_id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    date_created: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class ErrorLog(Base):
    """type is a fixed CHECK-constrained set (api/batch/frontend) — unlike
    batch_jobs.request_type, a new source category means new integration
    code anyway, so DB-level enforcement is appropriate here.

    error_code is validated against the shared registry in
    error_codes.json (backend/errors/error_codes.py) at the application
    layer, not DB-enforced — keeps logging a single fast INSERT.

    date_deleted is a two-phase purge marker: a background job marks rows
    past the retention window, a second pass physically deletes them after
    a grace period (see app_settings: error_log_soft_delete_after_days,
    error_log_purge_grace_days)."""

    __tablename__ = "error_logs"
    __table_args__ = (CheckConstraint("type IN ('api', 'batch', 'frontend')", name="chk_error_log_type"),)

    error_log_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    error_code: Mapped[str] = mapped_column(String(50), nullable=False)
    err_description: Mapped[str] = mapped_column(Text, nullable=False)
    stack_trace: Mapped[str | None] = mapped_column(Text, nullable=True)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    date_created: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    date_deleted: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Indexes (defined here so Alembic autogenerate tracks them)
# ---------------------------------------------------------------------------
Index("idx_users_customer",         User.customer_id)
Index("idx_users_org",              User.customer_id, User.org_id)
Index("idx_students_user",          Student.user_id)
Index("idx_students_customer",      Student.customer_id)
Index("idx_student_grades_student", StudentGrade.student_id)
Index("idx_student_grades_active",  StudentGrade.student_id, StudentGrade.is_active)
Index("idx_parents_student",        Parent.student_id)
Index("idx_topics_subject",         Topic.subject_id)
Index("idx_topics_subject_area",    Topic.subject_area_id)
Index("idx_subject_areas_subject",  SubjectArea.subject_id)
Index("idx_subjects_country",       Subject.country_id)
Index("idx_topics_country",         Topic.country_id)
Index("idx_qa_subject_topic",       QA.subject_id, QA.topic_id)
Index("idx_qa_grade",               QA.grade_id)
Index("idx_qa_type",                QA.question_type)
Index("idx_qa_verified",            QA.is_verified)
Index("idx_quizzes_student",        Quiz.student_id)
Index("idx_quizzes_topic",          Quiz.topic_id)
Index("idx_quiz_scores_quiz",       QuizScore.quiz_id)
Index("idx_quiz_scores_qa",         QuizScore.qa_id)
Index("idx_quiz_challenges_quiz",   QuizChallenge.quiz_id)
Index("idx_quiz_challenges_qa",     QuizChallenge.qa_id)
Index("idx_batch_jobs_country",     BatchJob.country_id)
Index("idx_batch_jobs_subject",     BatchJob.subject_id)
Index("idx_batch_jobs_topic",       BatchJob.topic_id)
Index("idx_batch_jobs_lookup",      BatchJob.request_type, BatchJob.is_active, BatchJob.is_closed, BatchJob.date_created)
Index("idx_error_logs_type",        ErrorLog.type)
Index("idx_error_logs_code",        ErrorLog.error_code)
Index("idx_error_logs_user",        ErrorLog.user_id)
Index("idx_error_logs_created",     ErrorLog.date_created)
Index("idx_error_logs_correlation", ErrorLog.correlation_id)
Index("idx_teach_logs_user",        TeachLog.user_id)
Index("idx_teach_logs_user_date",   TeachLog.user_id, TeachLog.date_created)
Index("idx_teach_logs_grade",       TeachLog.customer_id, TeachLog.grade_id, TeachLog.section)
Index("idx_teach_logs_topic",       TeachLog.customer_id, TeachLog.subject_id, TeachLog.topic_id)

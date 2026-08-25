from typing import Optional

from pydantic import BaseModel


class QuizAnswer(BaseModel):
    qa_id: int
    # None/omitted means the student never answered this question — still
    # submitted so it can be scored 0 and counted toward total_marks.
    student_response: Optional[str] = None
    time_taken_seconds: Optional[int] = None


class SubmitQuizRequest(BaseModel):
    topic_id: int
    grade_id: int
    answers: list[QuizAnswer]
    total_time_taken_seconds: Optional[int] = None


class SubmitQuizResponse(BaseModel):
    quiz_id: int
    total_marks: float
    # None while any question is still awaiting LLM evaluation.
    total_score: Optional[float] = None
    is_scored: bool
    pending_count: int


class QuizStatusResponse(BaseModel):
    quiz_id: int
    topic_id: int
    total_marks: float
    total_score: Optional[float] = None
    is_scored: bool
    pending_count: int


class QuizHistoryItem(BaseModel):
    quiz_id: int
    subject_id: int
    subject_name: str
    topic_id: int
    topic_name: str
    # grades.grade_name is a bare SMALLINT (1-12) — no section letter.
    grade_name: Optional[int] = None
    date_created: str
    total_marks: float
    total_score: Optional[float] = None
    is_scored: bool


class QuizHistoryResponse(BaseModel):
    quizzes: list[QuizHistoryItem]


class QuizDetailQuestion(BaseModel):
    qa_id: int
    question_type: str
    question: str
    options: Optional[dict] = None
    answer: str
    student_response: Optional[str] = None
    marks: float
    score: Optional[float] = None
    is_scored: bool
    # challenge_reason is set as soon as a challenge is submitted;
    # challenge_response stays None until the LLM re-grade resolves (either
    # synchronously or via the periodic sweep) — that gap is the "awaiting
    # response" state the UI shows. Hides the challenge button once
    # challenge_reason is present, without a separate lookup.
    challenge_reason: Optional[str] = None
    challenge_response: Optional[str] = None
    # Informational only — how long the student actually took vs. the
    # question's expected time. Neither affects scoring.
    time_taken_seconds: Optional[int] = None
    expected_time_seconds: Optional[int] = None


class QuizDetailResponse(BaseModel):
    quiz_id: int
    subject_id: int
    topic_id: int
    # grades.grade_name is a bare SMALLINT (1-12) — no section letter.
    grade_name: Optional[int] = None
    date_created: str
    total_marks: float
    total_score: Optional[float] = None
    questions: list[QuizDetailQuestion]


class ChallengeQuizQuestionRequest(BaseModel):
    reason: str


class ChallengeQuizQuestionResponse(BaseModel):
    challenge_id: int
    date_created: str
    challenge_reason: str
    # None while the challenge is still pending — the real-time LLM call
    # failed or was unavailable, and the periodic sweep
    # (resolve_pending_challenges) hasn't retried it yet.
    challenge_response: Optional[str] = None
    score: float
    marks: float
    answer: str
    total_score: float
    total_marks: float

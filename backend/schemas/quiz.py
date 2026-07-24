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
    # Whether this student already has an open/resolved challenge on this
    # question for this quiz — lets the UI hide the challenge button/form
    # once one exists, without needing a separate lookup.
    challenged: bool = False


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

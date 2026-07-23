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

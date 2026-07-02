from typing import Any, Optional

from pydantic import BaseModel


class QARequest(BaseModel):
    subject_name: str
    topic_name: str
    grade: int
    section: Optional[str] = None


class QAItem(BaseModel):
    qa_id: int
    question_type: str
    question: str
    answer: str
    options: Optional[dict[str, Any]] = None
    difficulty_level: int
    is_verified: bool


class QAResponse(BaseModel):
    items: list[QAItem]
    warning: Optional[str] = None

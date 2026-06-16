from typing import Any, Optional

from pydantic import BaseModel, model_validator


class QARequest(BaseModel):
    subject_name: str
    topic_name: str
    grade: int
    # TODO: source user_country_id/student_id/customer_id from the authenticated
    # session once auth middleware exists, instead of accepting them in the request.
    user_country_id: int
    student_id: Optional[int] = None
    customer_id: Optional[int] = None

    @model_validator(mode="after")
    def _exactly_one_owner(self):
        if (self.student_id is None) == (self.customer_id is None):
            raise ValueError("Exactly one of student_id or customer_id must be provided")
        return self


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

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, model_validator


class QARequest(BaseModel):
    subject_name: str
    topic_name: str
    grade: int
    section: Optional[str] = None
    # Backdates the teach_logs entry to a specific day (e.g. logging a
    # lesson from an earlier date via the calendar) instead of today.
    log_date: Optional[date] = None


class QAItem(BaseModel):
    qa_id: int
    question_type: str
    question: str
    answer: str
    options: Optional[dict[str, Any]] = None
    difficulty_level: int
    is_verified: bool
    edited_by_name: Optional[str] = None
    edited_by_school: Optional[str] = None


class QAResponse(BaseModel):
    items: list[QAItem]
    warning: Optional[str] = None
    # Lets the frontend jump straight to this subject/topic/grade in the
    # Subjects Taught list after generating, instead of rendering a separate
    # inline QA display.
    subject_id: int
    topic_id: int
    grade_id: int


class QAUpdateRequest(BaseModel):
    """Either a content correction (question/answer/options) or a flag —
    never both in the same request, since they mean different things:
    a correction keeps the item in circulation and marks it verified;
    a flag pulls it out of circulation instead."""
    question: Optional[str] = None
    answer: Optional[str] = None
    options: Optional[dict[str, Any]] = None
    flag_reason: Optional[Literal["incorrect", "unclear", "irrelevant"]] = None

    @model_validator(mode="after")
    def _exactly_one_kind_of_update(self):
        has_content_edit = self.question is not None or self.answer is not None or self.options is not None
        if self.flag_reason is not None and has_content_edit:
            raise ValueError("flag_reason cannot be combined with question/answer/options edits")
        if self.flag_reason is None and not has_content_edit:
            raise ValueError("Provide at least one of question/answer/options, or flag_reason")
        return self

from pydantic import BaseModel


class StudentUploadRow(BaseModel):
    org_id: str
    name: str
    grade: int
    section: str | None = None
    parent1_email: str | None = None
    parent2_email: str | None = None


class StudentsUploadRequest(BaseModel):
    students: list[StudentUploadRow]
    # Which session this roster is for — omitted/None means "the current
    # session" (the ordinary case). Only ever set explicitly when the
    # dual-session upload selector is shown (a future session is pending),
    # letting an admin pre-stage next year's roster without touching the
    # live current one. Validated server-side against the caller's actual
    # current/future session ids — see students_upload_service._resolve_target_session.
    session_id: int | None = None

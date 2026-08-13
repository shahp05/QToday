from pydantic import BaseModel


class TeacherUploadRow(BaseModel):
    org_id: str
    name: str
    email: str


class TeachersUploadRequest(BaseModel):
    teachers: list[TeacherUploadRow]
    # None (the ordinary case) uploads into the live current roster.
    # Explicitly passing the customer's pending future session's id stages
    # new hires who start then — validated as current/future only (never
    # past) by validate_session_target, same gate students/upload uses.
    session_id: int | None = None


class SetSuperAdminRequest(BaseModel):
    is_super_admin: bool

from pydantic import BaseModel


class TeacherUploadRow(BaseModel):
    org_id: str
    name: str
    email: str


class TeachersUploadRequest(BaseModel):
    teachers: list[TeacherUploadRow]

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

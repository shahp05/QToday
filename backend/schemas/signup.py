from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    email_id: str
    user_name: str
    customer_name: str
    customer_acronym: str
    org_id: str
    board_name: str
    country_code: str


class VerifyRequest(BaseModel):
    email_id: str
    code: str

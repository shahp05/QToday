from pydantic import BaseModel


class LoginRequest(BaseModel):
    login_key: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str

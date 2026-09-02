from pydantic import BaseModel


class LoginRequest(BaseModel):
    login_key: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str


class LoginKeyRequest(BaseModel):
    login_key: str


class VerifyResetCodeRequest(BaseModel):
    login_key: str
    code: str

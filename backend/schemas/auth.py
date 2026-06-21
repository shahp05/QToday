from pydantic import BaseModel


class LoginRequest(BaseModel):
    login_key: str
    password: str

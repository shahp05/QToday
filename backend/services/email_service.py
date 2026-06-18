import os

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

APP_NAME = "QuestionsToday"


def _mail_config() -> ConnectionConfig:
    return ConnectionConfig(
        MAIL_USERNAME=os.getenv("MAIL_USERNAME", ""),
        MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", ""),
        MAIL_FROM=os.getenv("MAIL_FROM", "noreply@qtoday.app"),
        MAIL_FROM_NAME=APP_NAME,
        MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
        MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
        MAIL_STARTTLS=os.getenv("MAIL_STARTTLS", "True").lower() == "true",
        MAIL_SSL_TLS=os.getenv("MAIL_SSL_TLS", "False").lower() == "true",
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


async def send_verification_code(email: str, code: str, ttl_seconds: int) -> None:
    """Send a sign-up verification code to the given address."""
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#0F8911;margin-bottom:8px">{APP_NAME} — Verify your email</h2>
      <p style="color:#343434;margin-bottom:24px">
        Use the code below to complete your {APP_NAME} sign-up. It expires in
        <strong>{ttl_seconds} seconds</strong>.
      </p>
      <div style="background:#f2f4f7;border-radius:10px;padding:24px;text-align:center">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0F8911">{code}</span>
      </div>
      <p style="color:#999;font-size:12px;margin-top:24px">
        If you did not request this from {APP_NAME}, you can safely ignore this email.
      </p>
    </div>
    """
    message = MessageSchema(
        subject=f"Your {APP_NAME} verification code",
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )
    await FastMail(_mail_config()).send_message(message)

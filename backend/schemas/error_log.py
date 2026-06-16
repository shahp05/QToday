from typing import Any, Optional

from pydantic import BaseModel

from errors.error_codes import ErrorCode


class ErrorLogRequest(BaseModel):
    """For frontend-reported errors — POST /api/error-logs. type is always
    "frontend" here; api/batch errors are logged directly via log_error()
    from backend code, never through this endpoint."""

    error_code: ErrorCode
    description: Optional[str] = None
    stack_trace: Optional[str] = None
    context: Optional[dict[str, Any]] = None
    correlation_id: Optional[str] = None


class ErrorLogResponse(BaseModel):
    error_log_id: int
    status: str = "logged"

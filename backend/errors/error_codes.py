# AUTO-GENERATED from error_codes.json by scripts/generate_error_codes.py — do not edit directly.
from enum import Enum


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    SUBJECT_TOPIC_INVALID = "SUBJECT_TOPIC_INVALID"
    GRADE_INVALID = "GRADE_INVALID"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_GENERATION_FAILED = "LLM_GENERATION_FAILED"
    LLM_INVALID_RESPONSE = "LLM_INVALID_RESPONSE"
    DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED"
    DB_CONSTRAINT_VIOLATION = "DB_CONSTRAINT_VIOLATION"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    AUTH_FORBIDDEN = "AUTH_FORBIDDEN"
    QUIZ_NOT_FOUND = "QUIZ_NOT_FOUND"
    QA_NOT_FOUND = "QA_NOT_FOUND"
    EXTERNAL_SERVICE_FAILED = "EXTERNAL_SERVICE_FAILED"
    BATCH_JOB_FAILED = "BATCH_JOB_FAILED"
    FRONTEND_RUNTIME_ERROR = "FRONTEND_RUNTIME_ERROR"
    FRONTEND_NETWORK_ERROR = "FRONTEND_NETWORK_ERROR"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


ERROR_DEFAULTS = {
    ErrorCode.VALIDATION_ERROR: {"message": "The submitted data failed validation.", "http_status": 400},
    ErrorCode.SUBJECT_TOPIC_INVALID: {"message": "This subject/topic combination could not be verified.", "http_status": 422},
    ErrorCode.GRADE_INVALID: {"message": "The grade provided is not valid.", "http_status": 400},
    ErrorCode.LLM_TIMEOUT: {"message": "The AI service did not respond in time. Please try again.", "http_status": 504},
    ErrorCode.LLM_GENERATION_FAILED: {"message": "Question generation failed. Please try again.", "http_status": 502},
    ErrorCode.LLM_INVALID_RESPONSE: {"message": "The AI service returned an unexpected response.", "http_status": 502},
    ErrorCode.DB_CONNECTION_FAILED: {"message": "A database connection error occurred.", "http_status": 500},
    ErrorCode.DB_CONSTRAINT_VIOLATION: {"message": "The requested change conflicts with existing data.", "http_status": 409},
    ErrorCode.AUTH_REQUIRED: {"message": "You must be signed in to do this.", "http_status": 401},
    ErrorCode.AUTH_FORBIDDEN: {"message": "You do not have permission to do this.", "http_status": 403},
    ErrorCode.QUIZ_NOT_FOUND: {"message": "This quiz could not be found.", "http_status": 404},
    ErrorCode.QA_NOT_FOUND: {"message": "This question could not be found.", "http_status": 404},
    ErrorCode.EXTERNAL_SERVICE_FAILED: {"message": "An external service failed to respond correctly.", "http_status": 502},
    ErrorCode.BATCH_JOB_FAILED: {"message": "A background job failed to complete.", "http_status": 500},
    ErrorCode.FRONTEND_RUNTIME_ERROR: {"message": "Something went wrong on the page. Please refresh and try again.", "http_status": 500},
    ErrorCode.FRONTEND_NETWORK_ERROR: {"message": "Could not reach the server. Please check your connection.", "http_status": 503},
    ErrorCode.UNKNOWN_ERROR: {"message": "An unexpected error occurred.", "http_status": 500},
}

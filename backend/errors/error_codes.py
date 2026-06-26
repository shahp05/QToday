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
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_INACTIVE = "ACCOUNT_INACTIVE"
    SCHOOL_NOT_ASSOCIATED = "SCHOOL_NOT_ASSOCIATED"
    NO_PENDING_VERIFICATION = "NO_PENDING_VERIFICATION"
    VERIFICATION_CODE_EXPIRED = "VERIFICATION_CODE_EXPIRED"
    TOO_MANY_ATTEMPTS = "TOO_MANY_ATTEMPTS"
    INCORRECT_CODE = "INCORRECT_CODE"
    UNKNOWN_COUNTRY_CODE = "UNKNOWN_COUNTRY_CODE"
    QUIZ_NOT_FOUND = "QUIZ_NOT_FOUND"
    QA_NOT_FOUND = "QA_NOT_FOUND"
    DUPLICATE_ID = "DUPLICATE_ID"
    XLSX_FORMAT_INVALID = "XLSX_FORMAT_INVALID"
    XLSX_VALUE_MISSING = "XLSX_VALUE_MISSING"
    XLSX_FILE_TYPE_INVALID = "XLSX_FILE_TYPE_INVALID"
    EMAIL_ALREADY_USED = "EMAIL_ALREADY_USED"
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
    ErrorCode.INVALID_CREDENTIALS: {"message": "Incorrect login ID or password.", "http_status": 401},
    ErrorCode.ACCOUNT_INACTIVE: {"message": "This account is no longer active.", "http_status": 401},
    ErrorCode.SCHOOL_NOT_ASSOCIATED: {"message": "No school is associated with this account.", "http_status": 400},
    ErrorCode.NO_PENDING_VERIFICATION: {"message": "No pending verification found for this email.", "http_status": 400},
    ErrorCode.VERIFICATION_CODE_EXPIRED: {"message": "Your code has expired. Request a new one.", "http_status": 410},
    ErrorCode.TOO_MANY_ATTEMPTS: {"message": "Too many incorrect attempts. Please request a new code.", "http_status": 400},
    ErrorCode.INCORRECT_CODE: {"message": "Incorrect code. {remaining} attempt(s) remaining.", "http_status": 400},
    ErrorCode.UNKNOWN_COUNTRY_CODE: {"message": "Unknown country code: {code}", "http_status": 400},
    ErrorCode.QUIZ_NOT_FOUND: {"message": "This quiz could not be found.", "http_status": 404},
    ErrorCode.QA_NOT_FOUND: {"message": "This question could not be found.", "http_status": 404},
    ErrorCode.DUPLICATE_ID: {"message": "{id} already in use. Check all ids.", "http_status": 400},
    ErrorCode.XLSX_FORMAT_INVALID: {"message": "Incorrect xlsx format. Check column headings and values.", "http_status": 400},
    ErrorCode.XLSX_VALUE_MISSING: {"message": "Id, name and {field} must be entered.", "http_status": 400},
    ErrorCode.XLSX_FILE_TYPE_INVALID: {"message": "Please upload an .xlsx file.", "http_status": 400},
    ErrorCode.EMAIL_ALREADY_USED: {"message": "{email} is already used by another teacher.", "http_status": 400},
    ErrorCode.EXTERNAL_SERVICE_FAILED: {"message": "An external service failed to respond correctly.", "http_status": 502},
    ErrorCode.BATCH_JOB_FAILED: {"message": "A background job failed to complete.", "http_status": 500},
    ErrorCode.FRONTEND_RUNTIME_ERROR: {"message": "Something went wrong on the page. Please refresh and try again.", "http_status": 500},
    ErrorCode.FRONTEND_NETWORK_ERROR: {"message": "Could not reach the server. Please check your connection.", "http_status": 503},
    ErrorCode.UNKNOWN_ERROR: {"message": "An unexpected error occurred.", "http_status": 500},
}

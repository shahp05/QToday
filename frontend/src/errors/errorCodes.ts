// AUTO-GENERATED from error_codes.json by scripts/generate_error_codes.py — do not edit directly.

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  SUBJECT_TOPIC_INVALID: "SUBJECT_TOPIC_INVALID",
  GRADE_INVALID: "GRADE_INVALID",
  LLM_TIMEOUT: "LLM_TIMEOUT",
  LLM_GENERATION_FAILED: "LLM_GENERATION_FAILED",
  LLM_INVALID_RESPONSE: "LLM_INVALID_RESPONSE",
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  DB_CONSTRAINT_VIOLATION: "DB_CONSTRAINT_VIOLATION",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  QUIZ_NOT_FOUND: "QUIZ_NOT_FOUND",
  QA_NOT_FOUND: "QA_NOT_FOUND",
  EXTERNAL_SERVICE_FAILED: "EXTERNAL_SERVICE_FAILED",
  BATCH_JOB_FAILED: "BATCH_JOB_FAILED",
  FRONTEND_RUNTIME_ERROR: "FRONTEND_RUNTIME_ERROR",
  FRONTEND_NETWORK_ERROR: "FRONTEND_NETWORK_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDefault {
  message: string;
  httpStatus: number;
}

export const ERROR_DEFAULTS: Record<ErrorCodeValue, ErrorDefault> = {
  VALIDATION_ERROR: { message: "The submitted data failed validation.", httpStatus: 400 },
  SUBJECT_TOPIC_INVALID: { message: "This subject/topic combination could not be verified.", httpStatus: 422 },
  GRADE_INVALID: { message: "The grade provided is not valid.", httpStatus: 400 },
  LLM_TIMEOUT: { message: "The AI service did not respond in time. Please try again.", httpStatus: 504 },
  LLM_GENERATION_FAILED: { message: "Question generation failed. Please try again.", httpStatus: 502 },
  LLM_INVALID_RESPONSE: { message: "The AI service returned an unexpected response.", httpStatus: 502 },
  DB_CONNECTION_FAILED: { message: "A database connection error occurred.", httpStatus: 500 },
  DB_CONSTRAINT_VIOLATION: { message: "The requested change conflicts with existing data.", httpStatus: 409 },
  AUTH_REQUIRED: { message: "You must be signed in to do this.", httpStatus: 401 },
  AUTH_FORBIDDEN: { message: "You do not have permission to do this.", httpStatus: 403 },
  QUIZ_NOT_FOUND: { message: "This quiz could not be found.", httpStatus: 404 },
  QA_NOT_FOUND: { message: "This question could not be found.", httpStatus: 404 },
  EXTERNAL_SERVICE_FAILED: { message: "An external service failed to respond correctly.", httpStatus: 502 },
  BATCH_JOB_FAILED: { message: "A background job failed to complete.", httpStatus: 500 },
  FRONTEND_RUNTIME_ERROR: { message: "Something went wrong on the page. Please refresh and try again.", httpStatus: 500 },
  FRONTEND_NETWORK_ERROR: { message: "Could not reach the server. Please check your connection.", httpStatus: 503 },
  UNKNOWN_ERROR: { message: "An unexpected error occurred.", httpStatus: 500 },
};

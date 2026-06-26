from .error_codes import ErrorCode


class AppError(Exception):
    """Raise this for any expected, user-facing error instead of a
    hardcoded message string. The error_code is resolved to its message
    and http_status from ERROR_DEFAULTS by the handler in main.py, and to
    the same message on the frontend via errors/errorCodes.ts — the two
    are generated from the same error_codes.json, so neither side ever
    hardcodes the wording. context carries values for {placeholder}
    interpolation in that message (e.g. the offending id) — never put
    display text itself in context."""

    def __init__(self, error_code: ErrorCode, context: dict | None = None):
        self.error_code = error_code
        self.context = context or {}
        super().__init__(error_code.value)

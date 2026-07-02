import jobs.app  # noqa: F401 — sets the Windows-compatible asyncio event loop
                 # policy (SelectorEventLoop) before uvicorn creates its loop;
                 # psycopg3 async mode can't use Windows' default ProactorEventLoop.
import traceback

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from db.database import SessionLocal, get_db
from errors.app_error import AppError
from errors.error_codes import ErrorCode, ERROR_DEFAULTS
from routers import auth, countries, error_logs, qa, signup, students, teach_logs, teachers
from services.error_log_service import log_error

app = FastAPI(title="QToday API")

app.add_middleware(
    CORSMiddleware,
    # Vite falls back to another port when 5173 is taken (e.g. a second dev
    # server/preview instance already running) — allow any localhost port
    # in dev rather than hardcoding one.
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qa.router)
app.include_router(error_logs.router)
app.include_router(signup.router)
app.include_router(countries.router)
app.include_router(auth.router)
app.include_router(students.router)
app.include_router(teachers.router)
app.include_router(teach_logs.router)


@app.exception_handler(Exception)
async def log_unhandled_exceptions(request: Request, exc: Exception):
    """Global safety net — any exception a route handler doesn't catch and
    log explicitly still ends up in error_logs, with type="api". Handlers
    can still call log_error() directly for expected/handled error
    conditions with more specific codes and context.

    This handler runs inside ServerErrorMiddleware, which is OUTSIDE the
    CORSMiddleware layer, so we must add the CORS header manually to avoid
    browsers receiving a cross-origin response with no Allow-Origin header
    (which the Fetch API surfaces as a TypeError: Failed to fetch)."""
    db = SessionLocal()
    try:
        log_error(
            db,
            type="api",
            error_code=ErrorCode.UNKNOWN_ERROR,
            description=str(exc),
            stack_trace=traceback.format_exc(),
            context={"path": str(request.url.path), "method": request.method},
        )
    except Exception:
        pass
    finally:
        db.close()
    origin = request.headers.get("origin", "")
    headers = {"Access-Control-Allow-Origin": origin} if origin else {}
    return JSONResponse(
        status_code=500,
        content={"error_code": ErrorCode.UNKNOWN_ERROR.value, "context": {}},
        headers=headers,
    )


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    """Expected, user-facing errors raised via AppError carry only an
    ErrorCode + context — never a hardcoded message — so the response
    body matches exactly what the frontend resolves via errorCodes.ts.
    Unlike the bare-Exception handler above, this isn't a system failure,
    so it's intentionally not logged to error_logs (expected validation/
    auth rejections, not bugs)."""
    defaults = ERROR_DEFAULTS[exc.error_code]
    return JSONResponse(
        status_code=defaults["http_status"],
        content={"error_code": exc.error_code.value, "context": exc.context},
    )


@app.get("/")
def root():
    return {"status": "ok", "app": "QToday"}


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "connected"}

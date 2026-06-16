"""
Single Procrastinate App instance, shared by every task — this is what
gives the "same code path, triggered by API or by schedule" guarantee.
Tasks are registered against this app (jobs/tasks.py), and BOTH an API
request handler (.defer_async()) and a periodic scheduler (@app.periodic)
dispatch to the exact same task function.

Uses the same Postgres DB as the rest of the app (Neon) as the queue —
no Redis, no separate broker. PsycopgConnector is async, matching our
async FastAPI/qa_service style.
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from procrastinate import App, PsycopgConnector

# Windows defaults to ProactorEventLoop, which psycopg3's async mode
# cannot use. Anything that imports this module (main.py, the worker
# entrypoint, scripts) gets the compatible policy applied automatically.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv(Path(__file__).parent.parent / ".env")

app = App(connector=PsycopgConnector(conninfo=os.environ["DATABASE_URL"]))

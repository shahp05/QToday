"""
Run the Procrastinate worker — picks up deferred/scheduled jobs from the
Postgres queue and executes them. This is the one persistent process that
needs to run continuously (alongside the FastAPI server, as a separate
process/service), regardless of which trigger (API or periodic schedule)
queued the job.

Usage:
    python worker.py
"""
import asyncio

import jobs.app  # noqa: F401 — sets the Windows-compatible event loop policy
import jobs.tasks  # noqa: F401 — registers all tasks with the app
from jobs.app import app


async def main():
    async with app.open_async():
        await app.run_worker_async(queues=None, listen_notify=True)


if __name__ == "__main__":
    asyncio.run(main())

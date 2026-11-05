"""Request-bound, content-free progress events for authenticated API streams."""
import asyncio
from contextvars import ContextVar
import json
import logging
from typing import Callable

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute

from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound

logger = logging.getLogger(__name__)
_sink: ContextVar[Callable[[dict], None] | None] = ContextVar("processing_sink", default=None)


def report_stage(label: str, *, current: int | None = None, total: int | None = None):
    sink = _sink.get()
    if sink:
        sink({"kind": "stage", "label": label, "current": current, "total": total})


def report_activity(active: bool):
    sink = _sink.get()
    if sink:
        sink({"kind": "activity", "active": active})


def _error(exc):
    if isinstance(exc, HTTPException):
        return exc.status_code, exc.detail if isinstance(exc.detail, str) else "Request validation failed."
    if isinstance(exc, RequestValidationError):
        return 422, "; ".join(f"{'.'.join(map(str, error['loc'][1:]))}: {error['msg']}" for error in exc.errors())
    if isinstance(exc, DependencyUnavailable):
        return (502 if isinstance(exc, InvalidDependencyResponse) else 503), str(exc)
    if isinstance(exc, ConcurrentUpdate):
        return 409, str(exc)
    if isinstance(exc, WorkflowNotFound):
        return 404, str(exc)
    logger.error("Streamed operation failed (%s); request and exception content withheld.", type(exc).__name__)
    return 500, "An internal error occurred. Reload saved state before retrying."


class ProcessingRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def wrapped(request):
            path = request.url.path
            supported = (path in ("/api/v1/intake", "/api/v1/intake/document-preview", "/api/v1/chat") or
                         path.startswith("/api/v1/analyze/") or
                         (path.startswith("/api/v1/engagements/") and path.endswith("/synthesis")))
            if request.headers.get("accept") != "application/x-ndjson" or request.method != "POST" or not supported:
                return await handler(request)
            # Cache the POST body before Starlette starts its concurrent disconnect listener.
            await request.body()

            async def events():
                queue = asyncio.Queue()
                loop = asyncio.get_running_loop()

                async def execute():
                    token = _sink.set(lambda event: loop.call_soon_threadsafe(queue.put_nowait, event))
                    try:
                        response = await handler(request)
                        if response.status_code >= 400:
                            data = json.loads(response.body)
                            queue.put_nowait({"kind": "error", "status": response.status_code,
                                              "detail": data.get("detail", "Request failed.")})
                        else:
                            queue.put_nowait({"kind": "result", "data": json.loads(response.body)})
                    except Exception as exc:
                        status, detail = _error(exc)
                        queue.put_nowait({"kind": "error", "status": status, "detail": detail})
                    finally:
                        _sink.reset(token)

                task = asyncio.create_task(execute())
                try:
                    yield json.dumps({"kind": "stage", "label": "Request accepted"}) + "\n"
                    while True:
                        try:
                            event = await asyncio.wait_for(queue.get(), timeout=10)
                        except asyncio.TimeoutError:
                            yield json.dumps({"kind": "heartbeat"}) + "\n"
                            continue
                        yield json.dumps(event, ensure_ascii=True) + "\n"
                        if event["kind"] in ("result", "error"):
                            break
                finally:
                    if not task.done():
                        task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            return StreamingResponse(events(), media_type="application/x-ndjson",
                                     headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
        return wrapped

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
from app.security.auth import authenticate, principal_context
import logging

logger = logging.getLogger(__name__)

MAX_REQUEST_BYTES = 65536


class SecurityBoundary:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def secured_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"x-frame-options", b"DENY"),
                ])
                if scope["path"].startswith("/api/"):
                    headers = [(k, v) for k, v in headers if k.lower() != b"cache-control"]
                    headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            await send(message)

        if not scope["path"].startswith("/api/") or scope["path"] == "/api/v1/auth/config":
            return await self.app(scope, receive, secured_send)
        headers = [v.decode("latin1") for k, v in scope["headers"] if k.lower() == b"authorization"]
        try:
            if len(headers) > 1:
                raise HTTPException(401, "Ambiguous authorization header.")
            principal = await run_in_threadpool(authenticate, headers[0] if headers else "")
        except HTTPException as exc:
            return await JSONResponse(status_code=exc.status_code, content={"detail": exc.detail},
                                      headers=exc.headers)(scope, receive, secured_send)
        context = principal_context.set(principal)
        try:
            await self.app(scope, receive, secured_send)
        except Exception as exc:
            # Handle API failures here so the server cannot log sensitive exception text.
            logger.error("API operation failed (%s); request and exception content withheld.", type(exc).__name__)
            await JSONResponse(status_code=500, content={
                "detail": "An internal error occurred.", "code": "internal_error",
            })(scope, receive, secured_send)
        finally:
            principal_context.reset(context)


class RequestSizeLimit:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        lengths = [value for name, value in scope["headers"] if name.lower() == b"content-length"]
        if lengths:
            try:
                if len(lengths) != 1 or not lengths[0].isdigit():
                    raise ValueError("Invalid Content-Length")
                size = int(lengths[0])
            except ValueError:
                await JSONResponse(status_code=400, content={"detail": "Invalid Content-Length."})(scope, receive, send)
                return
            if size > MAX_REQUEST_BYTES:
                await self._too_large(scope, receive, send)
                return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_REQUEST_BYTES:
                await self._too_large(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    @staticmethod
    async def _too_large(scope, receive, send):
        await JSONResponse(status_code=413, content={
            "detail": f"Request body exceeds {MAX_REQUEST_BYTES} bytes.",
        })(scope, receive, send)

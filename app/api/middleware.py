from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Scope, Receive, Send

MAX_REQUEST_BYTES = 65536


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

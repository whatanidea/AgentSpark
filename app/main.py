import os
import logging

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv

load_dotenv()  # Load variables from .env if present

from app.api.routes import router
from app.api.tenants import router as tenant_router
from app.api.discovery import router as discovery_router
from app.api.middleware import RequestSizeLimit, SecurityBoundary
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound
from app.utils.health import readiness
from app.utils.runtime import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("AgentSpark runtime mode: %s", settings.mode)

app = FastAPI(title="AgentSpark API", version="2.0.0",
              description="Enterprise Agentification Advisor — React SPA + FastAPI + LangGraph")

app.include_router(router, prefix="/api/v1")
app.include_router(tenant_router, prefix="/api/v1")
app.include_router(discovery_router, prefix="/api/v1")
app.add_middleware(RequestSizeLimit)
app.add_middleware(SecurityBoundary)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(error["loc"]), "type": error["type"], "msg": error["msg"]}
        for error in exc.errors()
    ]})


@app.exception_handler(DependencyUnavailable)
async def dependency_error(request: Request, exc: DependencyUnavailable):
    invalid = isinstance(exc, InvalidDependencyResponse)
    return JSONResponse(status_code=502 if invalid else 503, content={
        "detail": str(exc),
        "code": "invalid_dependency_response" if invalid else "dependency_unavailable",
        "dependency": exc.dependency,
    })


@app.exception_handler(ConcurrentUpdate)
async def write_conflict(request: Request, exc: ConcurrentUpdate):
    return JSONResponse(status_code=409, content={"detail": str(exc), "code": "session_conflict"})


@app.exception_handler(WorkflowNotFound)
async def session_not_found(request: Request, exc: WorkflowNotFound):
    return JSONResponse(status_code=404, content={"detail": str(exc), "code": "session_not_found"})


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error("Unhandled request error (%s). Request content and exception details withheld.",
                 type(exc).__name__)
    return JSONResponse(status_code=500, content={
        "detail": "An internal error occurred.", "code": "internal_error",
    })


@app.get("/health")
def health_check():
    return {"status": "ok", "live": settings.mode == "live", "mode": settings.mode}


@app.get("/ready")
def readiness_check():
    ready, dependencies = readiness()
    return JSONResponse(status_code=200 if ready else 503, content={
        "status": "ready" if ready else "degraded",
        "ready": ready, "mode": settings.mode, "dependencies": dependencies,
    })


# ── Serve the built React SPA (frontend/dist) from the same origin ──────────
_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.isdir(_DIST):
    # Static assets (JS/CSS/images) under /assets, etc.
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    # index.html must NEVER be cached — otherwise browsers keep serving an old
    # page that points at a stale JS bundle. (Hashed /assets can cache forever.)
    _NO_CACHE = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}

    def _index():
        return FileResponse(os.path.join(_DIST, "index.html"), headers=_NO_CACHE)

    @app.get("/")
    def spa_root():
        return _index()

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        # Serve real files if they exist, else fall back to index.html (SPA routing).
        candidate = os.path.realpath(os.path.join(_DIST, full_path))
        try:
            contained = os.path.commonpath([os.path.realpath(_DIST), candidate]) == os.path.realpath(_DIST)
        except ValueError:
            contained = False
        if not contained:
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return _index()

    logger.info("Serving React SPA from %s", _DIST)
else:
    logger.warning("frontend/dist not found — run `npm --prefix frontend ci && npm --prefix frontend run build`. "
                   "API is up at /api/v1; root will 404 until the SPA is built.")

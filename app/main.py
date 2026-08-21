import os
import logging

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()  # Load variables from .env if present

from app.api.routes import router
from app.utils.llm import azure_is_configured

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AgentSense API", version="2.0.0",
              description="Enterprise Agentification Advisor — React SPA + FastAPI + LangGraph")

app.include_router(router, prefix="/api/v1")


@app.get("/health")
def health_check():
    # `live` drives the UI status badge (Azure Live vs Demo/Mock).
    return {"status": "ok", "live": azure_is_configured()}


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
        # Serve real files if they exist, else fall back to index.html (SPA routing).
        candidate = os.path.join(_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return _index()

    logger.info("Serving React SPA from %s", _DIST)
else:
    logger.warning("frontend/dist not found — run `npm --prefix frontend ci && npm --prefix frontend run build`. "
                   "API is up at /api/v1; root will 404 until the SPA is built.")

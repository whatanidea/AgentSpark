"""
Vercel Python serverless entry-point.

Vercel looks for a callable named `handler` (or the ASGI app) inside files
in the `api/` directory. We use Mangum to bridge Vercel's Lambda-style
request/response to our FastAPI ASGI app.
"""
import sys
import os

# Make the project root importable so `from app.main import app` works.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app  # FastAPI instance
from mangum import Mangum

# Mangum wraps the ASGI app for AWS Lambda / Vercel's Python runtime.
handler = Mangum(app, lifespan="off")

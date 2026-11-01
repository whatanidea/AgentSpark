"""Test-only signed OIDC identities; never imported by the production entrypoint."""
from datetime import datetime, timedelta, timezone
import hashlib
from types import SimpleNamespace

from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
import jwt

from app.main import app as application
from app.api import routes
from app.security import auth

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
settings = auth.AuthSettings("oidc", "https://discovery-fixture.example", "discovery-browser", "https://discovery-fixture.example/keys")
auth.auth_settings = routes.auth_settings = settings
auth.key_client = lambda _: SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key()))
app = FastAPI()


@app.get("/test-fixture/tokens")
def tokens():
    now = datetime.now(timezone.utc)
    return {subject: {
        "identity": hashlib.sha256(f"{settings.issuer}\0{subject}".encode()).hexdigest(),
        "token": jwt.encode({"sub": subject, "iss": settings.issuer, "aud": settings.audience,
                             "iat": now, "exp": now + timedelta(hours=1), "roles": ["AgentSense.Reviewer"]},
                            key, algorithm="RS256"),
    } for subject in ("owner", "operator", "reviewer")}


app.mount("/", application)

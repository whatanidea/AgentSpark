"""OIDC bearer validation; never trust client-supplied identity headers."""
from contextvars import ContextVar
from dataclasses import dataclass
from functools import lru_cache
import hashlib
import os

import jwt
from fastapi import HTTPException
from jwt import PyJWKClient

from app.utils.runtime import settings


@dataclass(frozen=True)
class Principal:
    owner_id: str = "local-demo"
    subject: str = "local-demo"
    roles: tuple[str, ...] = ("reviewer",)


principal_context: ContextVar[Principal] = ContextVar("principal", default=Principal())


@dataclass(frozen=True)
class AuthSettings:
    mode: str
    issuer: str = ""
    audience: str = ""
    jwks_url: str = ""
    reviewer_role: str = "AgentSense.Reviewer"
    sign_in_client_id: str = ""
    sign_in_authority: str = ""
    sign_in_scope: str = ""

    def sign_in(self) -> dict[str, str] | None:
        """Public browser sign-in (OIDC authorization code + PKCE) settings, when configured."""
        if self.mode != "oidc" or not self.sign_in_client_id:
            return None
        return {"client_id": self.sign_in_client_id, "authority": self.sign_in_authority,
                "scope": self.sign_in_scope}


def load_auth_settings() -> AuthSettings:
    required = settings.mode == "live" or os.getenv("ENVIRONMENT", "").lower() == "production"
    mode = os.getenv("AGENTSENSE_AUTH_MODE", "oidc" if required else "local-demo")
    if mode not in ("local-demo", "oidc") or (required and mode != "oidc"):
        raise ValueError("Live and production require AGENTSENSE_AUTH_MODE=oidc.")
    result = AuthSettings(
        mode, os.getenv("AUTH_ISSUER", ""), os.getenv("AUTH_AUDIENCE", ""),
        os.getenv("AUTH_JWKS_URL", ""), os.getenv("AUTH_REVIEWER_ROLE", "AgentSense.Reviewer"),
        os.getenv("AUTH_SPA_CLIENT_ID", ""), os.getenv("AUTH_SPA_AUTHORITY", ""), os.getenv("AUTH_SPA_SCOPE", ""),
    )
    if mode == "oidc" and (
        not result.issuer.startswith("https://") or not result.audience
        or not result.jwks_url.startswith("https://") or not result.reviewer_role
    ):
        raise ValueError("OIDC requires HTTPS AUTH_ISSUER/AUTH_JWKS_URL, AUTH_AUDIENCE and a reviewer role.")
    spa = (result.sign_in_client_id, result.sign_in_authority, result.sign_in_scope)
    if any(spa) and (not all(spa) or not result.sign_in_authority.startswith("https://")):
        raise ValueError("Browser sign-in requires AUTH_SPA_CLIENT_ID, an HTTPS AUTH_SPA_AUTHORITY and AUTH_SPA_SCOPE.")
    hours = int(os.getenv("SESSION_RETENTION_HOURS", "24"))
    if not 1 <= hours <= 720:
        raise ValueError("SESSION_RETENTION_HOURS must be between 1 and 720.")
    return result


auth_settings = load_auth_settings()


@lru_cache(maxsize=4)
def key_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, timeout=5, lifespan=300)


def authenticate(authorization: str) -> Principal:
    if auth_settings.mode == "local-demo":
        return Principal()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 16384:
        raise HTTPException(401, "A valid organization access token is required.",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        key = key_client(auth_settings.jwks_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, key.key, algorithms=["RS256"],
            audience=auth_settings.audience, issuer=auth_settings.issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
        subject = claims["sub"]
        roles = claims.get("roles", [])
        if not isinstance(subject, str) or not subject or not isinstance(roles, list):
            raise ValueError("Invalid identity claims")
        owner = hashlib.sha256(f"{auth_settings.issuer}\0{subject}".encode()).hexdigest()
        return Principal(owner, subject, tuple(role for role in roles if isinstance(role, str)))
    except (jwt.PyJWTError, ValueError, OSError):
        raise HTTPException(401, "Invalid or expired access token.",
                            headers={"WWW-Authenticate": "Bearer"}) from None


def require_reviewer() -> str | None:
    principal = principal_context.get()
    if auth_settings.mode == "local-demo":
        return None
    if auth_settings.reviewer_role not in principal.roles:
        raise HTTPException(403, "The configured reviewer role is required.")
    return principal.subject

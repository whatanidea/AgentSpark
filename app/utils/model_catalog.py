"""Server-approved connections, pinned per assessment; no user-supplied endpoints."""
from contextlib import contextmanager
from contextvars import ContextVar
from hashlib import sha256
import logging
import os
from urllib.parse import urlsplit

from app.utils.errors import DependencyUnavailable
from app.utils.models import InferenceModel
from app.utils.runtime import demo_mode, require_config

logger = logging.getLogger(__name__)
selected_model: ContextVar[InferenceModel | None] = ContextVar("assessment_inference_model", default=None)
MODEL_IDS = ("azure-openai", "foundry-claude-haiku", "demo")


def model_definition(model_id: str) -> InferenceModel:
    if model_id == "demo" and demo_mode():
        return InferenceModel(id="demo", provider="Deterministic demo", model="Fictional fixtures",
                              deployment="demo", configuration="demo-v1")
    if demo_mode() or model_id not in MODEL_IDS or model_id == "demo":
        logger.error("An unavailable assessment model was requested.")
        raise DependencyUnavailable("model_catalog", "This model is not available in the current runtime.")
    if model_id == "azure-openai":
        _, endpoint = require_config("openai", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT")
        deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o")
        version = os.getenv("AZURE_OPENAI_MODEL_VERSION", "")
        model = os.getenv("AZURE_OPENAI_MODEL_NAME") or deployment
        provider = "Azure OpenAI"
        api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
    else:
        if os.getenv("FOUNDRY_CLAUDE_ENABLED", "").lower() != "true":
            logger.error("Claude was requested while its approved connection is disabled.")
            raise DependencyUnavailable("anthropic", "Claude has not been enabled by the administrator.")
        _, endpoint, deployment = require_config(
            "anthropic", "AZURE_ANTHROPIC_API_KEY", "AZURE_ANTHROPIC_ENDPOINT", "AZURE_ANTHROPIC_DEPLOYMENT")
        url = urlsplit(endpoint)
        if (url.scheme != "https" or not (url.hostname or "").endswith(".services.ai.azure.com")
                or url.path not in ("", "/") or url.query or url.fragment or url.username
                or url.password or url.port not in (None, 443)):
            logger.error("The approved Claude endpoint must be an HTTPS Azure Foundry account root.")
            raise DependencyUnavailable("anthropic")
        model = os.getenv("AZURE_ANTHROPIC_MODEL_NAME", "claude-haiku-5-5")
        version = os.getenv("AZURE_ANTHROPIC_MODEL_VERSION", "2")
        provider = "Anthropic on Azure Foundry"
        api_version = "messages"
    fingerprint = sha256(f"{endpoint.rstrip('/')}|{deployment}|{model}|{version}|{api_version}".encode()).hexdigest()
    return InferenceModel(id=model_id, provider=provider, model=model, deployment=deployment,
                          version=version, configuration=fingerprint)


def available_models() -> dict:
    ids = ("demo",) if demo_mode() else ("azure-openai", "foundry-claude-haiku")
    items = []
    for model_id in ids:
        try:
            definition = model_definition(model_id)
        except DependencyUnavailable:
            items.append({"id": model_id, "available": False, "definition": None,
                          "label": "Claude Haiku (Azure Foundry)" if model_id == "foundry-claude-haiku" else "Azure OpenAI",
                          "reason": "Coming soon. Continue with Azure OpenAI."
                          if model_id == "foundry-claude-haiku"
                          else "Not configured and enabled by the administrator."})
        else:
            items.append({"id": model_id, "available": True, "definition": definition.model_dump(),
                          "label": f"{definition.provider} / {definition.model}", "reason": ""})
    return {"mode": "demo" if demo_mode() else "live", "items": items}


@contextmanager
def assessment_model(selection: InferenceModel | None):
    definition = selection or model_definition("demo" if demo_mode() else "azure-openai")
    if definition != model_definition(definition.id):
        logger.error("Pinned assessment model no longer matches the approved connection.")
        raise DependencyUnavailable("model_catalog", "The assessment's model configuration changed. "
                                    "Restore that connection or start a new assessment; no fallback was used.")
    token = selected_model.set(definition)
    try:
        yield definition
    finally:
        selected_model.reset(token)

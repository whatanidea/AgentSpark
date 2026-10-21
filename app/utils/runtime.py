import logging
import os
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, HttpUrl, TypeAdapter, ValidationError

from app.utils.env import get_valid_env
from app.utils.errors import DependencyUnavailable

logger = logging.getLogger(__name__)
load_dotenv()


class RuntimeSettings(BaseModel):
    mode: Literal["demo", "live"]


def load_settings() -> RuntimeSettings:
    mode = os.environ.get("AGENTSENSE_MODE")
    if mode is None and os.environ.get("ENVIRONMENT", "development").lower() == "production":
        logger.error("AGENTSENSE_MODE must be explicitly configured in production.")
        raise ValueError("Set AGENTSENSE_MODE=demo or live in production.")
    try:
        result = RuntimeSettings(mode=mode if mode is not None else "demo")
    except ValidationError:
        logger.exception("AGENTSENSE_MODE must be demo or live.")
        raise
    logger.info("AgentSense runtime mode: %s", result.mode)
    return result


settings = load_settings()


def demo_mode() -> bool:
    return settings.mode == "demo"


def require_config(dependency: str, *keys: str) -> list[str]:
    values = [get_valid_env(key) for key in keys]
    if any(value is None for value in values):
        logger.error("%s configuration is incomplete; required settings: %s", dependency, ", ".join(keys))
        raise DependencyUnavailable(dependency)
    for key, value in zip(keys, values):
        if key.endswith("_ENDPOINT"):
            try:
                TypeAdapter(HttpUrl).validate_python(value)
            except ValidationError as exc:
                logger.error("%s has an invalid endpoint URL in %s.", dependency, key)
                raise DependencyUnavailable(dependency) from exc
    return [value for value in values if value is not None]

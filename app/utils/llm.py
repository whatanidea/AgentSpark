"""Structured Azure OpenAI calls. Live failures never become demo responses."""
import json
import logging
import os
from functools import lru_cache
from typing import Type, TypeVar

import httpx
from langchain_core.exceptions import OutputParserException
from langchain_core.messages import SystemMessage, HumanMessage
from openai import OpenAIError
from pydantic import BaseModel, ValidationError

from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.runtime import demo_mode, require_config

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
REASONING_EFFORTS = ("minimal", "low", "medium", "high")


def reasoning_effort() -> str | None:
    """Reasoning deployments (e.g. gpt-5 family) reject `temperature`; setting an effort opts in."""
    value = (os.environ.get("AZURE_OPENAI_REASONING_EFFORT") or "").strip().lower()
    if not value:
        return None
    if value not in REASONING_EFFORTS:
        logger.error("AZURE_OPENAI_REASONING_EFFORT must be one of: %s.", ", ".join(REASONING_EFFORTS))
        raise DependencyUnavailable("openai")
    return value


def _timeout_seconds() -> float:
    try:
        value = float(os.environ.get("AZURE_OPENAI_TIMEOUT_SECONDS", "15"))
    except ValueError:
        value = 0
    if not 1 <= value <= 120:
        logger.error("AZURE_OPENAI_TIMEOUT_SECONDS must be between 1 and 120.")
        raise DependencyUnavailable("openai")
    return value


@lru_cache(maxsize=4)
def get_chat_llm(temperature: float = 0.2):
    if demo_mode():
        return None
    key, endpoint = require_config("openai", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT")
    from langchain_openai import AzureChatOpenAI

    effort = reasoning_effort()
    sampling = {"reasoning_effort": effort} if effort else {"temperature": temperature}
    return AzureChatOpenAI(
        azure_deployment=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o"),
        openai_api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        azure_endpoint=endpoint,
        api_key=key,
        timeout=_timeout_seconds(),
        max_retries=0,
        **sampling,
    )


def invoke_llm(llm, messages):
    if llm is None:
        logger.error("An OpenAI call was attempted without a live client.")
        raise DependencyUnavailable("openai")
    try:
        return llm.invoke(messages)
    except (OpenAIError, httpx.HTTPError, TimeoutError, OSError) as exc:
        logger.error("OpenAI request failed (%s); request and exception content withheld.", type(exc).__name__)
        raise DependencyUnavailable("openai") from exc


def structured_call(llm, system_prompt: str, user_content: str, schema: Type[T]) -> T:
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_content)]
    if llm is None:
        logger.error("Structured generation requires a live OpenAI client.")
        raise DependencyUnavailable("openai")
    try:
        # Strict json_schema (langchain's default) rejects models with optional/defaulted fields.
        result = invoke_llm(llm.with_structured_output(schema, method="function_calling"), messages)
        return _validate_output(result, schema)
    except (ValueError, OutputParserException) as exc:
        logger.warning("Structured output was invalid (%s); retrying once using JSON completion.", _error_summary(exc))

    json_messages = [
        SystemMessage(content=system_prompt + _json_instruction(schema)),
        HumanMessage(content=user_content),
    ]
    try:
        raw = invoke_llm(llm.bind(response_format={"type": "json_object"}), json_messages).content
        if not isinstance(raw, str):
            raise ValueError("Expected a text completion")
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip("` \n")
        return _validate_output(json.loads(raw), schema)
    except (ValueError, IndexError, OutputParserException) as exc:
        logger.error("OpenAI did not produce valid structured output (%s); completion withheld.", _error_summary(exc))
        raise InvalidDependencyResponse("openai") from exc


def _json_instruction(schema: Type[BaseModel]) -> str:
    return (
        "\n\nRespond with a single JSON object only, no prose or code fences. "
        "It must validate against this JSON schema:\n"
        + json.dumps(schema.model_json_schema(mode="validation"), separators=(",", ":"))
    )


def _error_summary(exc: BaseException) -> str:
    """Field locations and error types only; model output may contain user data and is never logged."""
    seen: set[int] = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if isinstance(exc, ValidationError):
            parts = [f"{'.'.join(map(str, e['loc'])) or '<root>'}:{e['type']}" for e in exc.errors()[:10]]
            return f"{exc.error_count()} validation error(s): " + ", ".join(parts)
        if isinstance(exc, json.JSONDecodeError):
            return "invalid JSON"
        exc = exc.__cause__ or exc.__context__
    return type(exc).__name__ if exc is not None else "unknown"


def _validate_output(value: object, schema: Type[T]) -> T:
    result = value if isinstance(value, schema) else schema.model_validate(value)
    if not result.model_fields_set:
        raise ValueError("The model returned no fields")
    return result

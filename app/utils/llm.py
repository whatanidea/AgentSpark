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
from pydantic import BaseModel

from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.runtime import demo_mode, require_config

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


@lru_cache(maxsize=4)
def get_chat_llm(temperature: float = 0.2):
    if demo_mode():
        return None
    key, endpoint = require_config("openai", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT")
    from langchain_openai import AzureChatOpenAI

    return AzureChatOpenAI(
        azure_deployment=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o"),
        openai_api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        azure_endpoint=endpoint,
        api_key=key,
        temperature=temperature,
        timeout=15,
        max_retries=0,
    )


def invoke_llm(llm, messages):
    if llm is None:
        logger.error("An OpenAI call was attempted without a live client.")
        raise DependencyUnavailable("openai")
    try:
        return llm.invoke(messages)
    except (OpenAIError, httpx.HTTPError, TimeoutError, OSError) as exc:
        logger.error("OpenAI request failed; request and exception content withheld.")
        raise DependencyUnavailable("openai") from exc


def structured_call(llm, system_prompt: str, user_content: str, schema: Type[T]) -> T:
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_content)]
    if llm is None:
        logger.error("Structured generation requires a live OpenAI client.")
        raise DependencyUnavailable("openai")
    try:
        result = invoke_llm(llm.with_structured_output(schema), messages)
        return _validate_output(result, schema)
    except (ValueError, OutputParserException):
        logger.warning("Structured output was invalid; retrying once using JSON completion.")

    try:
        raw = invoke_llm(llm, messages).content
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
        logger.error("OpenAI did not produce valid structured output; completion withheld.")
        raise InvalidDependencyResponse("openai") from exc


def _validate_output(value: object, schema: Type[T]) -> T:
    result = value if isinstance(value, schema) else schema.model_validate(value)
    if not result.model_fields_set:
        raise ValueError("The model returned no fields")
    return result

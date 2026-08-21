"""
Centralised Azure OpenAI access with real structured output.

Every agent goes through `structured_call`, which uses LangChain's
`.with_structured_output(PydanticModel)` — this binds the model schema as an
OpenAI tool/function call, so the model is constrained to emit valid JSON that
parses straight into a Pydantic object. No more brittle string slicing.

If Azure is not configured (or a call fails), callers fall back to deterministic
mock data, so the full product is demoable offline.
"""
import os
import json
import logging
from typing import Optional, Type, TypeVar

from pydantic import BaseModel

from app.utils.env import get_valid_env

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")


def azure_is_configured() -> bool:
    return bool(get_valid_env("AZURE_OPENAI_API_KEY") and get_valid_env("AZURE_OPENAI_ENDPOINT"))


def get_chat_llm(temperature: float = 0.2):
    """Return a configured AzureChatOpenAI client, or None in mock mode."""
    if not azure_is_configured():
        return None
    from langchain_openai import AzureChatOpenAI

    return AzureChatOpenAI(
        azure_deployment=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o"),
        openai_api_version=_API_VERSION,
        azure_endpoint=get_valid_env("AZURE_OPENAI_ENDPOINT"),
        api_key=get_valid_env("AZURE_OPENAI_API_KEY"),
        temperature=temperature,
    )


def structured_call(llm, system_prompt: str, user_content: str, schema: Type[T]) -> Optional[T]:
    """
    Invoke the LLM and return an instance of `schema`, using function-calling
    structured output. Returns None on any failure so the caller can fall back.
    """
    if llm is None:
        return None

    from langchain_core.messages import SystemMessage, HumanMessage

    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_content)]

    # Preferred path: structured output bound as a tool/function schema.
    try:
        structured_llm = llm.with_structured_output(schema)
        result = structured_llm.invoke(messages)
        if isinstance(result, schema):
            return result
        if isinstance(result, dict):
            return schema(**result)
    except Exception as e:
        logger.warning(f"Structured output failed ({e}); falling back to JSON parse.")

    # Fallback path: plain completion + tolerant JSON parse.
    try:
        raw = llm.invoke(messages).content.strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip("` \n")
        return schema(**json.loads(raw))
    except Exception as e:
        logger.error(f"JSON fallback parse failed: {e}")
        return None

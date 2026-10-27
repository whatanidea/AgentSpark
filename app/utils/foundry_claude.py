"""Anthropic's supported Foundry SDK adapted to LangChain's chat and token callbacks."""
from typing import Any

from anthropic import AnthropicFoundry
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.output_parsers.openai_tools import PydanticToolsParser
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import Field


class FoundryClaudeChat(BaseChatModel):
    client: Any = Field(exclude=True, repr=False)
    deployment: str
    max_tokens: int = 8192

    @property
    def _llm_type(self) -> str:
        return "azure-foundry-anthropic"

    def _generate(self, messages: list[BaseMessage], stop: list[str] | None = None,
                  run_manager: CallbackManagerForLLMRun | None = None, **kwargs: Any) -> ChatResult:
        system = "\n\n".join(str(message.content) for message in messages if isinstance(message, SystemMessage))
        turns = [{"role": "user" if isinstance(message, HumanMessage) else "assistant",
                  "content": message.content} for message in messages if not isinstance(message, SystemMessage)]
        if stop:
            kwargs["stop_sequences"] = stop
        response = self.client.messages.create(model=self.deployment, system=system, messages=turns,
                                               max_tokens=self.max_tokens, **kwargs)
        if response.stop_reason == "max_tokens":
            raise ValueError("Claude output exceeded the configured token limit.")
        text = "".join(block.text for block in response.content if block.type == "text")
        calls = [{"name": block.name, "args": block.input, "id": block.id, "type": "tool_call"}
                 for block in response.content if block.type == "tool_use"]
        message = AIMessage(content=text, tool_calls=calls, usage_metadata={
            "input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.input_tokens + response.usage.output_tokens},
            response_metadata={"model": response.model, "stop_reason": response.stop_reason})
        return ChatResult(generations=[ChatGeneration(message=message)])

    def with_structured_output(self, schema, *, method="function_calling", **kwargs):
        if method != "function_calling" or kwargs:
            raise ValueError("Claude structured generation supports schema tool calling only.")
        function = convert_to_openai_tool(schema)["function"]
        tool = {"name": function["name"], "description": function.get("description", ""),
                "input_schema": function["parameters"]}
        return self.bind(tools=[tool], tool_choice={"type": "tool", "name": tool["name"]}) | PydanticToolsParser(
            tools=[schema], first_tool_only=True)


def create_foundry_claude(endpoint: str, api_key: str, deployment: str, timeout: float) -> FoundryClaudeChat:
    client = AnthropicFoundry(base_url=endpoint.rstrip("/") + "/anthropic", api_key=api_key,
                              timeout=timeout, max_retries=0, _strict_response_validation=True)
    return FoundryClaudeChat(client=client, deployment=deployment)

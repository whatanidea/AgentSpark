import logging

from azure.core.exceptions import AzureError
from langchain_core.messages import HumanMessage

from app.database.cosmos_client import db_client
from app.rag.search_client import get_search_client
from app.utils.errors import DependencyUnavailable
from app.utils.llm import get_chat_llm, invoke_llm
from app.utils.runtime import demo_mode

logger = logging.getLogger(__name__)


def check_openai() -> None:
    invoke_llm(
        get_chat_llm(temperature=0.2).bind(max_tokens=1, timeout=5),
        [HumanMessage(content="Reply OK.")],
    )


def check_search() -> None:
    client, _ = get_search_client()
    try:
        if client.get_document_count() == 0:
            logger.error("The live pattern index is empty; seed it before serving traffic.")
            raise DependencyUnavailable("search")
    except (AzureError, OSError) as exc:
        logger.error("Search readiness probe failed; dependency details withheld.")
        raise DependencyUnavailable("search") from exc


def readiness() -> tuple[bool, dict[str, str]]:
    if demo_mode():
        return True, {"openai": "demo", "search": "demo", "cosmos": "demo"}
    dependencies = {}
    for name, check in (("openai", check_openai), ("search", check_search), ("cosmos", db_client.check_ready)):
        try:
            check()
            dependencies[name] = "ready"
        except DependencyUnavailable:
            dependencies[name] = "unavailable"
    return all(status == "ready" for status in dependencies.values()), dependencies

import logging
from typing import List, Dict, Any

from azure.core.exceptions import AzureError
from app.utils.errors import DependencyUnavailable
from app.rag.search_client import get_search_client
from app.rag.pattern_library import keyword_rank

logger = logging.getLogger(__name__)


def retrieve_patterns(query: str, top_k: int = 4) -> List[Dict[str, Any]]:
    """Keyword retrieval from Azure in live mode, or the local library in demo mode."""
    client, _ = get_search_client()
    if client is None:
        return keyword_rank(query, top_k=top_k)

    try:
        results = client.search(search_text=query, top=top_k)
        docs = []
        for r in results:
            docs.append({
                "id": r.get("id", ""),
                "name": r.get("name", ""),
                "category": r.get("category", ""),
                "description": r.get("description", ""),
                "when_to_use": r.get("when_to_use", ""),
                "azure_services": r.get("azure_services", []),
                "score": r.get("@search.score", 0),
            })
        if not docs:
            logger.error("Live pattern retrieval returned no grounding documents.")
            raise DependencyUnavailable("search")
        return docs
    except (AzureError, OSError) as exc:
        logger.exception("Azure AI Search retrieval failed.")
        raise DependencyUnavailable("search") from exc


# Backwards-compatible alias for older callers/tests.
def retrieve_context(query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    patterns = retrieve_patterns(query, top_k=top_k)
    return [{"content": f"{p['name']}: {p['description']}", "score": p.get("score", 0)} for p in patterns]

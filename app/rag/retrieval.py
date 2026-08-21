import os
import logging
from typing import List, Dict, Any

from app.utils.env import get_valid_env
from app.rag.pattern_library import keyword_rank

logger = logging.getLogger(__name__)


def _search_configured() -> bool:
    return bool(get_valid_env("AZURE_SEARCH_ENDPOINT") and get_valid_env("AZURE_SEARCH_KEY"))


def retrieve_patterns(query: str, top_k: int = 4) -> List[Dict[str, Any]]:
    """
    Retrieve the most relevant agentic design patterns for a workflow.

    Uses Azure AI Search (hybrid keyword + vector) when configured; otherwise
    falls back to lexical ranking over the in-code curated pattern library so
    recommendations are always grounded in real, named patterns.
    """
    if not _search_configured():
        logger.info("Azure AI Search not configured — ranking over local pattern library.")
        return keyword_rank(query, top_k=top_k)

    try:
        from azure.core.credentials import AzureKeyCredential
        from azure.search.documents import SearchClient

        endpoint = get_valid_env("AZURE_SEARCH_ENDPOINT")
        key = get_valid_env("AZURE_SEARCH_KEY")
        index_name = os.environ.get("AZURE_SEARCH_INDEX_NAME", "patterns-index")
        client = SearchClient(endpoint=endpoint, index_name=index_name, credential=AzureKeyCredential(key))

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
        # If the index is empty/unseeded, degrade to the local library.
        return docs or keyword_rank(query, top_k=top_k)
    except Exception as e:
        logger.error(f"Azure AI Search failed ({e}); using local pattern library.")
        return keyword_rank(query, top_k=top_k)


# Backwards-compatible alias for older callers/tests.
def retrieve_context(query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    patterns = retrieve_patterns(query, top_k=top_k)
    return [{"content": f"{p['name']}: {p['description']}", "score": p.get("score", 0)} for p in patterns]

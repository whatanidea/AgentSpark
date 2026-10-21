import logging

from azure.core.exceptions import AzureError
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.rag.search_client import get_search_client
from app.rag.pattern_library import all_patterns

logger = logging.getLogger(__name__)


def seed_pattern_library():
    """
    Push the curated agentic pattern library into Azure AI Search so the
    recommendation agent retrieves over real, vetted designs. Idempotent.
    Run once after provisioning: `python -m app.rag.ingestion`.
    """
    client, index_name = get_search_client()
    if client is None:
        return {"status": "demo", "message": f"{len(all_patterns())} patterns available locally; no documents were written."}

    docs = []
    for p in all_patterns():
        docs.append({
            "id": p["id"],
            "name": p["name"],
            "category": p["category"],
            "description": p["description"],
            "when_to_use": p["when_to_use"],
            "azure_services": p["azure_services"],
            # searchable blob for keyword/semantic ranking
            "content": f"{p['name']}. {p['description']} When to use: {p['when_to_use']}",
        })

    result = _upload(client, docs)
    return {"status": "success", "indexed": len(result), "index": index_name}


def ingest_document(doc_id: str, content: str, metadata: dict):
    client, _ = get_search_client()
    if client is None:
        return {"status": "demo", "message": "No document was written; ingestion is disabled in demo mode."}
    result = _upload(client, [{**metadata, "id": doc_id, "content": content}])
    return {"status": "success", "result": [r.succeeded for r in result]}


def _upload(client, documents):
    try:
        result = client.upload_documents(documents=documents)
    except (AzureError, OSError) as exc:
        logger.exception("Azure AI Search ingestion failed.")
        raise DependencyUnavailable("search") from exc
    if len(result) != len(documents) or not all(item.succeeded for item in result):
        logger.error("Azure AI Search rejected one or more uploaded documents.")
        raise InvalidDependencyResponse("search")
    return result


if __name__ == "__main__":
    print(seed_pattern_library())

import os
import logging

from app.utils.env import get_valid_env
from app.rag.pattern_library import all_patterns

logger = logging.getLogger(__name__)


def get_search_client():
    endpoint = get_valid_env("AZURE_SEARCH_ENDPOINT")
    key = get_valid_env("AZURE_SEARCH_KEY")
    index_name = os.environ.get("AZURE_SEARCH_INDEX_NAME", "patterns-index")

    if not (endpoint and key):
        logger.warning("Azure AI Search not configured. Ingestion runs in mock mode.")
        return None, index_name

    from azure.core.credentials import AzureKeyCredential
    from azure.search.documents import SearchClient

    return SearchClient(endpoint=endpoint, index_name=index_name, credential=AzureKeyCredential(key)), index_name


def seed_pattern_library():
    """
    Push the curated agentic pattern library into Azure AI Search so the
    recommendation agent retrieves over real, vetted designs. Idempotent.
    Run once after provisioning: `python -m app.rag.ingestion`.
    """
    client, index_name = get_search_client()
    if client is None:
        return {"status": "mock", "message": f"{len(all_patterns())} patterns available locally (no Azure Search)."}

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

    try:
        result = client.upload_documents(documents=docs)
        succeeded = sum(1 for r in result if r.succeeded)
        return {"status": "success", "indexed": succeeded, "index": index_name}
    except Exception as e:
        logger.error(f"Failed to seed pattern library: {e}")
        return {"status": "error", "message": str(e)}


def ingest_document(doc_id: str, content: str, metadata: dict):
    client, _ = get_search_client()
    if client is None:
        return {"status": "mock_success", "message": "Document accepted (mock index)."}
    try:
        result = client.upload_documents(documents=[{"id": doc_id, "content": content, **metadata}])
        return {"status": "success", "result": [r.succeeded for r in result]}
    except Exception as e:
        logger.error(f"Failed to upload document: {e}")
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    print(seed_pattern_library())

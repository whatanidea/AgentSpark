import logging
import hashlib
import json
from typing import List, Dict, Any

from azure.core.exceptions import AzureError, ResourceNotFoundError
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.rag.search_client import get_search_client
from app.rag.pattern_library import keyword_rank, PATTERNS

logger = logging.getLogger(__name__)


def _document(raw: dict, source: str, index: str, method: str = "keyword") -> dict:
    if not all(isinstance(raw.get(key), str) and raw[key].strip() for key in ("id", "name", "description")):
        logger.error("Pattern source returned a document without an ID, name, or description.")
        raise InvalidDependencyResponse("search")
    doc = {key: raw.get(key, [] if key == "azure_services" else "")
           for key in ("id", "name", "category", "description", "when_to_use", "azure_services")}
    digest = hashlib.sha256(json.dumps(doc, sort_keys=True).encode()).hexdigest()
    return {**doc, "score": raw.get("@search.score", raw.get("score", 0)),
            "retrieval_method": method, "source_ref": f"{source}:{index}:{doc['id']}",
            "source_url": f"/api/v1/patterns/{doc['id']}", "content_sha256": digest}


def get_pattern(pattern_id: str) -> dict | None:
    client, index = get_search_client()
    if client is None:
        raw = next((p for p in PATTERNS if p["id"] == pattern_id), None)
        return _document(raw, "demo-library", index, "exact_id") if raw else None
    try:
        return _document(client.get_document(key=pattern_id), "azure-search", index, "exact_id")
    except ResourceNotFoundError:
        try:
            client.get_document_count()
        except (AzureError, OSError) as exc:
            logger.error("Pattern lookup could not verify the Search index; dependency details withheld.")
            raise DependencyUnavailable("search") from exc
        return None
    except (AzureError, OSError) as exc:
        logger.error("Azure AI Search pattern lookup failed; dependency details withheld.")
        raise DependencyUnavailable("search") from exc


def retrieve_patterns(query: str, top_k: int = 4, required_ids: tuple[str, ...] = ()) -> List[Dict[str, Any]]:
    """Keyword retrieval from Azure in live mode, or the local library in demo mode."""
    client, index = get_search_client()
    required = []
    for pattern_id in required_ids:
        document = get_pattern(pattern_id)
        if document is None:
            logger.error("Required design pattern %s is absent from the configured pattern source.", pattern_id)
            raise DependencyUnavailable("search")
        required.append(document)
    if client is None:
        ranked = [_document(p, "demo-library", index) for p in keyword_rank(query, top_k=top_k)]
        return _merge(required, ranked, top_k)

    try:
        results = client.search(search_text=query, top=top_k)
        docs = []
        for r in results:
            docs.append(_document(r, "azure-search", index))
        if not docs:
            logger.error("Live pattern retrieval returned no grounding documents.")
            raise DependencyUnavailable("search")
        return _merge(required, docs, top_k)
    except (AzureError, OSError) as exc:
        logger.error("Azure AI Search retrieval failed; query and exception content withheld.")
        raise DependencyUnavailable("search") from exc


def _merge(required: list[dict], ranked: list[dict], limit: int) -> list[dict]:
    unique = {p["id"]: p for p in required}
    for pattern in ranked:
        unique.setdefault(pattern["id"], pattern)
    return list(unique.values())[:max(limit, len(required))]


# Backwards-compatible alias for older callers/tests.
def retrieve_context(query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    patterns = retrieve_patterns(query, top_k=top_k)
    return [{"content": f"{p['name']}: {p['description']}", "score": p.get("score", 0)} for p in patterns]

"""Create the Azure AI Search pattern index and seed it with the curated library.

Run after provisioning, with the venv that has the app dependencies:

    AZURE_SEARCH_ENDPOINT=... AZURE_SEARCH_ADMIN_KEY=... python scripts/seed_search_index.py

The script is idempotent: it creates or updates the index schema, then uploads
(replaces) the pattern documents via the app's ingestion module.
"""
import os
import sys
from pathlib import Path

from azure.core.credentials import AzureKeyCredential
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchableField,
    SearchFieldDataType,
    SearchIndex,
    SimpleField,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def build_index(name: str) -> SearchIndex:
    return SearchIndex(name=name, fields=[
        SimpleField(name="id", type=SearchFieldDataType.String, key=True, filterable=True),
        SearchableField(name="name", type=SearchFieldDataType.String),
        SearchableField(name="category", type=SearchFieldDataType.String, filterable=True, facetable=True),
        SearchableField(name="description", type=SearchFieldDataType.String),
        SearchableField(name="when_to_use", type=SearchFieldDataType.String),
        SearchableField(name="azure_services", type=SearchFieldDataType.String, collection=True,
                        filterable=True, facetable=True),
        SearchableField(name="content", type=SearchFieldDataType.String),
    ])


def main() -> int:
    endpoint = os.environ.get("AZURE_SEARCH_ENDPOINT")
    admin_key = os.environ.get("AZURE_SEARCH_ADMIN_KEY")
    index_name = os.environ.get("AZURE_SEARCH_INDEX_NAME", "patterns-index")
    if not endpoint or not admin_key:
        print("Set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY.", file=sys.stderr)
        return 2

    SearchIndexClient(endpoint, AzureKeyCredential(admin_key)).create_or_update_index(build_index(index_name))
    print(f"Index '{index_name}' is ready.")

    # Uploads need an admin key; the app itself only receives the query key.
    os.environ.update({"AGENTSENSE_MODE": "live", "AZURE_SEARCH_KEY": admin_key,
                       "AZURE_SEARCH_INDEX_NAME": index_name})
    from app.rag.ingestion import seed_pattern_library

    print(seed_pattern_library())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

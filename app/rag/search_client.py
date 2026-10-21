import os
from functools import lru_cache

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient

from app.utils.runtime import demo_mode, require_config


@lru_cache(maxsize=1)
def get_search_client():
    index_name = os.environ.get("AZURE_SEARCH_INDEX_NAME", "patterns-index")
    if demo_mode():
        return None, index_name
    endpoint, key = require_config("search", "AZURE_SEARCH_ENDPOINT", "AZURE_SEARCH_KEY")
    return SearchClient(
        endpoint=endpoint, index_name=index_name, credential=AzureKeyCredential(key),
        connection_timeout=5, read_timeout=5, retry_total=0,
    ), index_name

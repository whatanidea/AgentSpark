import os
import logging

from app.utils.runtime import demo_mode, require_config

logger = logging.getLogger(__name__)


def get_embeddings_model():
    """
    Return Azure embeddings in live mode or deterministic zero vectors in demo.
    This helper is not wired into the current keyword retrieval path.
    """
    deployment = os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")

    if demo_mode():
        logger.info("Explicit demo mode: using mock embeddings.")

        class MockEmbeddings:
            def embed_documents(self, texts):
                return [[0.0] * 1536 for _ in texts]

            def embed_query(self, text):
                return [0.0] * 1536

        return MockEmbeddings()

    from langchain_openai import AzureOpenAIEmbeddings
    api_key, endpoint = require_config("openai", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT")

    return AzureOpenAIEmbeddings(
        azure_deployment=deployment,
        openai_api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        azure_endpoint=endpoint,
        api_key=api_key,
        request_timeout=15,
        max_retries=0,
    )

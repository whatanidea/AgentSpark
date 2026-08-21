import os
import logging

from app.utils.env import get_valid_env

logger = logging.getLogger(__name__)


def get_embeddings_model():
    """
    Returns an AzureOpenAIEmbeddings instance if configured,
    otherwise a deterministic mock so ingestion/retrieval still run offline.
    """
    api_key = get_valid_env("AZURE_OPENAI_API_KEY")
    endpoint = get_valid_env("AZURE_OPENAI_ENDPOINT")
    deployment = os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")

    if not (api_key and endpoint):
        logger.warning("Azure OpenAI Embeddings not configured. Using deterministic mock embeddings.")

        class MockEmbeddings:
            def embed_documents(self, texts):
                return [[0.0] * 1536 for _ in texts]

            def embed_query(self, text):
                return [0.0] * 1536

        return MockEmbeddings()

    from langchain_openai import AzureOpenAIEmbeddings

    return AzureOpenAIEmbeddings(
        azure_deployment=deployment,
        openai_api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        azure_endpoint=endpoint,
        api_key=api_key,
    )

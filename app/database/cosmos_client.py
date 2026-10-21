import logging
import os
from copy import deepcopy
from threading import RLock
from uuid import uuid4
from datetime import datetime, timezone

from azure.core import MatchConditions
from azure.core.exceptions import AzureError
from azure.cosmos import CosmosClient, exceptions
from pydantic import ValidationError

from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound
from app.utils.models import WorkflowState
from app.utils.runtime import demo_mode, require_config
from app.security.auth import principal_context
from app.security.guardrails import redact_data

logger = logging.getLogger(__name__)
PRIVATE_FIELDS = (
    "enterprise_context", "chat_history", "diagnosis", "workflow_intelligence",
    "architecture_recommendation", "blueprint", "trace", "guardrail_events", "human_review",
    "suitability_score", "azure_mapping", "retrieved_patterns", "governance", "roi", "portfolio",
)


def private_document(data: dict) -> dict:
    data = deepcopy(data)
    for field in PRIVATE_FIELDS:
        if field in data:
            data[field] = redact_data(data[field])
    return data


class DatabaseClient:
    def __init__(self):
        self.use_mock = demo_mode()
        self.database_name = os.environ.get("COSMOS_DB_DATABASE_NAME", "agentsense_db")
        self.mock_db: dict[str, dict] = {}
        self._lock = RLock()
        self.container = None
        if self.use_mock:
            logger.info("Explicit demo mode: using process-local session storage.")

    def _get_container(self):
        with self._lock:
            if self.container is None:
                endpoint, key = require_config("cosmos", "COSMOS_DB_ENDPOINT", "COSMOS_DB_KEY")
                self.client = CosmosClient(
                    endpoint, key, connection_timeout=5, read_timeout=5, retry_total=0,
                )
                self.database = self.client.get_database_client(self.database_name)
                self.container = self.database.get_container_client("workflows")
            return self.container

    @staticmethod
    def _decode(data: dict) -> WorkflowState:
        try:
            document = private_document(data)
            # Undated legacy documents must not gain a new retention window on each read.
            document.setdefault("expires_at", "1970-01-01T00:00:00+00:00")
            state = WorkflowState.model_validate(document)
            state._etag = data["_etag"]
            if not isinstance(state._etag, str) or not state._etag:
                raise ValueError("Persisted session is missing its version")
            return state
        except (ValidationError, KeyError, ValueError) as exc:
            logger.error("Stored session could not be decoded; payload withheld.")
            raise InvalidDependencyResponse("cosmos") from exc

    def get_workflow_state(self, session_id: str, *, create_if_missing: bool = False) -> WorkflowState:
        if self.use_mock:
            with self._lock:
                data = deepcopy(self.mock_db.get(session_id))
        else:
            try:
                data = self._get_container().read_item(item=session_id, partition_key=session_id)
            except exceptions.CosmosResourceNotFoundError:
                self.check_ready()
                data = None
            except (AzureError, OSError) as exc:
                logger.error("Cosmos session read failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
        if data is None:
            if create_if_missing:
                return WorkflowState(session_id=session_id, owner_id=principal_context.get().owner_id)
            raise WorkflowNotFound()
        state = self._decode(data)
        self._authorize(state)
        return state

    @staticmethod
    def _authorize(state: WorkflowState) -> None:
        if (state.owner_id != principal_context.get().owner_id
                or state.expires_at.tzinfo is None
                or state.expires_at <= datetime.now(timezone.utc)):
            raise WorkflowNotFound()

    def save_workflow_state(self, state: WorkflowState) -> None:
        self._authorize(state)
        document = private_document(state.model_dump(mode="json"))
        document["id"] = state.session_id
        document["ttl"] = max(1, int((state.expires_at - datetime.now(timezone.utc)).total_seconds()))
        if self.use_mock:
            with self._lock:
                current = self.mock_db.get(state.session_id)
                if (current is None and state._etag is not None) or (
                    current is not None and current["_etag"] != state._etag
                ):
                    logger.warning("Demo session write conflict.")
                    raise ConcurrentUpdate()
                document["_etag"] = str(uuid4())
                self.mock_db[state.session_id] = deepcopy(document)
                state._etag = document["_etag"]
            return
        try:
            container = self._get_container()
            if state._etag is None:
                response = container.create_item(body=document)
            else:
                response = container.replace_item(
                    item=state.session_id, body=document,
                    etag=state._etag, match_condition=MatchConditions.IfNotModified,
                )
            saved = self._decode(response)
            state._etag = saved._etag
        except exceptions.CosmosHttpResponseError as exc:
            if exc.status_code == 404:
                self.check_ready()
            if exc.status_code in (409, 412) or (exc.status_code == 404 and state._etag is not None):
                logger.warning("Cosmos session write conflict.")
                raise ConcurrentUpdate() from exc
            logger.error("Cosmos session save failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Cosmos session save failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc

    def delete_workflow_state(self, session_id: str) -> None:
        state = self.get_workflow_state(session_id)
        if self.use_mock:
            with self._lock:
                current = self.mock_db.get(session_id)
                if current is None or current["_etag"] != state._etag:
                    raise ConcurrentUpdate()
                del self.mock_db[session_id]
            return
        try:
            self._get_container().delete_item(
                item=session_id, partition_key=session_id, etag=state._etag,
                match_condition=MatchConditions.IfNotModified,
            )
        except exceptions.CosmosHttpResponseError as exc:
            if exc.status_code in (404, 412):
                raise ConcurrentUpdate() from exc
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            raise DependencyUnavailable("cosmos") from exc

    def check_ready(self) -> None:
        if self.use_mock:
            return
        try:
            properties = self._get_container().read()
            ttl = properties.get("defaultTtl")
            if not isinstance(ttl, int) or ttl == 0 or ttl < -1:
                logger.error("Cosmos workflows container must enable per-document TTL.")
                raise DependencyUnavailable("cosmos")
        except (AzureError, OSError) as exc:
            logger.error("Cosmos container check failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc


db_client = DatabaseClient()

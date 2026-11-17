"""Cosmos point writes and private scoped listings with absolute chat expiry."""
from copy import deepcopy
import json
import logging
from threading import RLock
from uuid import uuid4

from azure.core import MatchConditions
from azure.core.exceptions import AzureError
from azure.cosmos import exceptions
from fastapi import HTTPException
from pydantic import ValidationError

from app.database.cosmos_client import db_client, private_document
from app.database.tenant_directory import tenant_directory, workspace_context
from app.security.auth import principal_context
from app.utils.conversations import Conversation, Model, now
from pydantic import AwareDatetime
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse, WorkflowNotFound

logger = logging.getLogger(__name__)


def scope():
    workspace = workspace_context.get()
    if workspace.organization_id:
        tenant_directory.require(workspace.organization_id, workspace.team_id, "read")
    return principal_context.get().owner_id, workspace.organization_id, workspace.team_id


def authorize(chat):
    if (chat.owner_id, chat.organization_id, chat.team_id) != scope() or chat.expires_at <= now():
        raise WorkflowNotFound()


def can_create():
    _, organization, team = scope()
    return not organization or "write" in tenant_directory.permissions(organization, team)


class ConversationStore:
    def __init__(self):
        self.memory = {}
        self.receipts = {}
        self.lock = RLock()

    @staticmethod
    def decode(document):
        try:
            if not isinstance(document, dict) or document["record_kind"] != "conversation":
                raise ValueError("Invalid conversation document.")
            chat = Conversation.model_validate(document["conversation"])
            if document["id"] != chat.id or document["session_id"] != chat.id:
                raise ValueError("Invalid conversation key.")
            chat._etag = document["_etag"]
            if not isinstance(chat._etag, str) or not chat._etag:
                raise ValueError("Missing version.")
            return chat
        except (KeyError, ValueError, ValidationError) as exc:
            logger.error("Invalid stored conversation; payload withheld.")
            raise InvalidDependencyResponse("cosmos") from exc

    def read(self, identifier):
        if db_client.use_mock:
            with self.lock:
                document = deepcopy(self.memory.get(identifier))
        else:
            try:
                document = db_client._get_container().read_item(item=identifier, partition_key=identifier)
            except exceptions.CosmosResourceNotFoundError:
                db_client.check_ready()
                document = None
            except (AzureError, OSError) as exc:
                logger.error("Conversation read failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
        if document is None:
            raise WorkflowNotFound()
        chat = self.decode(document)
        authorize(chat)
        return chat

    def save(self, chat):
        authorize(chat)
        chat.updated_at = now()
        try:
            validated = Conversation.model_validate(chat.model_dump())
        except ValidationError as exc:
            logger.error("Conversation write failed schema validation; content withheld.")
            raise InvalidDependencyResponse("conversation", "The conversation did not pass validation. Reload saved messages before retrying.") from exc
        document = {"id": chat.id, "session_id": chat.id, "record_kind": "conversation",
                    "owner_id": chat.owner_id, "organization_id": chat.organization_id, "team_id": chat.team_id,
                    "expires_at": chat.expires_at.isoformat(), "conversation": validated.model_dump(mode="json"),
                    "ttl": max(1, int((chat.expires_at - now()).total_seconds()))}
        if len(json.dumps(document).encode()) > 900_000:
            raise HTTPException(409, "Conversation storage limit reached. Start another conversation.")
        if db_client.use_mock:
            with self.lock:
                if (self.memory.get(chat.id) or {}).get("_etag", "") != chat._etag:
                    raise ConcurrentUpdate()
                document["_etag"] = str(uuid4())
                self.memory[chat.id] = deepcopy(document)
                chat._etag = document["_etag"]
            return
        try:
            container = db_client._get_container()
            result = container.replace_item(item=chat.id, body=document, etag=chat._etag,
                                            match_condition=MatchConditions.IfNotModified) if chat._etag else container.create_item(body=document)
            if not isinstance(result, dict) or not isinstance(result.get("_etag"), str) or not result["_etag"]:
                logger.error("Invalid conversation write response; payload withheld.")
                raise InvalidDependencyResponse("cosmos")
            chat._etag = result["_etag"]
        except exceptions.CosmosHttpResponseError as exc:
            if exc.status_code in (409, 412, 404):
                raise ConcurrentUpdate() from exc
            logger.error("Conversation save failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Conversation save failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc

    def delete(self, chat):
        authorize(chat)
        if db_client.use_mock:
            with self.lock:
                if (self.memory.get(chat.id) or {}).get("_etag") != chat._etag:
                    raise ConcurrentUpdate()
                self.memory.pop(chat.id)
            return
        try:
            db_client._get_container().delete_item(item=chat.id, partition_key=chat.id, etag=chat._etag,
                                                  match_condition=MatchConditions.IfNotModified)
        except exceptions.CosmosHttpResponseError as exc:
            if exc.status_code in (404, 409, 412):
                raise ConcurrentUpdate() from exc
            logger.error("Conversation deletion failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Conversation deletion failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc

    def listing(self, cursor="", limit=30):
        owner, organization, team = scope()
        timestamp = now().isoformat()
        if db_client.use_mock:
            with self.lock:
                documents = [deepcopy(doc) for key, doc in sorted(self.memory.items(), reverse=True) if (
                    doc["owner_id"], doc["organization_id"], doc["team_id"]) == (owner, organization, team)
                    and doc["expires_at"] > timestamp and (not cursor or key < cursor)][:limit + 1]
                documents = [{**{name: doc[name] for name in ("id", "owner_id", "organization_id", "team_id", "expires_at")},
                              **{name: doc["conversation"][name] for name in ("title", "created_at", "updated_at")}}
                             for doc in documents]
        else:
            try:
                documents = list(db_client._get_container().query_items(
                    query=f"SELECT TOP {limit + 1} c.id, c.owner_id, c.organization_id, c.team_id, c.expires_at, "
                          "c.conversation.title AS title, c.conversation.created_at AS created_at, "
                          "c.conversation.updated_at AS updated_at FROM c WHERE c.record_kind='conversation' "
                          "AND c.owner_id=@owner AND c.organization_id=@organization AND c.team_id=@team "
                          "AND c.expires_at>@now " + ("AND c.id<@cursor " if cursor else "") + "ORDER BY c.id DESC",
                    parameters=[{"name": name, "value": value} for name, value in (
                        ("@owner", owner), ("@organization", organization), ("@team", team),
                        ("@now", timestamp), ("@cursor", cursor))], enable_cross_partition_query=True))
            except (AzureError, OSError) as exc:
                logger.error("Conversation listing failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
        try:
            chats = [Summary.model_validate(document) for document in documents[:limit]]
        except ValidationError as exc:
            logger.error("Invalid conversation history response; payload withheld.")
            raise InvalidDependencyResponse("cosmos") from exc
        for chat in chats:
            authorize(chat)
        return chats, chats[-1].id if len(documents) > limit else ""

    def create_workflow(self, state, chat, creation):
        """Create workflow + non-content receipt in its partition, never resurrect a deleted child."""
        db_client._authorize(state, "write")
        receipt_id = f"chat-receipt-{creation.draft.id}"
        receipt = {"id": receipt_id, "session_id": state.session_id, "record_kind": "conversation_receipt",
                   "conversation_id": chat.id, "digest": creation.draft.digest,
                   "ttl": max(1, int((chat.expires_at - now()).total_seconds()))}
        if db_client.use_mock:
            with db_client._lock:
                if receipt_id in self.receipts:
                    raise WorkflowNotFound()
                db_client.save_workflow_state(state)
                self.receipts[receipt_id] = receipt
            return
        try:
            container = db_client._get_container()
            try:
                container.read_item(item=receipt_id, partition_key=state.session_id)
            except exceptions.CosmosResourceNotFoundError:
                db_client.check_ready()
            else:
                raise WorkflowNotFound()
            from app.database.decision_archive import summary
            document = private_document(state.model_dump(mode="json"))
            document.update(id=state.session_id, home_visible=True, home=summary(state, now()).model_dump(),
                            ttl=max(1, int((state.expires_at - now()).total_seconds())))
            result = container.execute_item_batch([("create", (document,)), ("create", (receipt,))],
                                                  partition_key=state.session_id)
            try:
                state._etag = db_client._decode(result[0]["resourceBody"])._etag
            except (KeyError, IndexError, TypeError) as exc:
                logger.error("Invalid atomic conversation handoff response; payload withheld.")
                raise InvalidDependencyResponse("cosmos") from exc
        except (exceptions.CosmosBatchOperationError, exceptions.CosmosHttpResponseError) as exc:
            if exc.status_code in (409, 412):
                raise ConcurrentUpdate() from exc
            logger.error("Atomic conversation handoff failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Atomic conversation handoff failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc


class Summary(Model):
    id: str
    owner_id: str
    organization_id: str
    team_id: str
    title: str
    created_at: AwareDatetime
    updated_at: AwareDatetime
    expires_at: AwareDatetime


conversation_store = ConversationStore()

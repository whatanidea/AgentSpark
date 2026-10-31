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
from app.security import auth
from app.database.tenant_directory import Action, tenant_directory, workspace_context
from app.security.guardrails import redact_data
from app.database.decision_archive import LocalDecisionArchive, HomeItem, archive_scope, decode_record, decision_record, summary, timestamp

logger = logging.getLogger(__name__)
PRIVATE_FIELDS = (
    "enterprise_context", "chat_history", "diagnosis", "workflow_intelligence",
    "architecture_recommendation", "blueprint", "trace", "guardrail_events", "human_review",
    "suitability_score", "azure_mapping", "cloud_mapping", "retrieved_patterns", "governance", "roi", "portfolio",
    "evidence_register", "evidence_report", "readiness_assessment", "readiness_report",
    "interview_diagnosis", "interview_answers",
    "discovery", "executive_brief", "runtime_requirement_sources", "runtime_decision",
    "discovery_participants", "discovery_synthesis", "discovery_handoffs", "discovery_origin",
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
        self.archive = LocalDecisionArchive()
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
            if bool(state.organization_id) != bool(state.team_id):
                raise ValueError("Stored workspace scope is incomplete.")
            state._etag = data["_etag"]
            if not isinstance(state._etag, str) or not state._etag:
                raise ValueError("Persisted session is missing its version")
            return state
        except (ValidationError, KeyError, ValueError) as exc:
            logger.error("Stored session could not be decoded; payload withheld.")
            raise InvalidDependencyResponse("cosmos") from exc

    def get_workflow_state(self, session_id: str, *, create_if_missing: bool = False,
                           expected_kind: str = "assessment") -> WorkflowState:
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
                workspace = workspace_context.get()
                state = WorkflowState(session_id=session_id, owner_id=principal_context.get().owner_id,
                                      organization_id=workspace.organization_id or None, team_id=workspace.team_id or None)
                self._authorize(state, "write")
                return state
            raise WorkflowNotFound()
        state = self._decode(data)
        self._authorize(state)
        if state.record_kind != expected_kind:
            raise WorkflowNotFound()
        return state

    @staticmethod
    def _authorize(state: WorkflowState, action: Action = "read") -> None:
        DatabaseClient.authorize_scope(state.owner_id, state.organization_id, state.team_id, action)
        if (state.expires_at.tzinfo is None
                or state.expires_at <= datetime.now(timezone.utc)):
            raise WorkflowNotFound()

    @staticmethod
    def authorize_scope(owner: str, organization: str | None, team: str | None, action: Action = "read"):
        workspace = workspace_context.get()
        if (organization or "") != workspace.organization_id or (team or "") != workspace.team_id:
            raise WorkflowNotFound()
        if organization and team:
            required = "write" if action == "delete" and owner == principal_context.get().owner_id else action
            tenant_directory.require(organization, team, required)
            if action == "review" and owner == principal_context.get().owner_id:
                from fastapi import HTTPException
                raise HTTPException(403, "Team workflow creators cannot review their own workflows.")
        elif owner != principal_context.get().owner_id:
            raise WorkflowNotFound()

    @staticmethod
    def permissions(state: WorkflowState):
        allowed = (tenant_directory.permissions(state.organization_id, state.team_id)
                   if state.organization_id and state.team_id else {"read", "write", "review", "delete"})
        if state.owner_id == principal_context.get().owner_id and "write" in allowed:
            allowed.add("delete")
        reviewer = (bool(state.organization_id) or auth.auth_settings.mode == "local-demo"
                    or auth.auth_settings.reviewer_role in principal_context.get().roles)
        return {action: action in allowed and (action != "review" or (
            reviewer and (not state.organization_id or state.owner_id != principal_context.get().owner_id)))
            for action in ("read", "write", "review", "delete")}

    def save_workflow_state(self, state: WorkflowState, *, action: Action = "write") -> None:
        self._authorize(state, action)
        now = datetime.now(timezone.utc)
        document = private_document(state.model_dump(mode="json"))
        safe_state = WorkflowState.model_validate(document)
        archive = (decision_record(safe_state, now, self.archive.retention_days)
                   if state.analysis_id and state.status in ("completed", "rejected")
                   and state.decision_recorded_at is None else None)
        if archive:
            document["decision_recorded_at"] = timestamp(now)
        document["home"] = summary(safe_state, now).model_dump()
        document["home_visible"] = not (archive or state.decision_recorded_at)
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
                if archive:
                    self.archive.put(archive)
                document["_etag"] = str(uuid4())
                self.mock_db[state.session_id] = deepcopy(document)
                state._etag = document["_etag"]
                if archive:
                    state.decision_recorded_at = now
            return
        try:
            container = self._get_container()
            if archive:
                operation = (("create", (document,)) if state._etag is None else
                             ("replace", (state.session_id, document), {"if_match_etag": state._etag}))
                result = container.execute_item_batch(
                    [operation, ("create", (archive.model_dump(),))], partition_key=state.session_id,
                )
                try:
                    response = result[0]["resourceBody"]
                except (IndexError, KeyError, TypeError) as exc:
                    logger.error("Cosmos decision batch returned an invalid response.")
                    raise InvalidDependencyResponse("cosmos") from exc
            elif state._etag is None:
                response = container.create_item(body=document)
            else:
                response = container.replace_item(
                    item=state.session_id, body=document,
                    etag=state._etag, match_condition=MatchConditions.IfNotModified,
                )
            saved = self._decode(response)
            state._etag = saved._etag
            if archive:
                state.decision_recorded_at = now
        except exceptions.CosmosBatchOperationError as exc:
            if exc.status_code in (404, 409, 412):
                logger.warning("Cosmos decision write conflict.")
                raise ConcurrentUpdate() from exc
            logger.error("Cosmos decision batch failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
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

    def delete_workflow_state(self, session_id: str, *, expected_kind: str = "assessment",
                              expected_version: str | None = None) -> None:
        state = self.get_workflow_state(session_id, expected_kind=expected_kind)
        self._authorize(state, "delete")
        if expected_version is not None and state._etag != expected_version:
            raise ConcurrentUpdate()
        if self.use_mock:
            with self._lock:
                current = self.mock_db.get(session_id)
                if current is None or current["_etag"] != state._etag:
                    raise ConcurrentUpdate()
                self.archive.delete_session(archive_scope(state.owner_id, state.organization_id, state.team_id), session_id)
                del self.mock_db[session_id]
            return
        try:
            self._delete_cosmos_archives(session_id, state.owner_id, state.organization_id, state.team_id)
            self._get_container().delete_item(
                item=session_id, partition_key=session_id, etag=state._etag,
                match_condition=MatchConditions.IfNotModified,
            )
        except (exceptions.CosmosHttpResponseError, exceptions.CosmosBatchOperationError) as exc:
            if exc.status_code in (404, 409, 412):
                logger.warning("Cosmos workflow deletion conflict.")
                raise ConcurrentUpdate() from exc
            logger.error("Cosmos workflow deletion failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Cosmos workflow deletion failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc

    def _delete_cosmos_archives(self, session_id: str, owner: str, organization=None, team=None):
        container = self._get_container()
        while True:
            documents = list(container.query_items(
                query="SELECT TOP 99 c.id, c._etag FROM c WHERE c.document_type = 'decision_archive' AND c.owner_id = @owner "
                "AND ((@organization='' AND (NOT IS_DEFINED(c.organization_id) OR IS_NULL(c.organization_id))) "
                "OR (c.organization_id=@organization AND c.team_id=@team))",
                parameters=[{"name": "@owner", "value": owner}, {"name": "@organization", "value": organization or ""},
                            {"name": "@team", "value": team or ""}], partition_key=session_id,
            ))
            if not documents:
                return
            container.execute_item_batch([
                ("delete", (document["id"],), {"if_match_etag": document["_etag"]})
                for document in documents
            ], partition_key=session_id)

    def get_decision(self, session_id: str, analysis_id: str):
        owner = principal_context.get().owner_id
        workspace = workspace_context.get()
        if workspace.organization_id:
            tenant_directory.require(workspace.organization_id, workspace.team_id, "read")
        if self.use_mock:
            record = self.archive.get(archive_scope(owner, workspace.organization_id, workspace.team_id), session_id, analysis_id)
        else:
            try:
                record = decode_record(self._get_container().read_item(
                    item=f"decision-{analysis_id}", partition_key=session_id))
            except exceptions.CosmosResourceNotFoundError:
                self.check_ready()
                record = None
            except (AzureError, OSError) as exc:
                logger.error("Decision read failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
        if (record is None or record.session_id != session_id or record.home.analysis_id != analysis_id
                or record.home.expires_at <= timestamp(datetime.now(timezone.utc))):
            raise WorkflowNotFound()
        self.authorize_scope(record.owner_id, record.organization_id, record.team_id)
        return record

    def delete_archived_workflow(self, session_id: str, analysis_id: str):
        record = self.get_decision(session_id, analysis_id)
        self.authorize_scope(record.owner_id, record.organization_id, record.team_id, "delete")
        if self.use_mock:
            with self._lock:
                self.archive.delete_session(archive_scope(record.owner_id, record.organization_id, record.team_id), session_id)
                current = self.mock_db.get(session_id)
                if (current and current.get("owner_id") == record.owner_id
                        and current.get("organization_id") == record.organization_id and current.get("team_id") == record.team_id):
                    del self.mock_db[session_id]
            return
        try:
            container = self._get_container()
            try:
                current = container.read_item(item=session_id, partition_key=session_id)
            except exceptions.CosmosResourceNotFoundError:
                current = None
            self._delete_cosmos_archives(session_id, record.owner_id, record.organization_id, record.team_id)
            if (current and current.get("owner_id") == record.owner_id
                    and current.get("organization_id") == record.organization_id and current.get("team_id") == record.team_id):
                container.delete_item(item=session_id, partition_key=session_id,
                                      etag=current["_etag"], match_condition=MatchConditions.IfNotModified)
        except (exceptions.CosmosHttpResponseError, exceptions.CosmosBatchOperationError) as exc:
            if exc.status_code in (404, 409, 412):
                raise ConcurrentUpdate() from exc
            logger.error("Decision deletion failed; retry to finish removing this workflow.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Decision deletion failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc

    def list_home(self, status: str = "all", cursor: str = "", limit: int = 20):
        owner = principal_context.get().owner_id
        workspace = workspace_context.get()
        allowed = (tenant_directory.permissions(workspace.organization_id, workspace.team_id)
                   if workspace.organization_id else {"read", "write", "delete"})
        if "read" not in allowed:
            tenant_directory.require(workspace.organization_id, workspace.team_id, "read")
        scope_filter = ("c.organization_id = @organization AND c.team_id = @team" if workspace.organization_id
                        else "c.owner_id = @owner AND (NOT IS_DEFINED(c.organization_id) OR IS_NULL(c.organization_id))")
        now = datetime.now(timezone.utc)
        if self.use_mock:
            with self._lock:
                active = [
                    HomeItem.model_validate({**(document.get("home") or summary(
                        self._decode(document), now, legacy=True).model_dump()), "owner_id": document["owner_id"]})
                    for document in self.mock_db.values()
                    if (document.get("organization_id") or "") == workspace.organization_id
                    and (document.get("team_id") or "") == workspace.team_id
                    and (bool(workspace.organization_id) or document.get("owner_id") == owner)
                    and document.get("home_visible", True)
                    and document.get("record_kind", "assessment") == "assessment"
                    and self._decode(document).expires_at > now
                ]
            records = self.archive.page(archive_scope(owner, workspace.organization_id, workspace.team_id), status, cursor, limit + 1)
            records.extend(item for item in active if (status == "all" or item.status == status)
                           and (not cursor or item.sort_key < cursor))
            records.sort(key=lambda item: item.sort_key, reverse=True)
        else:
            try:
                parameters = [
                    {"name": "@owner", "value": owner}, {"name": "@now", "value": timestamp(now)},
                    {"name": "@status", "value": status}, {"name": "@cursor", "value": cursor},
                    {"name": "@organization", "value": workspace.organization_id}, {"name": "@team", "value": workspace.team_id},
                ]
                records = [] if cursor.startswith("legacy:") else [
                    HomeItem.model_validate({**item["home"], "owner_id": item["owner_id"]})
                    for item in self._get_container().query_items(
                        query=f"SELECT TOP {limit + 1} c.home, c.owner_id FROM c WHERE {scope_filter} "
                        "AND (NOT IS_DEFINED(c.record_kind) OR c.record_kind = 'assessment') "
                        "AND c.home_visible = true AND c.home.expires_at > @now "
                        "AND (@status = 'all' OR c.home.status = @status) "
                        "AND (@cursor = '' OR c.home.sort_key < @cursor) ORDER BY c.home.sort_key DESC",
                        parameters=parameters, enable_cross_partition_query=True,
                    )
                ]
                if len(records) <= limit:
                    legacy_cursor = cursor.removeprefix("legacy:") if cursor.startswith("legacy:") else ""
                    legacy = self._get_container().query_items(
                        query=f"SELECT TOP {limit + 1 - len(records)} c.id, c.session_id, c.owner_id, c.expires_at, "
                        "c.status, c.enterprise_context, c.workflow_intelligence, c.suitability_score, c.analysis_id, "
                        f"c.organization_id, c.team_id, c._etag FROM c WHERE {scope_filter} "
                        "AND (NOT IS_DEFINED(c.record_kind) OR c.record_kind = 'assessment') "
                        "AND NOT IS_DEFINED(c.home) AND IS_DEFINED(c.session_id) "
                        "AND c.expires_at > @now AND (@cursor = '' OR c.id < @cursor) "
                        "AND (@status = 'all' OR (@status = 'approved' AND c.status = 'completed') "
                        "OR (@status = 'rejected' AND c.status = 'rejected') "
                        "OR (@status = 'pending_review' AND c.status = 'awaiting_human_review') "
                        "OR (@status = 'draft' AND c.status NOT IN ('completed', 'rejected', 'awaiting_human_review'))) "
                        "ORDER BY c.id DESC",
                        parameters=[*parameters[:3], *parameters[4:], {"name": "@cursor", "value": legacy_cursor}],
                        enable_cross_partition_query=True,
                    )
                    for document in legacy:
                        state = self._decode(document)
                        self._authorize(state)
                        item = summary(state, now, legacy=True)
                        item.updated_at = ""
                        item.sort_key = f"legacy:{state.session_id}"
                        records.append(item)
            except (AzureError, OSError) as exc:
                logger.error("Personal workflow listing failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
            except (ValidationError, KeyError, TypeError) as exc:
                logger.error("Personal workflow summary is invalid; payload withheld.")
                raise InvalidDependencyResponse("cosmos") from exc
        page = records[:limit]
        if any((item.organization_id or "") != workspace.organization_id
               or (item.team_id or "") != workspace.team_id for item in page):
            logger.error("Home summary scope is inconsistent; payload withheld.")
            raise InvalidDependencyResponse("cosmos")
        return {"items": [{**item.model_dump(), "can_delete": "delete" in allowed or (
                    "write" in allowed and item.owner_id == owner)} for item in page],
                "next_cursor": page[-1].sort_key if len(records) > limit else None,
                "archive_retention_days": self.archive.retention_days}

    def list_engagements(self, cursor: str = "", limit: int = 20):
        owner = principal_context.get().owner_id
        workspace = workspace_context.get()
        if workspace.organization_id:
            tenant_directory.require(workspace.organization_id, workspace.team_id, "read")
        now = timestamp(datetime.now(timezone.utc))
        if self.use_mock:
            with self._lock:
                documents = [
                    deepcopy(item) for item in self.mock_db.values()
                    if item.get("record_kind") == "discovery"
                    and (item.get("organization_id") or "") == workspace.organization_id
                    and (item.get("team_id") or "") == workspace.team_id
                    and (bool(workspace.organization_id) or item.get("owner_id") == owner)
                    and item["home"]["expires_at"] > now
                    and (not cursor or item["home"]["sort_key"] < cursor)
                ]
            documents.sort(key=lambda item: item["home"]["sort_key"], reverse=True)
            documents = documents[:limit + 1]
        else:
            scope = ("c.organization_id=@organization AND c.team_id=@team" if workspace.organization_id else
                     "c.owner_id=@owner AND (NOT IS_DEFINED(c.organization_id) OR IS_NULL(c.organization_id))")
            try:
                documents = list(self._get_container().query_items(
                    query=f"SELECT TOP {limit + 1} c.home, c.owner_id FROM c WHERE c.record_kind='discovery' "
                          f"AND {scope} AND c.home.expires_at>@now "
                          "AND (@cursor='' OR c.home.sort_key<@cursor) ORDER BY c.home.sort_key DESC",
                    parameters=[{"name": "@owner", "value": owner}, {"name": "@organization", "value": workspace.organization_id},
                                {"name": "@team", "value": workspace.team_id}, {"name": "@now", "value": now},
                                {"name": "@cursor", "value": cursor}], enable_cross_partition_query=True))
            except (AzureError, OSError) as exc:
                logger.error("Discovery listing failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
        try:
            items = [HomeItem.model_validate(item["home"]) for item in documents[:limit]]
            if any(item.kind != "engagement" or (item.organization_id or "") != workspace.organization_id
                   or (item.team_id or "") != workspace.team_id for item in items):
                raise ValueError("Invalid discovery scope.")
        except (ValidationError, KeyError, TypeError, ValueError) as exc:
            logger.error("Discovery summary is invalid; payload withheld.")
            raise InvalidDependencyResponse("cosmos") from exc
        return {"items": [item.model_dump() for item in items],
                "next_cursor": items[-1].sort_key if len(documents) > limit else None}

    def check_ready(self) -> None:
        if self.use_mock:
            self.archive.check_ready()
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

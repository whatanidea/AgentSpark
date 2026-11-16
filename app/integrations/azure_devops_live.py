"""Bounded delegated reads and durable, workspace-scoped connector state."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
from html.parser import HTMLParser
import json
import logging
import re
from threading import RLock
from typing import Annotated, Literal
from uuid import UUID, uuid4

from azure.core import MatchConditions
from azure.core.exceptions import AzureError
from azure.cosmos import exceptions
from fastapi import HTTPException
import httpx
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, PrivateAttr, ValidationError, field_validator

from app.database.cosmos_client import db_client
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse
from app.utils.models import DiscoveryEngagement, DiscoverySource, SessionId

logger = logging.getLogger(__name__)
ItemId = Annotated[int, Field(strict=True, gt=0)]


def now():
    return datetime.now(timezone.utc)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Organization(Model):
    organization: str

    @field_validator("organization")
    @classmethod
    def canonical_organization(cls, value):
        match = re.fullmatch(r"(?:https://dev\.azure\.com/)?([a-z0-9][a-z0-9-]{0,49})/?",
                             value.strip(), re.IGNORECASE)
        if not match:
            raise ValueError("Use an Azure DevOps organization name or https://dev.azure.com/organization.")
        return match[1].lower()


class Connection(Organization):
    project_id: SessionId
    project_name: str = Field(min_length=1, max_length=200)
    revision: SessionId = Field(default_factory=lambda: str(uuid4()))

    @field_validator("project_id")
    @classmethod
    def project_uuid(cls, value):
        return str(UUID(value))


class Item(Model):
    id: ItemId
    organization: str
    project_id: SessionId
    project_name: str
    revision: Annotated[int, Field(strict=True, gt=0)]
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(max_length=8000)
    item_type: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    changed_at: AwareDatetime
    source_url: str
    content_digest: str = ""


class Preview(Model):
    id: SessionId = Field(default_factory=lambda: str(uuid4()))
    actor: str
    connection_revision: SessionId
    expires_at: AwareDatetime = Field(default_factory=lambda: now() + timedelta(minutes=10))
    engagement: DiscoveryEngagement
    items: list[Item] = Field(min_length=1, max_length=20)
    sources: list[DiscoverySource] = Field(min_length=1, max_length=20)
    digest: str = ""


class Creation(Model):
    preview: Preview
    engagement_id: SessionId = Field(default_factory=lambda: str(uuid4()))
    confirmed_at: AwareDatetime = Field(default_factory=now)


class Receipt(Model):
    preview_id: SessionId
    digest: str
    actor: str
    engagement_id: SessionId
    created_at: AwareDatetime


class Activity(Model):
    action: str
    actor: str
    at: AwareDatetime = Field(default_factory=now)


class State(Model):
    _etag: str = PrivateAttr(default="")
    connection: Connection | None = None
    preview: Preview | None = None
    creation: Creation | None = None
    receipts: list[Receipt] = Field(default_factory=list, max_length=20)
    activity: list[Activity] = Field(default_factory=list, max_length=100)
    expires_at: AwareDatetime = Field(default_factory=lambda: now() + timedelta(days=30))


class Store:
    def __init__(self):
        self.memory = {}
        self.lock = RLock()

    @staticmethod
    def key(scope):
        return "ado-" + hashlib.sha256(scope.encode()).hexdigest()

    def read(self, scope):
        key = self.key(scope)
        if db_client.use_mock:
            with self.lock:
                document = deepcopy(self.memory.get(key))
        else:
            try:
                document = db_client._get_container().read_item(item=key, partition_key=key)
            except exceptions.CosmosResourceNotFoundError:
                db_client.check_ready()
                document = None
            except (AzureError, OSError) as exc:
                logger.error("Connector state read failed; dependency details withheld.")
                raise DependencyUnavailable("cosmos") from exc
        if document is None:
            return State()
        try:
            if not isinstance(document, dict):
                raise ValueError("Invalid connector document.")
            if document["record_kind"] != "azure_devops_connector" or document["scope"] != scope:
                raise ValueError("Invalid connector scope.")
            state = State.model_validate(document["connector"])
            if state.expires_at <= now():
                state = State()
            state._etag = document["_etag"]
            if not isinstance(state._etag, str) or not state._etag:
                raise ValueError("Missing version.")
            return state
        except (KeyError, ValueError, ValidationError) as exc:
            logger.error("Invalid stored connector state; payload withheld.")
            raise InvalidDependencyResponse("cosmos") from exc

    def save(self, scope, state):
        key = self.key(scope)
        document = {"id": key, "session_id": key, "record_kind": "azure_devops_connector",
                    "scope": scope, "connector": state.model_dump(mode="json"),
                    "ttl": max(1, int((state.expires_at - now()).total_seconds()))}
        if len(json.dumps(document).encode()) > 1_000_000:
            raise HTTPException(409, "Connector evidence exceeds the safe storage limit. Select fewer work items.")
        if db_client.use_mock:
            with self.lock:
                previous = self.memory.get(key)
                if (previous or {}).get("_etag", "") != state._etag:
                    raise ConcurrentUpdate()
                document["_etag"] = str(uuid4())
                self.memory[key] = deepcopy(document)
                state._etag = document["_etag"]
            return
        try:
            container = db_client._get_container()
            result = (container.replace_item(item=key, body=document, etag=state._etag,
                                            match_condition=MatchConditions.IfNotModified)
                      if state._etag else container.create_item(body=document))
            if not isinstance(result, dict) or not isinstance(result.get("_etag"), str) or not result["_etag"]:
                logger.error("Invalid connector write response; payload withheld.")
                raise InvalidDependencyResponse("cosmos")
            state._etag = result["_etag"]
        except exceptions.CosmosHttpResponseError as exc:
            if exc.status_code in (409, 412) or (exc.status_code == 404 and state._etag):
                raise ConcurrentUpdate() from exc
            logger.error("Connector state write failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc
        except (AzureError, OSError) as exc:
            logger.error("Connector state write failed; dependency details withheld.")
            raise DependencyUnavailable("cosmos") from exc


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        elif tag in ("p", "div", "br", "li"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


class Reader:
    def __init__(self, token):
        self.token = token

    def _read(self, organization, operation, *, project=None, params=None, body=None):
        operations = {"projects": ("GET", "_apis/projects"),
                      "project": ("GET", f"_apis/projects/{project}"),
                      "query": ("POST", f"{project}/_apis/wit/wiql"),
                      "items": ("GET", f"{project}/_apis/wit/workitems")}
        if operation not in operations:
            raise ValueError("Only allowlisted Azure DevOps read operations are supported.")
        organization = Organization(organization=organization).organization
        if operation != "projects":
            project = str(UUID(project))
            # Rebuild after canonicalizing the untrusted project identifier.
            operations["project"] = ("GET", f"_apis/projects/{project}")
            operations["query"] = ("POST", f"{project}/_apis/wit/wiql")
            operations["items"] = ("GET", f"{project}/_apis/wit/workitems")
        method, path = operations[operation]
        try:
            with httpx.Client(timeout=15, follow_redirects=False, trust_env=False) as client:
                with client.stream(method, f"https://dev.azure.com/{organization}/{path}",
                                   params={"api-version": "7.1", **(params or {})},
                                   headers={"Authorization": "Bearer " + self.token, "Accept": "application/json"},
                                   json=body) as response:
                    if response.status_code in (401, 403):
                        raise HTTPException(424, "Azure DevOps access was denied or expired. Reconnect with Microsoft and check project permissions.")
                    if response.status_code == 404:
                        raise HTTPException(404, "Azure DevOps organization, project or work item was not found or is not accessible.")
                    if response.status_code == 429 or response.status_code >= 500:
                        logger.warning("Azure DevOps read service unavailable (status %s).", response.status_code)
                        raise HTTPException(503, "Azure DevOps is temporarily unavailable or rate limited. Try again later.")
                    if response.status_code != 200:
                        logger.warning("Azure DevOps read rejected (status %s).", response.status_code)
                        raise HTTPException(502, "Azure DevOps returned an unexpected response. No data was imported.")
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > 2_000_000:
                            raise HTTPException(502, "Azure DevOps response exceeds the safe limit. Narrow the source selection.")
                    result = json.loads(content)
                    if not isinstance(result, dict):
                        raise ValueError("Expected an object.")
                    return result, response.headers
        except (httpx.HTTPError, OSError) as exc:
            logger.warning("Azure DevOps read failed; credentials and response withheld.")
            raise HTTPException(503, "Azure DevOps could not be reached. No data was imported.") from exc
        except (ValueError, UnicodeError) as exc:
            logger.warning("Invalid Azure DevOps response; payload withheld.")
            raise HTTPException(502, "Azure DevOps returned invalid data. No data was imported.") from exc

    def projects(self, organization, cursor=""):
        payload, headers = self._read(organization, "projects", params={"$top": 50, "continuationToken": cursor})
        try:
            values = payload["value"]
            if not isinstance(values, list) or len(values) > 50:
                raise ValueError("Invalid project page.")
            projects = [{"id": Connection(organization=organization, project_id=row["id"],
                                         project_name=row["name"]).project_id, "name": row["name"]} for row in values]
            cursor = headers.get("x-ms-continuationtoken", "")
            if len(cursor) > 4096:
                raise ValueError("Invalid cursor.")
            return {"items": projects, "next_cursor": cursor}
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Invalid Azure DevOps project list; payload withheld.")
            raise HTTPException(502, "Azure DevOps returned an invalid project list.") from exc

    def connection(self, organization, project_id):
        payload, _ = self._read(organization, "project", project=project_id)
        try:
            connection = Connection(organization=organization, project_id=payload["id"], project_name=payload["name"])
            if connection.project_id != project_id:
                raise ValueError("Project mismatch.")
            return connection
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Invalid Azure DevOps project response; payload withheld.")
            raise HTTPException(502, "Azure DevOps returned invalid project metadata.") from exc

    def items(self, connection, ids):
        if not ids:
            return []
        if len(ids) > 50 or len(set(ids)) != len(ids) or any(type(value) is not int or value <= 0 for value in ids):
            raise ValueError("Invalid work-item selection.")
        fields = ["System.Id", "System.Title", "System.Description", "System.State",
                  "System.WorkItemType", "System.TeamProject", "System.ChangedDate"]
        payload, _ = self._read(connection.organization, "items", project=connection.project_id,
                                params={"ids": ",".join(map(str, ids)), "fields": ",".join(fields)})
        try:
            rows = payload["value"]
            if not isinstance(rows, list) or len(rows) != len(ids):
                raise ValueError("Incomplete source response.")
            result = []
            for row in rows:
                values = row["fields"]
                if values["System.TeamProject"].casefold() != connection.project_name.casefold():
                    raise ValueError("Source belongs to another project.")
                description = values.get("System.Description", "")
                if not isinstance(description, str) or len(description) > 32000:
                    raise ValueError("Description exceeds safe limits.")
                parser = PlainText()
                parser.feed(description)
                item = Item(id=row["id"], revision=row["rev"], organization=connection.organization,
                            project_id=connection.project_id, project_name=connection.project_name,
                            title=values["System.Title"], description="".join(parser.parts).strip(),
                            item_type=values["System.WorkItemType"], state=values["System.State"],
                            changed_at=values["System.ChangedDate"],
                            source_url=f"https://dev.azure.com/{connection.organization}/{connection.project_id}/_workitems/edit/{row['id']}")
                item.content_digest = digest(item.model_dump(mode="json", exclude={"content_digest"}))
                result.append(item)
            if {item.id for item in result} != set(ids):
                raise ValueError("Source selection mismatch.")
            return sorted(result, key=lambda item: ids.index(item.id))
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            logger.warning("Invalid Azure DevOps source snapshot; payload withheld.")
            raise HTTPException(502, "Azure DevOps sources are incomplete, changed project, or exceed safe limits. No data was imported.") from exc

    def browse(self, connection, before=None):
        boundary = f" AND [System.Id] < {before}" if before is not None else ""
        if before is not None and (type(before) is not int or before <= 0):
            raise ValueError("Invalid work-item cursor.")
        payload, _ = self._read(connection.organization, "query", project=connection.project_id,
                                params={"$top": 50},
                                body={"query": "SELECT [System.Id] FROM WorkItems WHERE "
                                      "[System.TeamProject] = @project" + boundary + " ORDER BY [System.Id] DESC"})
        try:
            rows = payload["workItems"]
            if not isinstance(rows, list) or len(rows) > 50:
                raise ValueError("Invalid source page.")
            ids = [row["id"] for row in rows]
            if any(type(value) is not int or value <= 0 or (before is not None and value >= before) for value in ids):
                raise ValueError("Invalid source cursor result.")
            if ids != sorted(set(ids), reverse=True):
                raise ValueError("Unordered source result.")
            return {"items": [item.model_dump(mode="json") for item in self.items(connection, ids)],
                    "next_before": ids[-1] if len(ids) == 50 else None}
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Invalid Azure DevOps work-item page; payload withheld.")
            raise HTTPException(502, "Azure DevOps returned an invalid work-item page.") from exc


store = Store()

"""Organization membership is authoritative; workspace headers only select a scope."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import logging
import re
import sqlite3
from typing import Literal
from uuid import uuid4

from azure.core.exceptions import AzureError
from azure.cosmos import exceptions
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, computed_field, model_validator

from app.database.decision_archive import LocalDecisionArchive
from app.security.auth import principal_context
from app.utils.errors import ConcurrentUpdate, DependencyUnavailable, InvalidDependencyResponse
from app.utils.models import SessionId
from app.utils.runtime import demo_mode

logger = logging.getLogger(__name__)
TeamRole = Literal["contributor", "reviewer", "viewer"]
Action = Literal["read", "write", "review", "delete"]


@dataclass(frozen=True)
class Workspace:
    organization_id: str = ""
    team_id: str = ""


workspace_context: ContextVar[Workspace] = ContextVar("workspace", default=Workspace())


class DirectoryRecord(BaseModel):
    id: str
    organization_id: SessionId
    document_type: Literal["organization", "team", "org_member", "team_member", "invite"]
    name: str = ""
    identity_id: str = ""
    team_id: str = ""
    role: Literal["owner", "admin", "member"] = "member"
    roles: list[TeamRole] = Field(default_factory=list)
    active: bool = True
    generation: str = ""
    invite_id: str = ""
    expires_at: str = ""
    max_uses: int = Field(default=0, ge=0, le=100)
    uses: int = Field(default=0, ge=0, le=100)
    version: str = ""
    schema_version: Literal[1] = 1

    @computed_field
    @property
    def directory_key(self) -> str:
        return f"{self.organization_id}:{self.id}"

    @model_validator(mode="after")
    def valid_record(self):
        expected = {
            "organization": "organization",
            "team": f"team-{self.team_id}",
            "org_member": f"member-{self.identity_id}",
            "team_member": f"grant-{self.team_id}-{self.identity_id}",
            "invite": f"invite-{self.invite_id}",
        }[self.document_type]
        if self.id != expected or (
            self.document_type in ("org_member", "team_member") and (not self.identity_id or not self.generation)
        ) or (self.document_type in ("team", "team_member") and not self.team_id) or (
            self.document_type == "invite" and (
                not re.fullmatch(r"[a-f0-9]{64}", self.invite_id) or not self.identity_id or self.role == "owner"
                or not self.expires_at or self.max_uses < 1 or bool(self.team_id) != bool(self.roles))
        ):
            raise ValueError("Directory record metadata is inconsistent.")
        return self


def not_found():
    raise HTTPException(404, "Organization, team, or membership not found.")


class TenantDirectory:
    def __init__(self):
        self.use_mock = demo_mode()
        self.container = None
        self.archive = LocalDecisionArchive()

    def _container(self):
        if self.container is None:
            from app.database.cosmos_client import db_client
            db_client._get_container()
            self.container = db_client.database.get_container_client("directory")
        return self.container

    @property
    def path(self):
        return self.archive.path.with_name(self.archive.path.stem + ".tenants.sqlite3")

    @contextmanager
    def connection(self):
        connection = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.path, timeout=5)
            connection.execute("PRAGMA secure_delete=ON")
            connection.execute("CREATE TABLE IF NOT EXISTS directory ("
                               "organization TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, "
                               "identity TEXT NOT NULL, record TEXT NOT NULL, version TEXT NOT NULL, "
                               "PRIMARY KEY(organization, id))")
            connection.execute("CREATE INDEX IF NOT EXISTS directory_identity ON directory(identity, kind, organization)")
            with connection:
                yield connection
        except (sqlite3.Error, OSError) as exc:
            logger.error("Tenant directory failed; dependency details withheld.")
            raise DependencyUnavailable("tenant_directory") from exc
        finally:
            if connection is not None:
                connection.close()

    @staticmethod
    def decode(data, organization="", record_id=""):
        try:
            record = DirectoryRecord.model_validate(data)
            if (not record.version or (organization and record.organization_id != organization)
                    or (record_id and record.id != record_id)):
                raise ValueError("Missing directory version.")
            return record
        except (ValidationError, ValueError) as exc:
            logger.error("Invalid tenant directory record; payload withheld.")
            raise InvalidDependencyResponse("tenant_directory") from exc

    def get(self, organization: str, record_id: str) -> DirectoryRecord | None:
        if self.use_mock:
            with self.connection() as connection:
                row = connection.execute("SELECT record FROM directory WHERE organization=? AND id=?",
                                         (organization, record_id)).fetchone()
            if not row:
                return None
            try:
                return self.decode(DirectoryRecord.model_validate_json(row[0]).model_dump(), organization, record_id)
            except ValidationError as exc:
                logger.error("Invalid stored tenant directory JSON; payload withheld.")
                raise InvalidDependencyResponse("tenant_directory") from exc
        try:
            data = self._container().read_item(item=record_id, partition_key=organization)
            return self.decode({**data, "version": data.get("_etag", "")}, organization, record_id)
        except exceptions.CosmosResourceNotFoundError:
            self.check_ready()
            return None
        except (AzureError, OSError) as exc:
            logger.error("Tenant directory read failed; dependency details withheld.")
            raise DependencyUnavailable("tenant_directory") from exc

    def write(self, records: list[DirectoryRecord]):
        if self.use_mock:
            with self.connection() as connection:
                for record in records:
                    previous = record.version
                    updated = record.model_copy(update={"version": str(uuid4())})
                    if previous:
                        changed = connection.execute(
                            "UPDATE directory SET kind=?, identity=?, record=?, version=? "
                            "WHERE organization=? AND id=? AND version=?",
                            (record.document_type, record.identity_id, updated.model_dump_json(), updated.version,
                             record.organization_id, record.id, previous)).rowcount
                        if not changed:
                            raise ConcurrentUpdate()
                    else:
                        try:
                            connection.execute("INSERT INTO directory VALUES (?, ?, ?, ?, ?, ?)", (
                                record.organization_id, record.id, record.document_type, record.identity_id,
                                updated.model_dump_json(), updated.version))
                        except sqlite3.IntegrityError as exc:
                            raise ConcurrentUpdate() from exc
            return
        operations = [
            ("replace", (record.id, record.model_dump(exclude={"version"})), {"if_match_etag": record.version})
            if record.version else ("create", (record.model_dump(exclude={"version"}),))
            for record in records
        ]
        try:
            self._container().execute_item_batch(operations, partition_key=records[0].organization_id)
        except (exceptions.CosmosHttpResponseError, exceptions.CosmosBatchOperationError) as exc:
            if exc.status_code in (404, 409, 412):
                raise ConcurrentUpdate() from exc
            logger.error("Tenant directory write failed; dependency details withheld.")
            raise DependencyUnavailable("tenant_directory") from exc
        except (AzureError, OSError) as exc:
            logger.error("Tenant directory write failed; dependency details withheld.")
            raise DependencyUnavailable("tenant_directory") from exc

    def page(self, kind: str, *, organization: str = "", identity: str = "", team: str = "",
             cursor: str = "", limit: int = 50):
        if self.use_mock:
            with self.connection() as connection:
                rows = connection.execute(
                    "SELECT record FROM directory WHERE kind=? AND (?='' OR organization=?) "
                    "AND (?='' OR identity=?) AND (?='' OR json_extract(record, '$.team_id')=?) "
                    "AND (organization || ':' || id)>? "
                    "ORDER BY organization, id LIMIT ?",
                    (kind, organization, organization, identity, identity, team, team, cursor, limit + 1)).fetchall()
            try:
                records = [self.decode(DirectoryRecord.model_validate_json(row[0]).model_dump()) for row in rows]
            except ValidationError as exc:
                logger.error("Invalid tenant directory page; payload withheld.")
                raise InvalidDependencyResponse("tenant_directory") from exc
        else:
            try:
                kwargs = {"partition_key": organization} if organization else {"enable_cross_partition_query": True}
                rows = self._container().query_items(
                    query=f"SELECT TOP {limit + 1} * FROM c WHERE c.document_type=@kind "
                    "AND (@identity='' OR c.identity_id=@identity) AND (@team='' OR c.team_id=@team) "
                    "AND c.directory_key>@cursor "
                    "ORDER BY c.directory_key",
                    parameters=[{"name": "@kind", "value": kind}, {"name": "@identity", "value": identity},
                                {"name": "@team", "value": team},
                                {"name": "@cursor", "value": cursor}], **kwargs)
                records = [self.decode({**row, "version": row.get("_etag", "")}) for row in rows]
            except (AzureError, OSError) as exc:
                logger.error("Tenant directory listing failed; dependency details withheld.")
                raise DependencyUnavailable("tenant_directory") from exc
        return records[:limit], (
            f"{records[limit - 1].organization_id}:{records[limit - 1].id}" if len(records) > limit else None)

    def membership(self, organization: str) -> DirectoryRecord:
        member = self.get(organization, f"member-{principal_context.get().owner_id}")
        if not member or not member.active:
            not_found()
        return member

    def require_admin(self, organization: str):
        member = self.membership(organization)
        if member.role not in ("owner", "admin"):
            raise HTTPException(403, "Organization owner or administrator access is required.")
        return member

    def permissions(self, organization: str, team: str) -> set[str]:
        member = self.membership(organization)
        team_record = self.get(organization, f"team-{team}")
        if not team_record or not team_record.active:
            not_found()
        grant = self.get(organization, f"grant-{team}-{member.identity_id}")
        roles = set(grant.roles) if grant and grant.active and grant.generation == member.generation else set()
        permissions = {"read", "write", "delete"} if member.role in ("owner", "admin") else set()
        if roles:
            permissions.add("read")
        if "contributor" in roles:
            permissions.add("write")
        if "reviewer" in roles:
            permissions.add("review")
        if not permissions:
            not_found()
        return permissions

    def require(self, organization: str, team: str, action: Action):
        if action not in self.permissions(organization, team):
            raise HTTPException(403, f"Team workflow {action} permission is required.")

    def check_ready(self):
        if self.use_mock:
            with self.connection() as connection:
                connection.execute("SELECT 1").fetchone()
            return
        try:
            properties = self._container().read()
            if properties.get("partitionKey", {}).get("paths") != ["/organization_id"]:
                logger.error("Directory container requires partition key /organization_id.")
                raise DependencyUnavailable("tenant_directory")
            if properties.get("defaultTtl") not in (None, -1):
                logger.error("Directory records must not have automatic expiry.")
                raise DependencyUnavailable("tenant_directory")
        except (AzureError, OSError) as exc:
            logger.error("Tenant directory readiness failed; dependency details withheld.")
            raise DependencyUnavailable("tenant_directory") from exc


tenant_directory = TenantDirectory()

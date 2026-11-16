"""Local-only Azure DevOps simulator. No credentials, network calls or external writes."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import sqlite3
from threading import RLock
from typing import Callable, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.database.decision_archive import LocalDecisionArchive
from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.models import DiscoveryEngagement, DiscoverySource, WorkflowState

logger = logging.getLogger(__name__)
ProjectId = Literal["operations", "platform"]
ItemType = Literal["Bug", "User Story", "Task"]
PROJECTS = [{"id": "operations", "name": "Fictional Operations"},
            {"id": "platform", "name": "Fictional Platform"}]


def now() -> datetime:
    return datetime.now(timezone.utc)


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Connection(Model):
    project: ProjectId
    item_types: list[ItemType] = Field(min_length=1, max_length=3)
    revision: str


class WorkItem(Model):
    id: int
    project: ProjectId
    item_type: ItemType
    title: str
    description: str
    state: str
    revision: int
    source_url: str
    source_updated_at: str


class ImportedItem(WorkItem):
    imported_at: datetime
    imported_by: str
    content_digest: str


class PlanItem(Model):
    item_type: Literal["Epic", "Feature", "Task"]
    title: str
    description: str
    parent_index: int | None = None


class Preview(Model):
    id: str
    actor: str
    project: ProjectId
    connection_revision: str
    assessment_id: str
    analysis_id: str
    source_version: str
    expires_at: datetime
    items: list[PlanItem]
    digest: str = ""


class CreatedItem(PlanItem):
    id: int
    parent_id: int | None
    source_url: str
    state: Literal["New"] = "New"


class Receipt(Model):
    preview_id: str
    digest: str
    assessment_id: str
    analysis_id: str
    project: ProjectId
    confirmed_by: str
    confirmed_at: datetime
    items: list[CreatedItem]


class AuditEvent(Model):
    action: str
    actor: str
    at: datetime
    detail: str


class DiscoveryPreview(Model):
    id: str
    actor: str
    project: ProjectId
    connection_revision: str
    item_ids: list[int]
    imports_digest: str
    expires_at: datetime
    engagement: DiscoveryEngagement
    sources: list[DiscoverySource]
    digest: str = ""


class DiscoveryReceipt(Model):
    preview: DiscoveryPreview
    engagement_id: str
    confirmed_at: datetime
    expires_at: datetime
    status: Literal["pending", "completed"] = "pending"


class SimulatorState(Model):
    version: str = ""
    expires_at: datetime = Field(default_factory=lambda: now() + timedelta(days=30))
    connection: Connection | None = None
    imported: list[ImportedItem] = Field(default_factory=list, max_length=20)
    preview: Preview | None = None
    receipts: list[Receipt] = Field(default_factory=list, max_length=20)
    discovery_preview: DiscoveryPreview | None = None
    discovery_receipts: list[DiscoveryReceipt] = Field(default_factory=list, max_length=20)
    audit: list[AuditEvent] = Field(default_factory=list, max_length=100)


def source_url(project: str, item_id: int) -> str:
    return f"https://dev.azure.example/fictional/{project}/_workitems/edit/{item_id}"


def fixture_items() -> list[WorkItem]:
    records = [
        (101, "operations", "User Story", "Reduce repeated access-request triage",
         "Fictional team reports repeated request classification. Validate volume and handling effort.", "Active"),
        (102, "operations", "Bug", "Requests arrive without required context",
         "Synthetic example of missing fields. A form change may be better than AI.", "New"),
        (103, "operations", "Task", "Measure the current request-handling baseline",
         "Record active handling time separately from elapsed ticket duration.", "Closed"),
        (201, "platform", "User Story", "Review knowledge lookup workflow",
         "Fictional knowledge sources need access and freshness checks before a pilot.", "Active"),
        (202, "platform", "Bug", "Outdated onboarding instructions",
         "Improve source ownership and document maintenance before considering automation.", "New"),
        (203, "platform", "Task", "Document deployment approval boundaries",
         "Human authorization and operational ownership remain explicit.", "Closed"),
    ]
    return [WorkItem(id=item_id, project=project, item_type=kind, title=title,
                     description=description, state=state, revision=1,
                     source_url=source_url(project, item_id), source_updated_at="2026-11-01T10:00:00Z")
            for item_id, project, kind, title, description, state in records]


def available_items(connection: Connection | None) -> list[WorkItem]:
    return [item for item in fixture_items() if connection and item.project == connection.project
            and item.item_type in connection.item_types]


def handoff_plan(state: WorkflowState) -> list[PlanItem]:
    name = state.workflow_intelligence.workflow_name if state.workflow_intelligence else state.enterprise_context.business_domain
    pilot = state.readiness_assessment.pilot
    provenance = (f"SIMULATOR ONLY. Assessment {state.session_id}; analysis {state.analysis_id}. "
                  "Advisory assessment approval is not execution authority. No real Azure DevOps record is created.")
    items = [
        PlanItem(item_type="Epic", title=f"Validate: {name or 'Reviewed workflow'}",
                 description=f"{provenance}\nScope: {pilot.scope or 'Scope requires owner validation.'}"),
        PlanItem(item_type="Feature", title="Validate prerequisites and human boundaries",
                 description=f"{provenance}\n{pilot.authorization_boundaries or 'Confirm authorization boundaries before implementation.'}",
                 parent_index=0),
    ]
    for check in state.readiness_assessment.checks[:3]:
        items.append(PlanItem(item_type="Task", title=f"Validate {check.id.replace('_', ' ')}",
                              description=f"{provenance}\nStatus: {check.status}. "
                              f"{check.next_action or 'Confirm evidence, owner and completion criteria.'}", parent_index=1))
    items.append(PlanItem(item_type="Task", title="Measure results and review the next decision",
                          description=f"{provenance}\nSuccess metrics: {pilot.success_metrics or 'Define a measured baseline and success criteria.'}"
                          f"\nFailure handling: {pilot.failure_handling or 'Define stop and escalation conditions.'}", parent_index=0))
    return items


def discovery_draft(project: ProjectId) -> DiscoveryEngagement:
    name = next(item["name"] for item in PROJECTS if item["id"] == project)
    return DiscoveryEngagement(
        title=f"Discovery: {name} imported work",
        objective="Investigate the problems recorded in the selected synthetic work items. "
                  "Validate the current process with stakeholders; ticket text is not proof of process facts or AI value.",
        business_units=f"Unknown; validate the business units behind the fictional {project} project.",
        sponsor="Unknown; nominate a sponsor.",
        engagement_owner="Unknown; nominate an engagement owner.",
        required_topics="Which selected problems recur, and why? Who owns the process and its decisions? "
                        "What volume, active handling time and exception baseline can be measured? "
                        "What access, data quality and privacy constraints apply? "
                        "Compare doing nothing, process improvement, conventional automation, AI assistance and hybrid options.",
        excluded_topics="Implementation, external writes and financial or operational execution are not authorized. "
                        "No savings, owners, deadlines or verified process steps are inferred.",
        success_measures="Unknown; collect a measured baseline and agree success criteria with the process owner.",
        playbook_id="workflow_opportunity",
    )


def discovery_import_sources(items: list[ImportedItem]) -> list[DiscoverySource]:
    return [DiscoverySource(
        id=f"connector.azure_devops.{item.project}.{item.id}.r{item.revision}",
        label=f"SIMULATOR Azure DevOps #{item.id}: {item.title}; synthetic, unverified",
        statement=json.dumps(item.model_dump(mode="json"), sort_keys=True, indent=2),
        source_reference=item.source_url,
    ) for item in items]


class SimulatorStore:
    def __init__(self):
        self.lock = RLock()

    @property
    def path(self):
        archive = LocalDecisionArchive().path
        return archive.with_name(archive.stem + ".integrations.sqlite3")

    @contextmanager
    def connection(self):
        with self.lock:
            with self._connection() as connection:
                yield connection

    @contextmanager
    def _connection(self):
        connection = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.path, timeout=5)
            connection.execute("PRAGMA secure_delete=ON")
            connection.execute("CREATE TABLE IF NOT EXISTS ado_simulator ("
                               "scope TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at TEXT NOT NULL)")
            with connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute("DELETE FROM ado_simulator WHERE expires_at <= ?", (now().isoformat(),))
                yield connection
        except (sqlite3.Error, OSError) as exc:
            logger.error("Integration simulator storage failed; details withheld.")
            raise DependencyUnavailable("integration_simulator") from exc
        finally:
            if connection is not None:
                connection.close()

    @staticmethod
    def decode(connection, scope: str) -> SimulatorState:
        row = connection.execute("SELECT payload FROM ado_simulator WHERE scope=?", (scope,)).fetchone()
        if not row:
            return SimulatorState()
        try:
            return SimulatorState.model_validate_json(row[0])
        except ValidationError as exc:
            logger.error("Invalid integration simulator record; payload withheld.")
            raise InvalidDependencyResponse("integration_simulator") from exc

    def read(self, scope: str) -> SimulatorState:
        with self.connection() as connection:
            return self.decode(connection, scope)

    def update(self, scope: str, change: Callable[[SimulatorState], None]) -> SimulatorState:
        with self.connection() as connection:
            state = self.decode(connection, scope)
            change(state)
            state.version = str(uuid4())
            connection.execute("INSERT INTO ado_simulator VALUES (?, ?, ?) "
                               "ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at",
                               (scope, state.model_dump_json(), state.expires_at.isoformat()))
            return state


simulator_store = SimulatorStore()

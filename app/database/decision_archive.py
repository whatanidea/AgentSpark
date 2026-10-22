"""Owner-scoped decision snapshots; local demo uses SQLite, live uses Cosmos batches."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, ValidationInfo, field_validator, model_validator

from app.utils.errors import DependencyUnavailable, InvalidDependencyResponse
from app.utils.models import SessionId, WorkflowState

logger = logging.getLogger(__name__)
HomeStatus = Literal["draft", "pending_review", "approved", "rejected"]


def timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


class HomeItem(BaseModel):
    owner_id: str = Field(default="", exclude=True)
    kind: Literal["session", "decision"]
    session_id: SessionId
    analysis_id: SessionId | None = None
    title: str
    domain: str
    status: HomeStatus
    score: int | None = None
    updated_at: str
    expires_at: str
    sort_key: str
    legacy: bool = False
    organization_id: SessionId | None = None
    team_id: SessionId | None = None

    @field_validator("expires_at", "updated_at")
    @classmethod
    def valid_timestamp(cls, value: str, info: ValidationInfo):
        if info.field_name == "updated_at" and not value:
            return value
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError("An absolute timestamp is required.")
        return timestamp(parsed)


class DecisionRecord(BaseModel):
    id: str
    document_type: Literal["decision_archive"] = "decision_archive"
    schema_version: Literal[1] = 1
    session_id: SessionId
    owner_id: str
    organization_id: SessionId | None = None
    team_id: SessionId | None = None
    home: HomeItem
    details: dict[str, Any]
    ttl: int
    home_visible: bool = True

    @model_validator(mode="after")
    def valid_snapshot(self):
        if (not self.owner_id or self.home.kind != "decision" or not self.home.analysis_id
                or self.home.status not in ("approved", "rejected")
                or self.id != f"decision-{self.home.analysis_id}"
                or self.session_id != self.home.session_id or self.ttl <= 0
                or bool(self.organization_id) != bool(self.team_id)
                or self.organization_id != self.home.organization_id or self.team_id != self.home.team_id):
            raise ValueError("Decision snapshot metadata is inconsistent.")
        self.home.owner_id = self.owner_id
        return self


def summary(state: WorkflowState, now: datetime, *, archived: bool = False,
            expires_at: datetime | None = None, legacy: bool = False) -> HomeItem:
    status: HomeStatus = ("approved" if state.status == "completed" else "rejected" if state.status == "rejected"
                         else "pending_review" if state.status == "awaiting_human_review" else "draft")
    return HomeItem(
        owner_id=state.owner_id,
        kind="decision" if archived else "session", session_id=state.session_id,
        analysis_id=state.analysis_id,
        title=state.workflow_intelligence.workflow_name if state.workflow_intelligence
        else state.enterprise_context.business_domain or "Untitled workflow",
        domain=state.enterprise_context.business_domain, status=status,
        score=state.suitability_score.agent_score if state.suitability_score else None,
        updated_at=timestamp(now), expires_at=timestamp(expires_at or state.expires_at),
        sort_key=f"{timestamp(now)}_{state.session_id}_{state.analysis_id or 'draft'}",
        legacy=legacy,
        organization_id=state.organization_id, team_id=state.team_id,
    )


def decision_record(state: WorkflowState, now: datetime, retention_days: int) -> DecisionRecord:
    blueprint = state.blueprint or {}
    return DecisionRecord(
        id=f"decision-{state.analysis_id}", session_id=state.session_id, owner_id=state.owner_id,
        organization_id=state.organization_id, team_id=state.team_id,
        home=summary(state, now, archived=True, expires_at=now + timedelta(days=retention_days)),
        details={
            "deployment_preferences": {key: getattr(state.enterprise_context, key) for key in (
                "target_cloud", "preferred_region", "data_residency_requirements", "deployment_constraints")},
            "cloud_mapping": state.cloud_mapping or state.azure_mapping,
            "workflow_intelligence": state.workflow_intelligence.model_dump(mode="json") if state.workflow_intelligence else None,
            "suitability_score": state.suitability_score.model_dump(mode="json") if state.suitability_score else None,
            "governance": state.governance,
            "human_review": state.human_review.model_dump(mode="json") if state.human_review else None,
            "roi": state.roi, "retrieved_patterns": state.retrieved_patterns,
            "architecture_doc": blueprint.get("architecture_doc", ""),
            "cost_estimate": blueprint.get("cost_estimate", ""),
            "roadmap": blueprint.get("roadmap", ""),
        },
        ttl=retention_days * 86400,
    )


def decode_record(data: dict) -> DecisionRecord:
    try:
        return DecisionRecord.model_validate(data)
    except ValidationError as exc:
        logger.error("Decision snapshot is invalid; payload withheld.")
        raise InvalidDependencyResponse("decision_archive") from exc


def stored_record(value: str) -> DecisionRecord:
    try:
        return decode_record(json.loads(value))
    except json.JSONDecodeError as exc:
        logger.error("Stored decision JSON is invalid; payload withheld.")
        raise InvalidDependencyResponse("decision_archive") from exc


def archive_scope(owner: str, organization: str | None = None, team: str | None = None) -> str:
    return f"team:{organization}:{team}" if organization and team else owner


class LocalDecisionArchive:
    def __init__(self):
        self.retention_days = int(os.getenv("DECISION_ARCHIVE_RETENTION_DAYS", "30"))
        if not 1 <= self.retention_days <= 3650:
            raise ValueError("DECISION_ARCHIVE_RETENTION_DAYS must be between 1 and 3650.")
        self._configured_path = os.getenv("DEMO_ARCHIVE_PATH")

    @property
    def path(self) -> Path:
        if self._configured_path:
            return Path(self._configured_path)
        try:
            return Path.home() / ".agentspark" / "decisions.sqlite3"
        except RuntimeError as exc:
            logger.error("Set DEMO_ARCHIVE_PATH when a local home directory is unavailable.")
            raise DependencyUnavailable("decision_archive") from exc

    @contextmanager
    def connection(self):
        connection = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.path, timeout=5)
            connection.execute("PRAGMA secure_delete=ON")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS decisions (owner TEXT NOT NULL, session TEXT NOT NULL, "
                "analysis TEXT NOT NULL, sort_key TEXT NOT NULL, expires TEXT NOT NULL, "
                "status TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(owner, session, analysis))")
            connection.execute("CREATE INDEX IF NOT EXISTS decisions_owner_order ON decisions(owner, sort_key DESC)")
            connection.execute("DELETE FROM decisions WHERE expires <= ?", (timestamp(datetime.now(timezone.utc)),))
            with connection:
                yield connection
        except (sqlite3.Error, OSError) as exc:
            logger.error("Local decision archive failed; dependency details withheld.")
            raise DependencyUnavailable("decision_archive") from exc
        finally:
            if connection is not None:
                connection.close()

    def check_ready(self):
        with self.connection() as connection:
            connection.execute("SELECT 1").fetchone()

    def put(self, record: DecisionRecord):
        with self.connection() as connection:
            connection.execute("INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?)", (
                archive_scope(record.owner_id, record.organization_id, record.team_id),
                record.session_id, record.home.analysis_id, record.home.sort_key,
                record.home.expires_at, record.home.status, record.model_dump_json(),
            ))

    def get(self, owner: str, session: str, analysis: str) -> DecisionRecord | None:
        with self.connection() as connection:
            row = connection.execute("SELECT record FROM decisions WHERE owner=? AND session=? AND analysis=?",
                                     (owner, session, analysis)).fetchone()
        return stored_record(row[0]) if row else None

    def page(self, owner: str, status: str, cursor: str, limit: int) -> list[HomeItem]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT record FROM decisions WHERE owner=? AND (?='all' OR status=?) "
                "AND (?='' OR sort_key < ?) ORDER BY sort_key DESC LIMIT ?",
                (owner, status, status, cursor, cursor, limit),
            ).fetchall()
        return [stored_record(row[0]).home for row in rows]

    def delete_session(self, owner: str, session: str):
        with self.connection() as connection:
            return connection.execute("DELETE FROM decisions WHERE owner=? AND session=?", (owner, session)).rowcount

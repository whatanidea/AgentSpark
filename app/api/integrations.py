"""Workspace-scoped, local-only Azure DevOps import and delivery-handoff simulator."""
import os
from datetime import timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

from app.database.cosmos_client import db_client
from app.database.tenant_directory import tenant_directory, workspace_context
from app.integrations.azure_devops import (
    PROJECTS, AuditEvent, Connection, CreatedItem, DiscoveryPreview, DiscoveryReceipt, ImportedItem, ItemType, Preview,
    ProjectId, Receipt, SimulatorState, available_items, digest, discovery_draft, discovery_import_sources,
    handoff_plan, now, simulator_store, source_url,
)
from app.security import auth
from app.api.discovery import safe_payload
from app.utils.discovery import RETENTION_DAYS
from app.utils.errors import WorkflowNotFound
from app.utils.models import SessionId, WorkflowState
from app.utils.runtime import demo_mode

router = APIRouter(prefix="/integrations/azure-devops")


class VersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(max_length=100)


class ConfigureRequest(VersionRequest):
    project: ProjectId
    item_types: list[ItemType] = Field(min_length=1, max_length=3)

    @field_validator("item_types")
    @classmethod
    def unique_types(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Work-item types must be unique.")
        return value


class ImportRequest(VersionRequest):
    item_ids: list[Annotated[int, Field(strict=True, gt=0)]] = Field(min_length=1, max_length=20)

    @field_validator("item_ids")
    @classmethod
    def unique_ids(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Select each source work item only once.")
        return value


class PreviewRequest(VersionRequest):
    assessment_id: SessionId


class DiscoveryBrief(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(min_length=1, max_length=2000)
    business_units: str = Field(min_length=1, max_length=1000)
    sponsor: str = Field(min_length=1, max_length=200)
    engagement_owner: str = Field(min_length=1, max_length=200)
    required_topics: str = Field(max_length=2000)
    excluded_topics: str = Field(max_length=2000)
    success_measures: str = Field(max_length=1000)


class ReviseDiscoveryRequest(VersionRequest):
    preview_id: SessionId
    brief: DiscoveryBrief


class ConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preview_id: SessionId
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    confirmed: StrictBool

    @field_validator("confirmed")
    @classmethod
    def explicit_confirmation(cls, value):
        if not value:
            raise ValueError("Explicit confirmation is required.")
        return value


def scope(action="read") -> tuple[str, dict[str, bool]]:
    if not demo_mode() or auth.auth_settings.mode != "local-demo" or os.getenv("ENVIRONMENT", "").lower() == "production":
        raise HTTPException(404, "The Azure DevOps simulator is available only in local demo mode.")
    workspace = workspace_context.get()
    if workspace.organization_id:
        allowed = tenant_directory.permissions(workspace.organization_id, workspace.team_id)
        member = tenant_directory.membership(workspace.organization_id)
        manage = member.role in ("owner", "admin")
        key = f"team:{workspace.organization_id}:{workspace.team_id}"
    else:
        allowed = {"read", "write"}
        manage = True
        key = f"personal:{auth.principal_context.get().owner_id}"
    permissions = {"read": "read" in allowed, "write": "write" in allowed, "manage": manage}
    if not permissions.get(action):
        raise HTTPException(403, f"Integration {action} permission is required.")
    return key, permissions


def current(state: SimulatorState, version: str):
    if state.version != version:
        raise HTTPException(409, "Integration data changed. Refresh and review it before retrying.")


def event(state: SimulatorState, action: str, detail: str):
    if len(state.audit) >= 100:
        raise HTTPException(409, "Simulator activity limit reached. Reset the simulator to continue.")
    state.audit.append(AuditEvent(action=action, actor=auth.principal_context.get().owner_id,
                                  at=now(), detail=detail))


def expose(state: SimulatorState, permissions):
    return {"mode": "simulator", "external_connection": False, "projects": PROJECTS,
            "identity_id": auth.principal_context.get().owner_id,
            "can_confirm": bool(state.preview and state.preview.actor == auth.principal_context.get().owner_id),
            "can_confirm_discovery": bool(state.discovery_preview and
                                         state.discovery_preview.actor == auth.principal_context.get().owner_id),
            "permissions": permissions, **state.model_dump(mode="json"),
            "available_items": [item.model_dump(mode="json") for item in available_items(state.connection)]}


def assessment(assessment_id):
    state = db_client.get_workflow_state(assessment_id)
    if state.status != "completed" or not state.analysis_id or (state.human_review and (
        state.human_review.decision != "approve" or state.human_review.analysis_id != state.analysis_id
    )):
        raise HTTPException(409, "A current completed, non-rejected assessment is required. Review it in Blueprint & Review.")
    if state.executive_brief and state.executive_brief.decision == "do_not_proceed":
        raise HTTPException(409, "This assessment recommends not proceeding. Delivery handoff is blocked.")
    return state


@router.get("")
def get_integration():
    key, permissions = scope()
    return expose(simulator_store.read(key), permissions)


@router.put("/connection")
def configure(req: ConfigureRequest):
    key, permissions = scope("manage")

    def change(state):
        current(state, req.version)
        state.connection = Connection(project=req.project, item_types=req.item_types, revision=str(uuid4()))
        state.imported = []
        state.preview = None
        state.discovery_preview = None
        event(state, "connection_configured", f"Fictional project {req.project}; imports and pending preview cleared.")

    return expose(simulator_store.update(key, change), permissions)


@router.post("/imports")
def import_items(req: ImportRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        import_snapshots(state, req.item_ids)

    return expose(simulator_store.update(key, change), permissions)


@router.post("/handoff/preview")
def preview_handoff(req: PreviewRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        if not state.connection:
            raise HTTPException(409, "Configure the simulator before preparing a handoff.")
        source = assessment(req.assessment_id)
        if any(receipt.assessment_id == source.session_id and receipt.analysis_id == source.analysis_id
               and receipt.project == state.connection.project for receipt in state.receipts):
            raise HTTPException(409, "This assessment analysis was already handed off to this fictional project.")
        state.preview = Preview(
            id=str(uuid4()), actor=auth.principal_context.get().owner_id, project=state.connection.project,
            connection_revision=state.connection.revision, assessment_id=source.session_id,
            analysis_id=source.analysis_id, source_version=source._etag,
            expires_at=now() + timedelta(minutes=10), items=handoff_plan(source))
        state.preview.digest = digest(state.preview.model_dump(mode="json", exclude={"digest"}))
        event(state, "handoff_previewed", f"Previewed assessment {source.session_id}; no work items created.")

    with db_client._lock:
        return expose(simulator_store.update(key, change), permissions)


@router.post("/handoff/confirm")
def confirm_handoff(req: ConfirmRequest):
    key, permissions = scope("write")

    def change(state):
        actor = auth.principal_context.get().owner_id
        previous = next((receipt for receipt in state.receipts if receipt.preview_id == req.preview_id), None)
        if previous:
            if previous.digest != req.digest or previous.confirmed_by != actor:
                raise HTTPException(409, "Confirmation does not match the recorded handoff.")
            return
        preview = state.preview
        if not preview or preview.id != req.preview_id:
            raise HTTPException(409, "Preview no longer exists. Prepare and review a new handoff.")
        if preview.actor != actor:
            raise HTTPException(403, "Only the preview creator can confirm this handoff.")
        if preview.digest != req.digest or preview.expires_at <= now() or not state.connection or (
            preview.connection_revision != state.connection.revision or preview.project != state.connection.project
        ):
            raise HTTPException(409, "Preview changed or expired. Prepare and review a new handoff.")
        source = assessment(preview.assessment_id)
        if source._etag != preview.source_version or source.analysis_id != preview.analysis_id:
            raise HTTPException(409, "Assessment changed. Prepare and review a new handoff.")
        if len(state.receipts) >= 20:
            raise HTTPException(409, "Simulator handoff limit reached. Reset the simulator to continue.")
        first_id = 10000 + sum(len(receipt.items) for receipt in state.receipts)
        items = [CreatedItem(**item.model_dump(), id=first_id + index,
                             parent_id=first_id + item.parent_index if item.parent_index is not None else None,
                             source_url=source_url(preview.project, first_id + index))
                 for index, item in enumerate(preview.items)]
        state.receipts.append(Receipt(preview_id=preview.id, digest=preview.digest,
                                      assessment_id=preview.assessment_id, analysis_id=preview.analysis_id,
                                      project=preview.project, confirmed_by=actor, confirmed_at=now(), items=items))
        state.preview = None
        event(state, "handoff_confirmed", f"Created {len(items)} local simulated items from assessment {source.session_id}.")

    # Keep the process-local source version stable through the simulated receipt commit.
    with db_client._lock:
        return expose(simulator_store.update(key, change), permissions)


@router.post("/handoff/cancel")
def cancel_handoff(req: VersionRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        if not state.preview:
            raise HTTPException(409, "No pending preview to discard.")
        if state.preview.actor != auth.principal_context.get().owner_id:
            raise HTTPException(403, "Only the preview creator can discard this handoff.")
        state.preview = None
        event(state, "handoff_cancelled", "Discarded the preview without creating work items.")

    return expose(simulator_store.update(key, change), permissions)


def selected_imports(state: SimulatorState, item_ids: list[int]):
    imported = {item.id: item for item in state.imported}
    if not state.connection or not set(item_ids).issubset(imported):
        raise HTTPException(422, "Select saved imported snapshots from this workspace.")
    return [imported[item_id] for item_id in sorted(item_ids)]


def import_snapshots(state: SimulatorState, item_ids: list[int]):
    available = {item.id: item for item in available_items(state.connection)}
    if not set(item_ids).issubset(available):
        raise HTTPException(422, "Select work items from the configured project and allowed types.")
    imported = {item.id: item for item in state.imported}
    for item_id in item_ids:
        item = available[item_id]
        imported[item_id] = ImportedItem(**item.model_dump(), imported_at=now(),
                                        imported_by=auth.principal_context.get().owner_id,
                                        content_digest=digest(item.model_dump()))
    state.imported = list(imported.values())
    state.preview = None
    state.discovery_preview = None
    event(state, "items_imported", f"Imported or refreshed {len(item_ids)} synthetic work-item snapshots.")


def set_discovery_preview(state: SimulatorState, items: list[ImportedItem], engagement=None):
    state.discovery_preview = DiscoveryPreview(
        id=str(uuid4()), actor=auth.principal_context.get().owner_id,
        project=state.connection.project, connection_revision=state.connection.revision,
        item_ids=[item.id for item in items], imports_digest=digest([item.model_dump(mode="json") for item in items]),
        expires_at=now() + timedelta(minutes=10), engagement=safe_payload(
            engagement if engagement is not None else discovery_draft(state.connection.project)),
        sources=[safe_payload(source) for source in discovery_import_sources(items)],
    )
    state.discovery_preview.digest = digest(state.discovery_preview.model_dump(mode="json", exclude={"digest"}))
    event(state, "discovery_previewed", "Prepared a discovery draft from selected synthetic imports; no engagement created.")


@router.post("/discovery/prepare")
def prepare_discovery(req: ImportRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        import_snapshots(state, req.item_ids)
        set_discovery_preview(state, selected_imports(state, req.item_ids))

    return expose(simulator_store.update(key, change), permissions)


@router.post("/discovery/preview")
def preview_discovery(req: ImportRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        set_discovery_preview(state, selected_imports(state, req.item_ids))

    return expose(simulator_store.update(key, change), permissions)


@router.post("/discovery/brief")
def revise_discovery(req: ReviseDiscoveryRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        preview = state.discovery_preview
        if not preview or preview.id != req.preview_id:
            raise HTTPException(409, "Discovery preview no longer exists. Prepare a new draft.")
        if preview.actor != auth.principal_context.get().owner_id:
            raise HTTPException(403, "Only the preview creator can edit this discovery brief.")
        if (preview.expires_at <= now() or not state.connection
                or preview.connection_revision != state.connection.revision):
            raise HTTPException(409, "Discovery preview changed or expired. Prepare a new draft.")
        items = selected_imports(state, preview.item_ids)
        if preview.imports_digest != digest([item.model_dump(mode="json") for item in items]):
            raise HTTPException(409, "Imported snapshots changed. Prepare a new discovery draft.")
        engagement = type(preview.engagement).model_validate({
            **preview.engagement.model_dump(), **req.brief.model_dump(),
        })
        set_discovery_preview(state, items, engagement)

    return expose(simulator_store.update(key, change), permissions)


@router.post("/discovery/cancel")
def cancel_discovery(req: VersionRequest):
    key, permissions = scope("write")

    def change(state):
        current(state, req.version)
        if not state.discovery_preview:
            raise HTTPException(409, "No pending discovery preview to discard.")
        if state.discovery_preview.actor != auth.principal_context.get().owner_id:
            raise HTTPException(403, "Only the preview creator can discard this discovery draft.")
        state.discovery_preview = None
        event(state, "discovery_cancelled", "Discarded the discovery draft without creating an engagement.")

    return expose(simulator_store.update(key, change), permissions)


@router.post("/discovery/confirm")
def confirm_discovery(req: ConfirmRequest):
    key, permissions = scope("write")
    actor = auth.principal_context.get().owner_id

    def reserve(state):
        receipt = next((item for item in state.discovery_receipts if item.preview.id == req.preview_id), None)
        if receipt:
            if receipt.preview.actor != actor:
                raise HTTPException(403, "Only the preview creator can confirm this discovery draft.")
            if receipt.preview.digest != req.digest:
                raise HTTPException(409, "Discovery confirmation does not match the recorded preview.")
            return
        preview = state.discovery_preview
        if not preview or preview.id != req.preview_id:
            raise HTTPException(409, "Discovery preview no longer exists. Prepare a new draft.")
        if preview.actor != actor:
            raise HTTPException(403, "Only the preview creator can confirm this discovery draft.")
        if (preview.digest != req.digest or preview.expires_at <= now() or not state.connection
                or preview.connection_revision != state.connection.revision or preview.project != state.connection.project):
            raise HTTPException(409, "Discovery preview changed or expired. Prepare and review a new draft.")
        items = selected_imports(state, preview.item_ids)
        if preview.imports_digest != digest([item.model_dump(mode="json") for item in items]):
            raise HTTPException(409, "Imported snapshots changed. Prepare and review a new discovery draft.")
        if len(state.discovery_receipts) >= 20:
            raise HTTPException(409, "Simulator discovery limit reached. Reset the simulator to continue.")
        confirmed_at = now()
        receipt = DiscoveryReceipt(preview=preview.model_copy(deep=True), engagement_id=str(uuid4()),
                                   confirmed_at=confirmed_at, expires_at=confirmed_at + timedelta(days=RETENTION_DAYS))
        event(state, "discovery_confirmation_recorded",
              f"Confirmed discovery {receipt.engagement_id} with frozen synthetic sources; creation is recoverable on retry.")
        state.discovery_receipts.append(receipt)
        state.discovery_preview = None

    # Persist the frozen reservation before creating a process-local engagement.
    # A retry recovers an interrupted creation, but never restores a completed/deleted record.
    with db_client._lock, simulator_store.lock:
        reserved = simulator_store.update(key, reserve)
        receipt = next(item for item in reserved.discovery_receipts if item.preview.id == req.preview_id)
        if receipt.expires_at <= now():
            raise HTTPException(409, "The reserved discovery engagement expired; it cannot be restored.")
        try:
            child = db_client.get_workflow_state(receipt.engagement_id, expected_kind="discovery")
        except WorkflowNotFound:
            if receipt.status == "completed":
                raise
            workspace = workspace_context.get()
            child = WorkflowState(
                session_id=receipt.engagement_id, record_kind="discovery", owner_id=actor,
                organization_id=workspace.organization_id or None, team_id=workspace.team_id or None,
                discovery=receipt.preview.engagement.model_copy(deep=True),
                discovery_created_at=receipt.confirmed_at, expires_at=receipt.expires_at,
                discovery_import_id=receipt.preview.id,
                discovery_import_sources=[source.model_copy(deep=True) for source in receipt.preview.sources],
            )
            db_client.save_workflow_state(child)
        if child.discovery_import_id != receipt.preview.id or child.discovery_import_sources != receipt.preview.sources:
            raise HTTPException(409, "Discovery reservation does not match its frozen source provenance.")
        if receipt.status == "pending":
            def complete(state):
                next(item for item in state.discovery_receipts if item.preview.id == req.preview_id).status = "completed"
            reserved = simulator_store.update(key, complete)
        return expose(reserved, permissions)


@router.post("/reset")
def reset(req: VersionRequest):
    key, permissions = scope("manage")

    def change(state):
        current(state, req.version)
        state.connection = None
        state.imported = []
        state.preview = None
        state.receipts = []
        state.discovery_preview = None
        state.discovery_receipts = []
        state.audit = []
        state.expires_at = now() + timedelta(days=30)
        event(state, "simulator_reset", "Deleted local connector snapshots, previews and simulated delivery items.")

    return expose(simulator_store.update(key, change), permissions)

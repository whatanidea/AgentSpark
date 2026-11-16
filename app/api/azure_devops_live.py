"""Authenticated real imports; never creates or updates Azure DevOps records."""
from datetime import timedelta
import json
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import Field, field_validator

from app.api.discovery import safe_payload, validate_content
from app.api.integrations import ConfirmRequest, DiscoveryBrief, VersionRequest
from app.database.cosmos_client import db_client
from app.database.tenant_directory import tenant_directory, workspace_context
from app.integrations.azure_devops_live import (
    Activity, Connection, Creation, ItemId, Model, Organization, Preview, Reader,
    Receipt, State, digest, now, store,
)
from app.security import auth
from app.utils.errors import ConcurrentUpdate, WorkflowNotFound
from app.utils.models import DiscoveryEngagement, DiscoverySource, SessionId, WorkflowState

router = APIRouter(prefix="/connectors/azure-devops")


class ProjectsRequest(Organization):
    cursor: str = Field(default="", max_length=4096)


class ConfigureRequest(Organization):
    version: str = Field(max_length=100)
    project_id: SessionId

    @field_validator("project_id")
    @classmethod
    def project_uuid(cls, value):
        return str(UUID(value))


class PrepareRequest(VersionRequest):
    item_ids: list[ItemId] = Field(min_length=1, max_length=20)

    @field_validator("item_ids")
    @classmethod
    def unique_ids(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("Select each work item only once.")
        return values


class BriefRequest(VersionRequest):
    preview_id: SessionId
    brief: DiscoveryBrief


def scope(action="read"):
    if auth.auth_settings.mode != "oidc":
        raise HTTPException(404, "The real connector requires Microsoft organization sign-in.")
    workspace = workspace_context.get()
    if workspace.organization_id:
        allowed = tenant_directory.permissions(workspace.organization_id, workspace.team_id)
        member = tenant_directory.membership(workspace.organization_id)
        permissions = {"read": "read" in allowed, "write": "write" in allowed,
                       "manage": member.role in ("owner", "admin")}
        key = f"team:{workspace.organization_id}:{workspace.team_id}"
    else:
        permissions = {"read": True, "write": True, "manage": True}
        key = "personal:" + auth.principal_context.get().owner_id
    if not permissions.get(action):
        raise HTTPException(403, f"Connector {action} permission is required.")
    return key, permissions


def reader(value: Annotated[str, Header(alias="X-Azure-DevOps-Token")]):
    if not 20 <= len(value) <= 16384 or any(ord(char) < 33 or ord(char) > 126 for char in value):
        raise HTTPException(422, "Reconnect to Azure DevOps with Microsoft sign-in.")
    return Reader(value)


def current(state, version):
    if state._etag != version:
        raise HTTPException(409, "Connector data changed. Refresh and review it before retrying.")


def record(state, action):
    if len(state.activity) >= 100:
        raise HTTPException(409, "Connector activity limit reached. An administrator must disconnect and clear connector data.")
    state.activity.append(Activity(action=action, actor=auth.principal_context.get().owner_id))


def expose(state, permissions):
    return {"mode": "read-only", "version": state._etag, "permissions": permissions,
            "identity_id": auth.principal_context.get().owner_id,
            "can_edit": bool(state.preview and state.preview.actor == auth.principal_context.get().owner_id),
            **state.model_dump(mode="json")}


def connection(state):
    if not state.connection:
        raise HTTPException(409, "Connect an Azure DevOps organization and project first.")
    return state.connection


def editable(state, preview_id):
    preview = state.preview
    if (not preview or preview.id != preview_id or preview.expires_at <= now()
            or preview.connection_revision != connection(state).revision):
        raise HTTPException(409, "The discovery preview changed or expired. Prepare and review a new brief.")
    if preview.actor != auth.principal_context.get().owner_id:
        raise HTTPException(403, "Only the preview creator may edit or confirm it.")
    return preview


def bind(preview):
    preview.digest = digest(preview.model_dump(mode="json", exclude={"digest"}))
    return preview


@router.get("")
def get_state():
    key, permissions = scope()
    return expose(store.read(key), permissions)


@router.post("/projects")
def projects(req: ProjectsRequest, remote: Annotated[Reader, Depends(reader)]):
    scope("manage")
    return remote.projects(req.organization, req.cursor)


@router.put("/connection")
def configure(req: ConfigureRequest, remote: Annotated[Reader, Depends(reader)]):
    key, permissions = scope("manage")
    state = store.read(key)
    current(state, req.version)
    if state.creation:
        raise HTTPException(409, "Finish the pending discovery creation before changing the connection.")
    selected = remote.connection(req.organization, req.project_id)
    state.connection = selected
    state.preview = None
    record(state, "connection_configured")
    store.save(key, state)
    return expose(state, permissions)


@router.post("/disconnect")
def disconnect(req: VersionRequest):
    key, permissions = scope("manage")
    state = store.read(key)
    current(state, req.version)
    if state.creation:
        raise HTTPException(409, "Finish the pending discovery creation before clearing connector data.")
    cleared = State()
    cleared._etag = state._etag
    record(cleared, "connection_disconnected_and_data_cleared")
    store.save(key, cleared)
    return expose(cleared, permissions)


@router.get("/items")
def items(remote: Annotated[Reader, Depends(reader)], before: Annotated[int | None, Query(gt=0)] = None):
    key, _ = scope()
    result = remote.browse(connection(store.read(key)), before)
    # Even browser-only source listings pass the normal input/privacy screening.
    from app.integrations.azure_devops_live import Item
    result["items"] = [safe_payload(Item.model_validate(item)).model_dump(mode="json") for item in result["items"]]
    return result


@router.post("/discovery/prepare")
def prepare(req: PrepareRequest, remote: Annotated[Reader, Depends(reader)]):
    key, permissions = scope("write")
    state = store.read(key)
    current(state, req.version)
    if state.creation:
        raise HTTPException(409, "Finish the pending discovery creation before preparing another brief.")
    if len(state.receipts) >= 20:
        raise HTTPException(409, "Discovery receipt limit reached. Disconnect and clear connector data to continue; saved engagements are retained.")
    selected = connection(state)
    snapshots = [safe_payload(item) for item in remote.items(selected, req.item_ids)]
    imported_at = now()
    actor = auth.principal_context.get().owner_id
    sources = [safe_payload(DiscoverySource(
        id=f"connector.azure_devops.{item.organization}.{item.project_id}.{item.id}.r{item.revision}",
        label=f"Azure DevOps #{item.id}: {item.title}; imported, process claims unverified",
        source_reference=item.source_url,
        statement=json.dumps({"snapshot": item.model_dump(mode="json"),
                              "imported_by": actor, "imported_at": imported_at.isoformat(),
                              "normalization": "Selected standard fields; description converted to plain text."},
                             sort_keys=True, indent=2),
    )) for item in snapshots]
    project_label = selected.project_name if len(selected.project_name) <= 160 else selected.project_name[:157] + "..."
    engagement = validate_content(DiscoveryEngagement(
        title=f"Discovery: {project_label} work items",
        objective="Investigate the problems in the selected Azure DevOps work items. Validate process facts, ownership and possible improvements with stakeholders.",
        business_units="Unknown; validate the business units in scope.",
        sponsor="Unknown; nominate a sponsor.",
        engagement_owner="Unknown; nominate an engagement owner.",
        required_topics="Validate recurring problems, decision owners, volume, active handling time and exceptions. Compare process improvement, conventional automation, AI assistance and hybrid options.",
        excluded_topics="No external writes or operational execution are authorized. Do not infer savings, verified process steps or AI suitability from ticket text.",
        success_measures="Unknown; measure the baseline and agree success criteria.",
        playbook_id="workflow_opportunity",
    ))
    state.preview = bind(Preview(actor=actor, connection_revision=selected.revision,
                                 engagement=engagement, items=snapshots, sources=sources))
    record(state, "discovery_sources_prepared")
    store.save(key, state)
    return expose(state, permissions)


@router.post("/discovery/brief")
def revise(req: BriefRequest):
    key, permissions = scope("write")
    state = store.read(key)
    current(state, req.version)
    preview = editable(state, req.preview_id)
    preview.engagement = validate_content(DiscoveryEngagement(
        **req.brief.model_dump(), playbook_id="workflow_opportunity"))
    preview.id = str(uuid4())
    preview.expires_at = now() + timedelta(minutes=10)
    bind(preview)
    record(state, "discovery_brief_reviewed")
    store.save(key, state)
    return expose(state, permissions)


@router.post("/discovery/cancel")
def cancel(req: VersionRequest):
    key, permissions = scope("write")
    state = store.read(key)
    current(state, req.version)
    if state.preview:
        editable(state, state.preview.id)
        state.preview = None
        record(state, "discovery_preview_discarded")
        store.save(key, state)
    return expose(state, permissions)


def existing(engagement_id, preview_id):
    saved = db_client.get_workflow_state(engagement_id, expected_kind="discovery")
    if saved.discovery_import_id != preview_id:
        raise HTTPException(409, "The saved discovery does not match this creation receipt.")
    return saved


@router.post("/discovery/confirm")
def confirm(req: ConfirmRequest, remote: Annotated[Reader, Depends(reader)]):
    key, _ = scope("write")
    actor = auth.principal_context.get().owner_id
    state = store.read(key)
    receipt = next((item for item in state.receipts if item.preview_id == req.preview_id), None)
    if receipt:
        if receipt.actor != actor or receipt.digest != req.digest:
            raise HTTPException(403, "This confirmation belongs to another creator or reviewed brief.")
        existing(receipt.engagement_id, receipt.preview_id)
        return {"engagement_id": receipt.engagement_id}
    if state.creation:
        reserved = state.creation
        if reserved.preview.id != req.preview_id or reserved.preview.actor != actor or reserved.preview.digest != req.digest:
            raise HTTPException(409, "Finish the recorded creation using its original reviewed confirmation.")
    else:
        preview = editable(state, req.preview_id)
        if preview.digest != req.digest:
            raise HTTPException(409, "The reviewed brief changed. Review it again before confirming.")
        refreshed = [safe_payload(item) for item in remote.items(connection(state), [item.id for item in preview.items])]
        if [item.content_digest for item in refreshed] != [item.content_digest for item in preview.items]:
            raise HTTPException(409, "Azure DevOps source content changed. Prepare and review a fresh brief.")
        reserved = Creation(preview=preview)
        state.creation = reserved
        state.preview = None
        # Reserve capacity for completion before recording an irreversible creation.
        if len(state.activity) > 98 or len(state.receipts) >= 20:
            raise HTTPException(409, "Connector history capacity reached. Clear connector data before starting another discovery.")
        record(state, "discovery_creation_reserved")
        store.save(key, state)
    try:
        existing(reserved.engagement_id, reserved.preview.id)
    except WorkflowNotFound:
        workspace = workspace_context.get()
        workflow = WorkflowState(
            session_id=reserved.engagement_id, record_kind="discovery", owner_id=actor,
            organization_id=workspace.organization_id or None, team_id=workspace.team_id or None,
            discovery=reserved.preview.engagement.model_copy(deep=True),
            discovery_import_id=reserved.preview.id,
            discovery_import_sources=[item.model_copy(deep=True) for item in reserved.preview.sources],
            discovery_created_at=reserved.confirmed_at,
            expires_at=reserved.confirmed_at + timedelta(days=30),
        )
        try:
            db_client.save_workflow_state(workflow)
        except ConcurrentUpdate:
            existing(reserved.engagement_id, reserved.preview.id)
    latest = store.read(key)
    if any(item.preview_id == req.preview_id for item in latest.receipts):
        existing(reserved.engagement_id, req.preview_id)
        return {"engagement_id": reserved.engagement_id}
    if not latest.creation or latest.creation.engagement_id != reserved.engagement_id:
        raise HTTPException(409, "Creation state changed. Refresh the connector history before retrying.")
    latest.receipts.append(Receipt(preview_id=req.preview_id, digest=req.digest, actor=actor,
                                   engagement_id=reserved.engagement_id, created_at=reserved.confirmed_at))
    latest.creation = None
    record(latest, "discovery_created")
    store.save(key, latest)
    return {"engagement_id": reserved.engagement_id}

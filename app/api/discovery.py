"""Scoped discovery records reuse session storage, retention and conditional writes."""
import logging
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.database.cosmos_client import db_client
from app.database.tenant_directory import workspace_context
from app.security.auth import principal_context
from app.security.guardrails import redact_data, scan_input
from app.utils.errors import WorkflowNotFound
from app.utils.models import DiscoveryEngagement, SessionId, WorkflowState

router = APIRouter()
logger = logging.getLogger(__name__)


class EngagementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    engagement: DiscoveryEngagement
    version: str | None = Field(default=None, min_length=1, max_length=1000)


def validate_content(engagement: DiscoveryEngagement, previous_ids=()):
    payload = engagement.model_dump(mode="json")
    texts = [value for value in payload.values() if isinstance(value, str)]
    texts.extend(item.statement for item in engagement.contributions)
    texts.extend(text for item in engagement.opportunities for text in (item.title, item.problem))
    if any(not scan_input(text).safe for text in texts):
        raise HTTPException(422, "Discovery contains instruction-override content. Please rephrase.")
    for session in engagement.assessment_ids:
        if session not in previous_ids:
            db_client.get_workflow_state(session)
    return DiscoveryEngagement.model_validate(redact_data(payload))


def response(state):
    if state.discovery is None:
        logger.error("Discovery record has no engagement payload.")
        from app.utils.errors import InvalidDependencyResponse
        raise InvalidDependencyResponse("cosmos")
    assessments, unavailable = [], []
    for session in state.discovery.assessment_ids:
        try:
            child = db_client.get_workflow_state(session)
            assessments.append({"session_id": session,
                                "title": child.workflow_intelligence.workflow_name if child.workflow_intelligence
                                else child.enterprise_context.business_domain, "status": child.status})
        except WorkflowNotFound:
            unavailable.append(session)
    return {"id": state.session_id, "version": state._etag,
            "engagement": state.discovery.model_dump(mode="json"),
            "permissions": db_client.permissions(state), "expires_at": state.expires_at.isoformat(),
            "assessments": assessments, "unavailable_assessments": unavailable,
            "progress": {"contributions": len(state.discovery.contributions),
                         "opportunities": len(state.discovery.opportunities), "assessments": len(assessments)},
            "limitations": "Manual discovery notes and candidate opportunities, not verified evidence or automatic "
                          "recommendations. Workspace members with read access can see these notes. "
                          "No anonymous interviews, invitations or automated synthesis. Session retention applies."}


@router.get("/engagements")
def list_engagements(cursor: Annotated[str, Query(max_length=512, pattern=r"^[A-Za-z0-9_.:+-]*$")] = "",
                     limit: Annotated[int, Query(ge=1, le=50)] = 20):
    return db_client.list_engagements(cursor, limit)


@router.post("/engagements")
def create_engagement(req: EngagementRequest):
    if req.version is not None:
        raise HTTPException(422, "New engagements must not specify a version.")
    workspace = workspace_context.get()
    state = WorkflowState(session_id=str(uuid4()), record_kind="discovery",
                          owner_id=principal_context.get().owner_id,
                          organization_id=workspace.organization_id or None, team_id=workspace.team_id or None)
    db_client._authorize(state, "write")
    state.discovery = validate_content(req.engagement)
    db_client.save_workflow_state(state)
    return response(state)


@router.get("/engagements/{engagement_id}")
def get_engagement(engagement_id: SessionId):
    return response(db_client.get_workflow_state(engagement_id, expected_kind="discovery"))


@router.put("/engagements/{engagement_id}")
def update_engagement(engagement_id: SessionId, req: EngagementRequest):
    state = db_client.get_workflow_state(engagement_id, expected_kind="discovery")
    db_client._authorize(state, "write")
    if req.version != state._etag:
        raise HTTPException(409, "Discovery changed; reload before saving.")
    state.discovery = validate_content(req.engagement, state.discovery.assessment_ids if state.discovery else ())
    db_client.save_workflow_state(state)
    return response(state)


@router.delete("/engagements/{engagement_id}")
def delete_engagement(engagement_id: SessionId, version: Annotated[str, Query(min_length=1, max_length=1000)]):
    state = db_client.get_workflow_state(engagement_id, expected_kind="discovery")
    db_client._authorize(state, "delete")
    if state._etag != version:
        raise HTTPException(409, "Discovery changed; reload before deleting.")
    # Use the checked version for deletion; a second read must not erase a concurrent edit.
    db_client.delete_workflow_state(engagement_id, expected_kind="discovery", expected_version=version)
    return {"status": "deleted"}

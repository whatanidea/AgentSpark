"""Scoped discovery participation, hypotheses and recoverable assessment handoffs."""
from datetime import datetime, timedelta, timezone
import logging
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, uuid4, uuid5

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.database.cosmos_client import db_client
from app.database.tenant_directory import Action, tenant_directory, workspace_context
from app.security.auth import principal_context
from app.security.guardrails import redact_data, scan_input
from app.utils.errors import WorkflowNotFound
from app.utils.discovery import RETENTION_DAYS, ROLE_QUESTIONS, discovery_sources, priority_report, source_digest, synthesize
from app.utils.model_catalog import assessment_model, model_definition
from app.utils.models import (
    CloudProvider, DiscoveryEngagement, DiscoveryHandoff, DiscoveryOpportunity, DiscoveryOrigin,
    DiscoveryParticipant, DiscoverySource, DiscoverySynthesis, EnterpriseContext, EvidenceEntry, SessionId, WorkflowState,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class EngagementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    engagement: DiscoveryEngagement
    version: str | None = Field(default=None, min_length=1, max_length=1000)


class VersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1, max_length=1000)


class AssignmentRequest(VersionRequest):
    role: Literal["business_operator", "process_owner", "technical_owner"]


class ContributionRequest(VersionRequest):
    answers: dict[str, Annotated[str, Field(max_length=1000)]] = Field(max_length=3)
    submit: bool = False


class GenerationRequest(VersionRequest):
    model_id: Literal["azure-openai", "foundry-claude-haiku", "demo"]


class HandoffRequest(GenerationRequest):
    target_cloud: CloudProvider
    reviewed: bool


def checked_state(engagement_id: str, version: str, action: Action = "write") -> WorkflowState:
    state = db_client.get_workflow_state(engagement_id, expected_kind="discovery")
    db_client._authorize(state, action)
    if state._etag != version:
        raise HTTPException(409, "Discovery changed; reload before continuing.")
    return state


def validate_content(engagement: DiscoveryEngagement, previous_ids=(), known_sources=()):
    payload = engagement.model_dump(mode="json")
    texts = [value for value in payload.values() if isinstance(value, str)]
    texts.extend(item.statement for item in engagement.contributions)
    texts.extend(text for item in engagement.opportunities for text in (item.title, item.problem))
    texts.extend(item.ratings.rationale for item in engagement.opportunities if item.ratings)
    if any(not scan_input(text).safe for text in texts):
        raise HTTPException(422, "Discovery contains instruction-override content. Please rephrase.")
    for session in engagement.assessment_ids:
        if session not in previous_ids:
            db_client.get_workflow_state(session)
    for opportunity in engagement.opportunities:
        if (len(opportunity.source_ids) != len(set(opportunity.source_ids))
                or not set(opportunity.source_ids).issubset(known_sources)):
            raise HTTPException(422, "Opportunity source references must be unique IDs from the saved synthesis.")
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
    permissions = db_client.permissions(state)
    identity = principal_context.get().owner_id
    participant = next((item for item in state.discovery_participants if item.identity_id == identity), None)
    member = tenant_directory.get(state.organization_id, f"member-{identity}") if participant and state.organization_id else None
    synthesis = state.discovery_synthesis
    return {"id": state.session_id, "version": state._etag,
            "engagement": state.discovery.model_dump(mode="json"),
            "permissions": permissions, "expires_at": state.expires_at.isoformat(),
            "retention": {"days": RETENTION_DAYS,
                          "created_at": state.discovery_created_at.isoformat() if state.discovery_created_at else None,
                          "policy": "Fixed 30 days from creation or explicit renewal. Reads and ordinary edits do not extend expiry. "
                                    "Legacy records keep their current expiry until explicitly renewed."},
            "participation": {"participants": [item.model_dump(mode="json") for item in state.discovery_participants],
                              "identity_id": identity, "can_assign": permissions["write"] and bool(state.organization_id and state.team_id),
                              "can_submit": bool(participant and member and member.active and
                                                 participant.membership_generation == member.generation), "questions": ROLE_QUESTIONS},
            "synthesis": synthesis.model_dump(mode="json") if synthesis else None,
            "synthesis_current": synthesis is not None and synthesis.source_digest == source_digest(state),
            "prioritization": priority_report(state),
            "handoffs": [item.model_dump(mode="json") for item in state.discovery_handoffs],
            "assessments": assessments, "unavailable_assessments": unavailable,
            "progress": {"contributions": len(state.discovery.contributions),
                         "opportunities": len(state.discovery.opportunities), "assessments": len(assessments)},
            "limitations": "Contributions and generated opportunities are unverified statements and hypotheses. "
                          "Workspace readers can see them; participation is authenticated, not anonymous. Existing "
                          "organization invitations provide team access. Prioritization is relative assessor judgment, "
                          "not guaranteed savings. Handoffs preserve provenance without confirming workflow facts."}


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
    state.discovery_created_at = datetime.now(timezone.utc)
    state.expires_at = state.discovery_created_at + timedelta(days=RETENTION_DAYS)
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
    state.discovery = validate_content(req.engagement, state.discovery.assessment_ids if state.discovery else (),
                                       {source.id for source in state.discovery_synthesis.sources}
                                       if state.discovery_synthesis else ())
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


@router.post("/engagements/{engagement_id}/renew")
def renew_engagement(engagement_id: SessionId, req: VersionRequest):
    state = checked_state(engagement_id, req.version)
    now = datetime.now(timezone.utc)
    if state.discovery_created_at is None:
        state.discovery_created_at = now
    state.expires_at = now + timedelta(days=RETENTION_DAYS)
    db_client.save_workflow_state(state)
    return response(state)


def active_member(state: WorkflowState, identity: str):
    if not state.organization_id or not state.team_id:
        raise HTTPException(409, "Use an organization/team workspace and its existing invitation flow for participants.")
    member = tenant_directory.get(state.organization_id, f"member-{identity}")
    grant = tenant_directory.get(state.organization_id, f"grant-{state.team_id}-{identity}")
    if not member or not member.active or (member.role not in ("owner", "admin") and (
            not grant or not grant.active or grant.generation != member.generation or not grant.roles)):
        raise WorkflowNotFound()
    return member


@router.get("/engagements/{engagement_id}/eligible-participants")
def eligible_participants(engagement_id: SessionId,
                          cursor: Annotated[str, Query(max_length=512, pattern=r"^[A-Za-z0-9_.:+-]*$")] = ""):
    state = db_client.get_workflow_state(engagement_id, expected_kind="discovery")
    db_client._authorize(state, "write")
    if not state.organization_id or not state.team_id:
        raise HTTPException(409, "Select a team workspace before assigning participants.")
    grants, next_cursor = tenant_directory.page("team_member", organization=state.organization_id,
                                               team=state.team_id, cursor=cursor, limit=20)
    identities = []
    for grant in grants:
        member = tenant_directory.get(state.organization_id, f"member-{grant.identity_id}")
        if member and member.active and grant.active and grant.roles and grant.generation == member.generation:
            identities.append(grant.identity_id)
    actor = principal_context.get().owner_id
    if not cursor and actor not in identities:
        identities.append(actor)
    return {"items": [{"identity_id": identity} for identity in identities], "next_cursor": next_cursor}


@router.put("/engagements/{engagement_id}/participants/{identity_id}")
def assign_participant(engagement_id: SessionId, identity_id: SessionId, req: AssignmentRequest):
    state = checked_state(engagement_id, req.version)
    member = active_member(state, identity_id)
    previous = next((item for item in state.discovery_participants if item.identity_id == identity_id), None)
    if previous and previous.role == req.role and previous.membership_generation == member.generation:
        return response(state)
    if not previous and len(state.discovery_participants) >= 20:
        raise HTTPException(422, "At most 20 participants can be assigned.")
    state.discovery_participants = [item for item in state.discovery_participants if item.identity_id != identity_id]
    state.discovery_participants.append(DiscoveryParticipant(
        identity_id=identity_id, role=req.role, assigned_by=principal_context.get().owner_id,
        assigned_at=datetime.now(timezone.utc), membership_generation=member.generation))
    db_client.save_workflow_state(state)
    return response(state)


@router.delete("/engagements/{engagement_id}/participants/{identity_id}")
def remove_participant(engagement_id: SessionId, identity_id: SessionId, req: VersionRequest):
    state = checked_state(engagement_id, req.version)
    if not any(item.identity_id == identity_id for item in state.discovery_participants):
        raise WorkflowNotFound()
    state.discovery_participants = [item for item in state.discovery_participants if item.identity_id != identity_id]
    db_client.save_workflow_state(state)
    return response(state)


@router.put("/engagements/{engagement_id}/contribution")
def save_contribution(engagement_id: SessionId, req: ContributionRequest):
    state = checked_state(engagement_id, req.version, "read")
    identity = principal_context.get().owner_id
    member = active_member(state, identity)
    participant = next((item for item in state.discovery_participants if item.identity_id == identity), None)
    if participant is None:
        raise HTTPException(403, "An assigned participant role is required to contribute.")
    if participant.membership_generation != member.generation:
        raise HTTPException(403, "Membership changed; a contributor must assign your participant role again.")
    if not set(req.answers).issubset(ROLE_QUESTIONS[participant.role]):
        raise HTTPException(422, "Answer only the questions assigned to your role.")
    if any(not scan_input(value).safe for value in req.answers.values()):
        raise HTTPException(422, "Contribution contains instruction-override content. Please rephrase.")
    answers = {key: value.strip() for key, value in redact_data(req.answers).items()}
    if req.submit and any(not answers.get(key) for key in ROLE_QUESTIONS[participant.role]):
        raise HTTPException(422, "Answer each assigned question, using unconfirmed where appropriate, before submitting.")
    participant.answers = answers
    participant.status = "submitted" if req.submit else "draft"
    participant.submitted_at = datetime.now(timezone.utc) if req.submit else None
    # Only this authenticated participant's response is mutable through this endpoint.
    db_client.save_workflow_state(state, action="read")
    return response(state)


@router.post("/engagements/{engagement_id}/synthesis")
def generate_synthesis(engagement_id: SessionId, req: GenerationRequest):
    state = checked_state(engagement_id, req.version)
    with assessment_model(model_definition(req.model_id)) as model:
        try:
            content = synthesize(state)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        state.discovery_synthesis = DiscoverySynthesis(
            source_digest=source_digest(state), sources=discovery_sources(state), content=content, model=model,
            generated_by=principal_context.get().owner_id, generated_at=datetime.now(timezone.utc))
    db_client.save_workflow_state(state)
    return response(state)


@router.post("/engagements/{engagement_id}/candidates/{candidate_id}/accept")
def accept_candidate(engagement_id: SessionId, candidate_id: SessionId, req: VersionRequest):
    state = checked_state(engagement_id, req.version)
    snapshot = state.discovery_synthesis
    if not snapshot or snapshot.source_digest != source_digest(state):
        raise HTTPException(409, "Regenerate synthesis from the current source contributions first.")
    candidate = next((item for item in snapshot.content.opportunities if item.id == candidate_id), None)
    if candidate is None:
        raise WorkflowNotFound()
    if not any(item.id == candidate_id for item in state.discovery.opportunities):
        if len(state.discovery.opportunities) >= 20:
            raise HTTPException(422, "At most 20 candidate opportunities can be recorded.")
        state.discovery.opportunities.append(DiscoveryOpportunity(
            id=candidate_id, title=candidate.title, problem=candidate.statement, source_ids=candidate.source_ids))
        db_client.save_workflow_state(state)
    return response(state)


@router.post("/engagements/{engagement_id}/opportunities/{opportunity_id}/handoff")
def create_handoff(engagement_id: SessionId, opportunity_id: SessionId, req: HandoffRequest):
    state = checked_state(engagement_id, req.version)
    if not req.reviewed:
        raise HTTPException(422, "Review the opportunity and its unverified source evidence before handoff.")
    opportunity = next((item for item in state.discovery.opportunities if item.id == opportunity_id), None)
    if opportunity is None:
        raise WorkflowNotFound()
    if opportunity.status != "selected":
        raise HTTPException(409, "Select this opportunity for assessment before handoff.")
    if opportunity.source_ids and (not state.discovery_synthesis or
                                   state.discovery_synthesis.source_digest != source_digest(state)):
        raise HTTPException(409, "The source synthesis is stale; regenerate and review before handoff.")
    model = model_definition(req.model_id)
    reservation = next((item for item in state.discovery_handoffs if item.origin.opportunity_id == opportunity_id), None)
    if reservation:
        if (reservation.origin.title != opportunity.title or reservation.origin.problem != opportunity.problem
                or reservation.context.target_cloud != req.target_cloud or reservation.model != model):
            raise HTTPException(409, "This opportunity already has a frozen handoff. Create another opportunity for a different assessment.")
        frozen_sources = {source.id for source in reservation.origin.sources if not source.id.startswith("opportunity.")}
        current_sources = {source.id: source for source in state.discovery_synthesis.sources} if state.discovery_synthesis else {}
        if (frozen_sources != set(opportunity.source_ids) or any(
                current_sources.get(source.id) != source for source in reservation.origin.sources if source.id in frozen_sources)):
            raise HTTPException(409, "The handoff source snapshot changed. Create another opportunity rather than altering frozen provenance.")
    else:
        if len(state.discovery.assessment_ids) >= 20:
            raise HTTPException(422, "At most 20 assessments can be linked.")
        child_id = str(uuid5(NAMESPACE_URL, f"agentspark:discovery:{engagement_id}:{opportunity_id}"))
        sources = [source for source in state.discovery_synthesis.sources if source.id in opportunity.source_ids] \
            if state.discovery_synthesis else []
        sources = [DiscoverySource(id=f"opportunity.{opportunity_id}", label="Reviewed manual hypothesis; unverified",
                                   statement=opportunity.problem), *sources]
        origin = DiscoveryOrigin(
            engagement_id=engagement_id, opportunity_id=opportunity_id, source_version=state._etag,
            title=opportunity.title, problem=opportunity.problem, sources=sources,
            priority=next(row for row in priority_report(state)["items"] if row["opportunity_id"] == opportunity_id),
            reviewed_by=principal_context.get().owner_id, reviewed_at=datetime.now(timezone.utc))
        context = EnterpriseContext(business_domain=state.discovery.business_units[:200],
                                    pain_points=opportunity.problem, target_cloud=req.target_cloud)
        reservation = DiscoveryHandoff(
            session_id=child_id, origin=origin, context=context, model=model,
            assessment_expires_at=WorkflowState(session_id=child_id).expires_at)
        state.discovery_handoffs.append(reservation)
        state.discovery.assessment_ids.append(child_id)
        db_client.save_workflow_state(state)
    if reservation.assessment_expires_at <= datetime.now(timezone.utc):
        raise HTTPException(409, "The reserved assessment expired. Create a new opportunity instead of restoring expired data.")
    child = db_client.get_workflow_state(reservation.session_id,
                                        create_if_missing=reservation.status == "pending")
    if child._etag is None:
        child.owner_id = reservation.origin.reviewed_by
        child.enterprise_context = reservation.context.model_copy(deep=True)
        child.inference_model = reservation.model
        child.expires_at = reservation.assessment_expires_at
        child.discovery_origin = reservation.origin.model_copy(deep=True)
        child.evidence_register = [EvidenceEntry(
            id=str(uuid4()), kind="client_fact",
            statement=source.statement[:950] + (" [excerpt; full source in discovery origin]" if len(source.statement) > 950 else ""),
            source_reference=f"Discovery {engagement_id} / {source.id}; unverified",
            created_by=reservation.origin.reviewed_by, created_at=reservation.origin.reviewed_at,
            updated_by=reservation.origin.reviewed_by, updated_at=reservation.origin.reviewed_at,
        ) for source in reservation.origin.sources]
        child.evidence_revision = 1
        db_client.save_workflow_state(child)
    elif child.discovery_origin != reservation.origin:
        raise HTTPException(409, "Assessment reservation does not match its recorded origin.")
    if reservation.status == "pending":
        latest = db_client.get_workflow_state(engagement_id, expected_kind="discovery")
        next(item for item in latest.discovery_handoffs if item.session_id == child.session_id).status = "completed"
        db_client.save_workflow_state(latest)
        state = latest
    return {"session_id": child.session_id, "engagement": response(state)}

"""Attributed discovery decisions, not corporate authority or implementation approval."""
from datetime import datetime, timezone
from hashlib import sha256
import json

from fastapi import HTTPException

from app.database.tenant_directory import tenant_directory
from app.utils.discovery import source_digest
from app.utils.errors import WorkflowNotFound
from app.utils.models import DiscoveryAlignmentSnapshot, WorkflowState

FUNCTIONS = ("business", "it", "risk", "compliance_privacy", "operations")
OWNERSHIP_ROLES = ("executive_sponsor", "business_owner", "operational_owner")
LIMITATIONS = (
    "Positions and decisions are attributed human statements, not verified consensus, regulatory clearance "
    "or implementation approval. Nomination does not grant workspace permissions or corporate authority. "
    "Owners must accept responsibility for the current scope themselves. Missing input is not agreement; "
    "objections and conditions remain visible even after an owner decision. Changes require fresh positions "
    "and acceptances. Local demo identities do not establish independent authentication."
)


def active_member(state: WorkflowState, identity: str):
    if not state.organization_id or not state.team_id:
        raise HTTPException(409, "Use an organization/team workspace and its existing invitation flow for participants.")
    member = tenant_directory.get(state.organization_id, f"member-{identity}")
    grant = tenant_directory.get(state.organization_id, f"grant-{state.team_id}-{identity}")
    if not member or not member.active or (member.role not in ("owner", "admin") and (
            not grant or not grant.active or grant.generation != member.generation or not grant.roles)):
        raise WorkflowNotFound()
    return member


def _digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def charter(state):
    engagement = state.discovery
    if engagement is None:
        raise ValueError("Discovery payload is required.")
    return {key: getattr(engagement, key) for key in (
        "title", "objective", "business_units", "required_topics", "excluded_topics",
        "sponsor", "engagement_owner", "success_measures")}


def charter_digest(state):
    return _digest({"charter": charter(state), "sources": source_digest(state),
                    "processes": [item.model_dump(mode="json") for item in state.discovery.processes]})


def decision_digest(state, decision):
    return _digest({"charter": charter_digest(state), "decision": decision.model_dump(
        mode="json", exclude={"acceptances", "outcomes"})})


def position_digest(state):
    return _digest({"charter": charter_digest(state),
                    "decisions": [item.model_dump(mode="json", exclude={"acceptances"})
                                  for item in state.discovery_alignment.decisions]})


def alignment_snapshot(state):
    alignment = state.discovery_alignment
    if alignment is None:
        return None
    context = position_digest(state)
    scope = charter_digest(state)
    active = {}
    entries = [*alignment.stakeholders, *alignment.owners, *alignment.decisions]
    for identity in {entry.identity_id for entry in entries}:
        try:
            active[identity] = active_member(state, identity).generation
        except WorkflowNotFound:
            active[identity] = None
    inactive = [entry.id for entry in entries if entry.withdrawn or
                active.get(entry.identity_id) != entry.membership_generation]
    positions = [entry.id for entry in alignment.stakeholders if entry.id not in inactive and
                 entry.positions and entry.positions[-1].context_digest == context]
    owners = [entry.id for entry in alignment.owners if entry.id not in inactive and
              entry.acceptances and entry.acceptances[-1].context_digest == scope]
    superseded = [entry.replaces_id for entry in alignment.decisions if entry.replaces_id]
    accepted = [entry.id for entry in alignment.decisions if entry.id not in inactive and
                entry.id not in superseded and entry.acceptances and
                entry.acceptances[-1].context_digest == decision_digest(state, entry)]
    decisions = [entry.id for entry in alignment.decisions if entry.id in accepted and entry.outcomes and
                 entry.outcomes[-1].context_digest == decision_digest(state, entry)]
    return DiscoveryAlignmentSnapshot(
        source_version=state._etag or "unsaved", recorded_at=datetime.now(timezone.utc),
        charter=charter(state), record=alignment.model_copy(deep=True), context_digest=context,
        current_positions=positions, inactive_assignments=inactive, accepted_owners=owners,
        accepted_decisions=accepted, current_decisions=decisions, superseded_decisions=superseded,
        missing_functions=[function for function in FUNCTIONS if not any(
            item.function == function and item.id in positions for item in alignment.stakeholders)],
        unaccepted_owners=[role for role in OWNERSHIP_ROLES if not any(
            item.role == role and item.id in owners for item in alignment.owners)],
        open_decisions=[entry.id for entry in alignment.decisions if entry.id not in superseded and entry.id not in decisions],
        limitations=LIMITATIONS,
    )


def snapshot_content(snapshot):
    return snapshot.model_dump(mode="json", exclude={"source_version", "recorded_at"}) if snapshot else None

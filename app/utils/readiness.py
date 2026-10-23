"""Deterministic delivery readiness, separate from agent suitability and policy approval."""
from datetime import datetime, timezone

from app.utils.models import ReadinessCheckInput, WorkflowState


READINESS_LIMITATIONS = (
    "Advisory pilot assessment, not compliance certification or proof that integrations work. "
    "Findings, owner confirmations and source references are user-supplied; reviewer attestations "
    "are not automated verification. No resources, permissions or quotas are checked live. "
    "This report does not change the agent-suitability score or authorize deployment/business actions. "
    "Unassigned or proposed owners are not client commitments. No delivery dates are inferred."
)


def readiness_catalog(cloud: str) -> list[dict]:
    provider = "AWS" if cloud == "aws" else "Azure"
    services = ("IAM, Amazon Bedrock, VPC and CloudWatch" if cloud == "aws"
                else "Microsoft Entra ID, Azure OpenAI, virtual networks and Azure Monitor")
    return [
        {"id": "integration_access", "title": "Integration access",
         "question": "Are supported APIs, least-privilege service accounts and sandbox access available?",
         "completion_criteria": "Document the integration method and record a successful authorized sandbox connection test.",
         "depends_on": []},
        {"id": "data_quality", "title": "Data readiness",
         "question": "Are approved representative samples, document quality and data ownership validated?",
         "completion_criteria": "Record representative sample evaluation, missing/poor-quality documents and approved data use.",
         "depends_on": []},
        {"id": "security_privacy", "title": "Security and compliance",
         "question": "Are sensitive fields, residency, retention, access boundaries and required approvals agreed?",
         "completion_criteria": "Record approved security/privacy requirements, retention and residency constraints.",
         "depends_on": []},
        {"id": "human_oversight", "title": "Human oversight",
         "question": "Are reviewer roles, escalation paths and prohibited autonomous actions agreed?",
         "completion_criteria": "Approve an authorization matrix and test mandatory review and escalation paths.",
         "depends_on": []},
        {"id": "cloud_prerequisites", "title": f"{provider} prerequisites",
         "question": f"Validate {provider} region/service and model availability, quotas, identity and network access "
                     f"for the proposed solution ({services}); selection alone confirms nothing.",
         "completion_criteria": f"Record {provider} account/subscription access, region/model availability, quotas and network validation.",
         "depends_on": ["security_privacy"]},
        {"id": "operations", "title": "Operations and support",
         "question": "Are monitoring, support ownership, incident response, failure handling and rollback tested?",
         "completion_criteria": "Assign support/escalation owners and record monitoring, failure recovery and rollback tests.",
         "depends_on": ["integration_access", "data_quality", "human_oversight", "cloud_prerequisites"]},
    ]


def build_readiness_report(state: WorkflowState) -> dict:
    inputs = {check.id: check for check in state.readiness_assessment.checks}
    evidence = {entry.id: entry for entry in state.evidence_register}
    checks = []
    effective = {}
    for spec in readiness_catalog(state.enterprise_context.target_cloud):
        check = inputs.get(spec["id"], ReadinessCheckInput(id=spec["id"]))
        issues = []
        if check.status == "ready":
            if not check.evidence_ids:
                issues.append("Link source-supported, reviewer-confirmed evidence before marking this ready.")
            for identifier in check.evidence_ids:
                entry = evidence.get(identifier)
                if not entry or entry.kind != "supported_finding" or not entry.confirmation:
                    issues.append(f"Evidence {identifier} is missing or lacks a source-supported reviewer confirmation.")
            if check.owner_status != "client_confirmed":
                issues.append("Record a client-confirmed owner and confirmation reference.")
            for dependency in spec["depends_on"]:
                if effective[dependency] != "ready":
                    issues.append(f"Resolve prerequisite {dependency} first.")
        else:
            for identifier in check.evidence_ids:
                if identifier not in evidence:
                    issues.append(f"Evidence {identifier} was removed; update this link.")
        status = "needs_validation" if check.status == "ready" and issues else check.status
        effective[check.id] = status
        checks.append({
            **spec, **check.model_dump(mode="json"),
            "reported_status": check.status, "status": status, "validation_needs": issues,
            "next_action": check.next_action or spec["question"],
            "completion_criteria": check.completion_criteria or spec["completion_criteria"],
            "evidence": [
                {"id": identifier, "statement": evidence[identifier].statement,
                 "source_reference": evidence[identifier].source_reference,
                 "confirmation": evidence[identifier].confirmation.model_dump(mode="json")
                 if evidence[identifier].confirmation else None}
                for identifier in check.evidence_ids if identifier in evidence
            ],
        })
    pilot = state.readiness_assessment.pilot.model_dump()
    missing_pilot = [key for key, value in pilot.items() if not value]
    statuses = set(effective.values())
    if "blocked" in statuses:
        decision, reason = "blocked", "Resolve explicit blockers before starting a pilot."
    elif "unknown" in statuses:
        decision, reason = "not_assessed", "At least one required area is unassessed; pilot readiness cannot be concluded."
    elif statuses == {"ready"} and not missing_pilot:
        decision, reason = "ready", "All required areas meet the recorded evidence/ownership checks and a pilot plan is supplied."
    else:
        decision, reason = "ready_with_conditions", "Resolve validation needs and incomplete pilot criteria before starting a pilot."
    actions = [
        {"check_id": check["id"], "priority": "P0" if check["status"] == "blocked" else "P1",
         "action": check["next_action"], "owner": check["owner"] or "Unassigned",
         "owner_status": check["owner_status"], "depends_on": check["depends_on"],
         "completion_criteria": check["completion_criteria"], "evidence_ids": check["evidence_ids"]}
        for check in checks if check["status"] != "ready"
    ]
    if missing_pilot:
        actions.append({
            "check_id": "pilot_definition", "priority": "P1",
            "action": f"Complete the pilot definition: {', '.join(missing_pilot)}.",
            "owner": inputs["operations"].owner if inputs.get("operations") and inputs["operations"].owner else "Unassigned",
            "owner_status": inputs["operations"].owner_status if inputs.get("operations") else "unassigned",
            "depends_on": [check["id"] for check in checks],
            "completion_criteria": "Record pilot scope, measurable acceptance thresholds, failure/rollback tests and prohibited actions.",
            "evidence_ids": [],
        })
    actions.sort(key=lambda item: (item["priority"], item["check_id"]))
    intel = state.workflow_intelligence
    return {
        "revision": state.readiness_revision, "evidence_revision": state.evidence_revision,
        "assessed_at": datetime.now(timezone.utc).isoformat(), "decision": decision, "rationale": reason,
        "target_cloud": state.enterprise_context.target_cloud,
        "preferred_region": state.enterprise_context.preferred_region,
        "workflow_context": {
            "systems": intel.systems if intel else state.enterprise_context.existing_systems,
            "data_residency_requirements": state.enterprise_context.data_residency_requirements,
            "deployment_constraints": state.enterprise_context.deployment_constraints,
        },
        "checks": checks, "blockers": [check["id"] for check in checks if check["status"] == "blocked"],
        "actions": actions, "pilot": pilot, "missing_pilot_fields": missing_pilot,
        "pilot_entry_criteria": [check["completion_criteria"] for check in checks],
        "limitations": READINESS_LIMITATIONS,
    }

"""Trace user-linked context separately from extracted facts and calculated results."""
from app.utils.models import EvidenceEntry, WorkflowDiagnosis, AgentSuitabilityScore


EVIDENCE_LIMITATION = (
    "Source references and fact links are supplied by users, not independently checked by AgentSpark. "
    "A confirmation records a reviewer's attestation and method, not an automated verification. "
    "Register entries do not override diagnostic inputs or change scoring formulas. "
    "Check for contradictions before approval; no confidence or evidence-quality score is implied."
)


def build_evidence_report(entries: list[EvidenceEntry], revision: int,
                          diagnosis: WorkflowDiagnosis | None = None,
                          score: AgentSuitabilityScore | None = None) -> dict:
    findings = []
    if diagnosis and diagnosis.intelligence:
        for key, fact in diagnosis.evidence.items():
            if fact.status == "missing":
                continue
            findings.append({
                "fact": key, "value": getattr(diagnosis.intelligence, key),
                "provenance": fact.model_dump(),
                "evidence_ids": [entry.id for entry in entries if key in entry.related_facts],
            })
    checklist = []
    for entry in entries:
        if entry.kind == "open_question":
            action = "Resolve this open question."
        elif entry.kind == "assumption":
            action = "Validate or replace this assumption with measured evidence."
        elif entry.kind == "supported_finding" and entry.confirmation is None:
            action = "Have an authorized reviewer inspect the referenced source and record the confirmation method."
        elif entry.kind == "client_fact":
            action = "Corroborate this client-stated fact; a source reference alone is not verification."
        else:
            continue
        checklist.append({"evidence_id": entry.id, "statement": entry.statement, "action": action})
    return {
        "revision": revision,
        "entries": [entry.model_dump(mode="json") for entry in entries],
        "findings": findings,
        "recommendation_basis": {
            "classification": score.classification if score else None,
            "agent_score": score.agent_score if score else None,
            "recommended_pattern": score.recommended_pattern if score else None,
            "basis": "Calculated from diagnostic inputs using the existing readiness rules, not from register attestations.",
            "evidence_ids": sorted({identifier for finding in findings for identifier in finding["evidence_ids"]}),
        },
        "validation_checklist": checklist,
        "limitations": EVIDENCE_LIMITATION,
    }

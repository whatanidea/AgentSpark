"""Executive decisions derived from the same evidence and estimates as the assessment."""
import json

from app.utils.interview import effective_diagnosis
from app.utils.models import BriefClaim, BriefSource, ExecutiveBrief, WorkflowState


def build_executive_brief(state: WorkflowState) -> ExecutiveBrief:
    diagnosis = state.diagnosis or effective_diagnosis(state)
    intel = state.workflow_intelligence or diagnosis.intelligence
    score = state.suitability_score
    adoption = score.adoption if score else None
    readiness = state.readiness_report or {}
    sources = []
    claims = []

    def claim(label, statement, source_id, basis):
        sources.append(BriefSource(id=source_id, label=label, basis=basis))
        claims.append(BriefClaim(label=label, statement=statement, source_ids=[source_id]))

    def fact_claim(label, key, value):
        evidence = diagnosis.evidence.get(key)
        if evidence and evidence.status == "supplied":
            claim(label, str(value), f"fact.{key}",
                  f"{evidence.source} statement (not independently verified): {evidence.quote}")

    if intel:
        fact_claim("Business problem", "summary", intel.summary)
        fact_claim("Affected teams", "departments", ", ".join(intel.departments) or "None reported")
        fact_claim("Reported daily volume", "volume_per_day", f"{intel.volume_per_day:,} items per day")
    roi = state.roi or {}
    if roi:
        if roi.get("schema_version") != 2:
            value = "Historical illustrative estimate; rerun analysis. Capacity value is not realized cash savings."
        elif roi.get("status") == "deferred":
            value = "Business value deferred; validate during the pilot. Capacity value is not realized cash savings."
        else:
            hours = roi.get("hours_saved_per_year")
            value = (f"Capacity released: {hours:,.2f} hours/year." if hours is not None else
                     "Capacity not established; inputs remain incomplete.")
            capacity = roi.get("capacity_value_per_year")
            if capacity is not None:
                value += f" Capacity value ${capacity:,.2f}/year; not realized cash savings."
            for key, label in (("annual_cash_savings", "Supplied cash savings"),
                               ("annual_avoided_hiring_value", "Separate avoided-hiring value")):
                if roi.get(key) is not None:
                    value += f" {label}: ${roi[key]:,.2f}/year."
        claim("Business value", value, "roi.assumptions", (roi.get("assumptions") or "") + "\nInputs: "
              + json.dumps(roi.get("assumption_inputs") or {}, sort_keys=True))

    gaps = [f"Workflow fact unresolved: {key.replace('_', ' ')}" for key in diagnosis.missing_facts]
    if adoption:
        claim("Agentic adoption candidate", adoption.design_label, "assessment.adoption",
              adoption.decision_basis + "\n" + "\n".join(adoption.rationale))
        claim("Permitted autonomy", "\n".join(adoption.human_boundaries), "assessment.permissions",
              "Advisory permission boundaries; no production authority is granted.")
        gaps.extend(adoption.questions)
    gaps.extend(f"{item['title']}: {item['status']}" for item in readiness.get("checks", [])
                if item["status"] != "ready")
    gaps.extend(f"Pilot definition missing: {key.replace('_', ' ')}"
                for key in readiness.get("missing_pilot_fields", []))
    gaps.extend(item["statement"] for item in (state.evidence_report or {}).get("validation_checklist", []))
    if state.runtime_decision and state.runtime_decision.status != "recommended":
        gaps.append("Runtime selection requires further validation; no execution framework is approved.")
    if state.status == "rejected" or (state.governance or {}).get("decision") == "REJECT":
        decision, label = "do_not_proceed", "Do not proceed with the proposed agentic design"
        rationale = (state.human_review.note if state.human_review and state.human_review.decision == "reject"
                     else (state.governance or {}).get("reason") or "The recorded assessment rejected this proposal.")
        next_action = "Resolve the rejection reasons or assess a conventional, human-controlled alternative."
    elif not score or diagnosis.missing_facts:
        decision, label = "investigate_further", "Investigate further"
        rationale = "Essential workflow evidence is incomplete; suitability and benefits cannot be concluded."
        next_action = "Ask the assigned business or process owner to resolve the outstanding workflow facts."
    elif (adoption.design_family == "standard_software" if adoption else score.classification in ("Low", "Not Suitable")):
        decision, label = "conventional_automation", "Prefer conventional automation"
        rationale = score.explanation
        next_action = "Validate a deterministic or human-controlled solution before investing in agentic complexity."
    elif adoption and adoption.opportunity == "potential":
        decision, label = "investigate_further", "Validate the agentic opportunity before authorizing a pilot"
        rationale = adoption.decision_basis
        next_action = adoption.questions[0] if adoption.questions else "Validate the proposed reasoning scope against the baseline."
    elif readiness.get("decision") != "ready":
        decision, label = "investigate_further", "Investigate further before authorizing a pilot"
        rationale = readiness.get("rationale") or "Implementation readiness has not been established."
        next_action = "Resolve readiness gaps with the process and technical owners; define measurable pilot entry criteria."
    else:
        decision, label = "bounded_ai_pilot", "Consider a bounded AI pilot"
        rationale = "Suitability and recorded readiness support considering a controlled pilot, not production deployment."
        next_action = "Seek explicit sponsor authorization for the bounded pilot and measure results against the baseline."
    sources.append(BriefSource(
        id="assessment.decision", label="Decision basis",
        basis=f"Suitability: {score.classification if score else 'not assessed'}; "
              f"readiness: {readiness.get('decision', 'not assessed')}; advisory status: {state.status}. {rationale}"))
    claims.insert(0, BriefClaim(label="Recommended decision", statement=label, source_ids=["assessment.decision"]))
    return ExecutiveBrief(
        analysis_id=state.analysis_id, workflow_name=intel.workflow_name if intel else "Workflow not yet supplied",
        decision=decision, decision_label=label, rationale=rationale, approval_status=state.status,
        claims=claims, sources=sources, risks_and_gaps=list(dict.fromkeys(gaps)), next_action=next_action,
        limitations="Advisory decision support, not pilot or production authorization. Stakeholder statements are not "
                    "independently verified. Benefit ranges are illustrative sensitivity scenarios, not confidence "
                    "intervals, guaranteed savings or measured results. Full evidence and assumptions remain reviewable.",
    )

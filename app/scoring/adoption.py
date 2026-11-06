"""Evidence-backed adoption candidates, independent of financial value and profile thresholds."""
import re

from app.utils.models import (
    AdoptionAssessment, AdoptionEvidence, AgentSuitabilityScore, FactEvidence,
    RuntimeRequirements, WorkflowDiagnosis, WorkflowIntelligence,
)


def reasoning_scope_supported(value: str, quote: str) -> bool:
    if value != "deterministic":
        return True
    if re.search(r"\bnot\s+(?:(?:fully|entirely)\s+)?deterministic\b", quote, re.I):
        return False
    partial = re.search(r"\b(collection|collecting|identifier matching|event validation|duplicate detection|deduplication)\b", quote, re.I)
    whole = re.search(
        r"\ball\s+(?:workflow\s+)?(?:steps|reasoning|decisions)\s+(?:are|is)\s+(?:fully\s+)?deterministic\b|"
        r"(?:^|[.;\n])\s*(?:runtime\.reasoning|reasoning(?: behavior)?)\s*:\s*deterministic\b|"
        r"\b(?:workflow|process|investigation|reasoning)\s+(?:is|remains)\s+(?:fully\s+)?deterministic\b", quote, re.I)
    return not partial or bool(whole)


def effective_reasoning(requirements: RuntimeRequirements, sources: dict[str, FactEvidence]) -> tuple[str, str | None]:
    source = sources.get("reasoning") or sources.get("runtime.reasoning")
    if source and source.source == "document" and requirements.reasoning in ("unknown", "deterministic") and not reasoning_scope_supported("deterministic", source.quote):
        return "unknown", ("The document establishes deterministic collection, not the whole investigation. "
                           "Confirm whether investigation follows fixed queries or adapts its next tool/query to evidence.")
    return requirements.reasoning, None


def assess_adoption(intel: WorkflowIntelligence, profile: AgentSuitabilityScore,
                    requirements: RuntimeRequirements | None = None,
                    sources: dict[str, FactEvidence] | None = None,
                    diagnosis: WorkflowDiagnosis | None = None) -> AgentSuitabilityScore:
    r, sources = requirements or RuntimeRequirements(), sources or {}
    reasoning, scope_warning = effective_reasoning(r, sources)
    evidence = []
    for key in ("systems", "human_judgment", "rule_stability", "unstructured_content", "volume_per_day"):
        source = diagnosis.evidence.get(key) if diagnosis else None
        evidence.append(AdoptionEvidence(field_id=f"fact.{key}", value=str(getattr(intel, key)),
            source=source.source if source else "reported_workflow",
            quote=source.quote if source else "", reference=source.reference if source else ""))
    for key in ("reasoning", "specialist_roles"):
        source = sources.get(key) or sources.get(f"runtime.{key}")
        evidence.append(AdoptionEvidence(field_id=f"runtime.{key}", value=reasoning if key == "reasoning" else r.specialist_roles,
            source=source.source if source else "unverified_runtime_preference", quote=source.quote if source else "",
            reference=source.reference if source else ""))
    questions, rationale = [], []
    if scope_warning:
        rationale.append(scope_warning)
    candidate = intel.human_judgment != "Low" and (
        len(intel.systems) >= 2 or intel.unstructured_content != "Low")
    roles = {part.strip().casefold() for part in re.split(r"[;\n]", r.specialist_roles) if part.strip()}
    if reasoning == "dynamic":
        opportunity = "supported"
        family = "supervisor_worker" if len(roles) >= 2 else (
            "hybrid_agentic" if len(intel.systems) >= 2 else "tool_agent")
        label = {"supervisor_worker": "Supervised Specialist-Agent Coordination",
                 "hybrid_agentic": "Hybrid Workflow with Supervised Investigation Agent",
                 "tool_agent": "Supervised Tool-Using Agent"}[family]
        rationale.append("Stated adaptive reasoning justifies evaluating a bounded tool-using agent, independent of daily volume or profile score.")
        if family == "supervisor_worker":
            rationale.append("Distinct specialist responsibilities were supplied; validate that coordination outperforms one agent.")
        else:
            rationale.append("Start with one agent; multiple systems do not by themselves justify multiple agents.")
    elif reasoning == "bounded":
        opportunity, family, label = "potential", "rag_copilot", "Bounded AI-Assisted Analysis"
        rationale.append("The stated task needs bounded AI assistance, not an established iterative agent loop.")
        questions.append("Would adapting the next tool/query to evidence improve results over the bounded AI task?")
    elif reasoning == "deterministic":
        opportunity, family, label = "not_indicated", "standard_software", "Deterministic Workflow / Standard Software"
        rationale.append("The stated investigation follows a fixed sequence; an agent loop is not justified by adoption preference alone.")
        questions.append("If adaptive investigation is proposed, distinguish it explicitly from the deterministic collection steps.")
    elif candidate:
        opportunity, family, label = "potential", "hybrid_agentic", "Conditional Supervised Investigation-Agent Pilot"
        rationale.append("Reported cross-system judgement or content analysis suggests an agentic opportunity, but adaptive reasoning is not established.")
        questions.append("After collecting data, must the system choose follow-up tools/queries from evidence, or can fixed queries produce the same result?")
    else:
        opportunity, family, label = "not_indicated", "standard_software", "Deterministic Workflow / Standard Software"
        rationale.append("Available facts do not establish adaptive reasoning; retain a conventional baseline rather than inventing agent work.")
        questions.append("Identify a concrete decision that needs adaptive reasoning before proposing an agent loop.")
    if reasoning in ("unknown", "dynamic") and len(roles) < 2:
        questions.append("Would one supervised tool-using agent suffice? Supply distinct responsibilities only if specialist coordination is necessary.")
    rationale.extend([
        "Stable policies and structured data can coexist with adaptive investigation.",
        "Compliance and error impact constrain permissions and human approval, not the existence of an agentic opportunity.",
        "The 12-criterion profile is descriptive; it does not select architecture, prove ROI or establish delivery readiness.",
    ])
    agentic = family in ("tool_agent", "hybrid_agentic", "supervisor_worker")
    boundaries = [
        "Initial pilot: approved read-only tools and draft outputs; no autonomous production changes.",
        "Human validation before consequential actions, escalation or externally published conclusions.",
        "Enforce least privilege, bounded tool-call/time budgets, source citations, audit and explicit uncertainty.",
    ]
    adoption = AdoptionAssessment(
        opportunity=opportunity, design_family=family, design_label=label,
        decision_basis="Candidate based on stated requirements, not measured capability or deployment approval.",
        current_approach="Keep a fixed-query/application-code baseline; compare any proposed agent against it.",
        rationale=rationale, evidence=evidence,
        deterministic_responsibilities=["Triggers, schema/identifier validation and duplicate handling.",
            "Authorization, policy enforcement, persistence and business side-effect execution."],
        proposed_agent_responsibilities=(
            ["Proposed: select follow-up permitted tools/queries from observed evidence.",
             "Proposed: correlate findings, explain competing hypotheses and draft a source-backed recommendation."]
            if agentic else ["No adaptive agent responsibilities established; validate the questions below before adding an agent loop."]),
        human_boundaries=boundaries, questions=questions,
        pilot_scope=("Consider historical or synthetic cases, then an explicitly authorized read-only shadow pilot; "
                     "confirm adaptive reasoning before running an agent loop." if opportunity != "not_indicated" else
                     "Benchmark the deterministic baseline. Do not start an agentic pilot without evidence of a reasoning need."),
        success_criteria=["Agree task-quality and source-grounding thresholds with the process owner before the pilot.",
            "Compare correct outcomes, human review effort, elapsed resolution time, cost and tool-call count against the baseline.",
            "Measure unsupported conclusions, unsafe tool attempts and escalation behavior; do not assume improvement."],
        stop_conditions=["Stop on unauthorized access/actions, missing audit evidence, unsupported consequential conclusions or breached budgets.",
            "Do not expand if the agent fails agreed quality thresholds or does not outperform the simpler baseline."],
        expansion_conditions=["Resolve implementation-readiness gaps, integration permissions, ownership and recovery requirements.",
            "Require process/security owner authorization and measured pilot evidence before increasing scope or permissions."],
    )
    updated = profile.model_copy(deep=True)
    updated.adoption = adoption
    updated.recommended_pattern = label
    updated.autonomy_level = "Supervised" if agentic else "Assisted" if family == "rag_copilot" else "Manual"
    updated.requires_hitl = agentic or family == "rag_copilot" or profile.requires_hitl
    updated.explanation = (f"Workflow profile {profile.agent_score}/100 ({profile.classification}); not an agentic-opportunity verdict. "
                           f"Opportunity: {opportunity}. {rationale[0]} Human authority and delivery readiness are assessed separately.")
    return updated

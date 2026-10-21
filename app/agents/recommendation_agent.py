import json
import logging

from pydantic import BaseModel, Field

from app.utils.models import AgentSuitabilityScore, WorkflowIntelligence, WorkflowDiagnosis, AutonomyLevel, DesignFamily, ESSENTIAL_FACTS
from app.utils.llm import get_chat_llm, structured_call
from app.utils.runtime import demo_mode
from app.utils.errors import InvalidDependencyResponse
from app.rag.retrieval import retrieve_patterns

logger = logging.getLogger(__name__)

_DESIGNS: dict[str, tuple[DesignFamily, str]] = {
    "High": ("supervisor_worker", "p02"),
    "Medium": ("rag_copilot", "p05"),
    "Low": ("rpa_triage", "p09"),
    "Not Suitable": ("standard_software", "p20"),
}


class Recommendation(BaseModel):
    design_family: DesignFamily
    autonomy_level: AutonomyLevel
    requires_hitl: bool
    pattern_ids: list[str] = Field(min_length=1, max_length=4)
    memory_strategy: str
    governance: str
    justification: str
    critique: str


def _data_completeness(intel: WorkflowIntelligence, diagnosis: WorkflowDiagnosis | None = None) -> float:
    if diagnosis is not None:
        return diagnosis.data_completeness
    return round(len(set(ESSENTIAL_FACTS) & intel.model_fields_set) / len(ESSENTIAL_FACTS), 2)


_SYSTEM = """You are AgentSense's Recommendation Agent. Explain the prescribed design for this
CUSTOMER workflow, not AgentSense itself. The required design family, primary pattern, autonomy,
and human gate are authoritative constraints from the deterministic readiness score.
Use ONLY IDs in retrieved_patterns, include every required_pattern_id, and match the prescribed
design and autonomy exactly. Do not recommend multi-agent or autonomous systems for Low or
Not Suitable workflows. Cite the supplied patterns; never invent names, IDs, or sources.
Discuss limitations and the need for validation; completeness is NOT confidence in correctness."""


class RecommendationAgent:
    def __init__(self):
        self.use_mock = demo_mode()

    def build_query(self, intel: WorkflowIntelligence, score: AgentSuitabilityScore) -> str:
        return f"{intel.workflow_name}. {intel.summary}. {score.recommended_pattern}. Compliance {intel.compliance_sensitivity}."

    def generate_recommendation(self, score: AgentSuitabilityScore, azure_mapping: dict,
                                intel: WorkflowIntelligence, patterns: list | None = None,
                                diagnosis: WorkflowDiagnosis | None = None) -> dict:
        family, primary = _DESIGNS[score.classification]
        required = (primary, "p04") if score.requires_hitl and family != "standard_software" else (primary,)
        if patterns is None:
            patterns = retrieve_patterns(self.build_query(intel, score), top_k=4, required_ids=required)
        # Only readiness-compatible patterns enter generation, even if lexical retrieval ranks another design highly.
        patterns = [p for p in patterns if p.get("id") in required]
        by_id = {p["id"]: p for p in patterns}
        if not all(pattern_id in by_id for pattern_id in required):
            logger.error("Recommendation lacks grounding for the required design.")
            raise InvalidDependencyResponse("search")

        constraints = {"design_family": family, "autonomy_level": score.autonomy_level,
                       "requires_hitl": score.requires_hitl, "required_pattern_ids": required}
        if self.use_mock:
            result = Recommendation(
                design_family=family, autonomy_level=score.autonomy_level, requires_hitl=score.requires_hitl,
                pattern_ids=list(required),
                memory_strategy="Retain case state and audit records; do not reuse customer data as unvalidated model memory.",
                governance="Human approval before consequential actions." if score.requires_hitl else
                           "Bound tool permissions, retain audit records, and validate quality before enabling actions.",
                justification=f"{intel.workflow_name}: readiness {score.agent_score}/100 supports {score.recommended_pattern}. "
                              f"Rules are {intel.rule_stability}; data availability is {intel.data_availability}.",
                critique="Fictional demo facts and estimated effort must be replaced with measured customer baselines.",
            )
        else:
            payload = json.dumps({"constraints": constraints, "workflow": intel.model_dump(),
                                  "score": score.model_dump(), "azure_services": azure_mapping,
                                  "retrieved_patterns": patterns})
            result = structured_call(get_chat_llm(temperature=0.2), _SYSTEM, payload, Recommendation)
        if (result.design_family != family or result.autonomy_level != score.autonomy_level
                or result.requires_hitl != score.requires_hitl
                or len(set(result.pattern_ids)) != len(result.pattern_ids)
                or not set(required).issubset(result.pattern_ids)
                or not set(result.pattern_ids).issubset(by_id)):
            logger.error("Recommendation contradicted readiness constraints or invented a pattern citation.")
            raise InvalidDependencyResponse("openai")
        out = result.model_dump()
        out["automation_strategy"] = f"{score.recommended_pattern} for {intel.workflow_name}; autonomy: {score.autonomy_level}."
        out["recommended_patterns"] = [by_id[key]["name"] for key in result.pattern_ids]
        out["pattern_references"] = [by_id[key] for key in result.pattern_ids]
        out["data_completeness"] = _data_completeness(intel, diagnosis)
        out["confidence_basis"] = "Completeness measures supplied essential fields, not model accuracy or outcome confidence."
        out["_retrieved_patterns"] = patterns
        return out


recommendation_agent = RecommendationAgent()

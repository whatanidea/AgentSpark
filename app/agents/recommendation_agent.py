import json
import logging
from typing import List

from pydantic import BaseModel, Field

from app.utils.models import AgentSuitabilityScore, WorkflowIntelligence
from app.utils.llm import get_chat_llm, structured_call, azure_is_configured
from app.rag.retrieval import retrieve_patterns

logger = logging.getLogger(__name__)


class Recommendation(BaseModel):
    automation_strategy: str = Field(..., description="The core agentic approach to take")
    recommended_patterns: List[str] = Field(default_factory=list, description="Names of the design patterns to apply")
    memory_strategy: str = ""
    governance: str = ""
    justification: str = Field(..., description="Why this is the right design for this workflow")
    critique: str = Field(default="", description="Self-critique: the biggest risk or weakness in this recommendation")
    confidence: float = Field(default=0.0, description="0-1 confidence, recomputed from data completeness")


def _data_completeness(intel) -> float:
    """How much real signal we have — drives recommendation confidence."""
    checks = [
        intel.steps > 0, intel.decision_points > 0, len(intel.systems) > 0,
        intel.volume_per_day > 0, intel.exceptions_per_week > 0,
        intel.summary.strip() != "" and intel.workflow_name.lower() not in ("unknown", "unknown workflow"),
        intel.data_availability.lower() in ("high", "medium", "low"),
    ]
    return round(sum(1 for c in checks if c) / len(checks), 2)


_SYSTEM = """You are AgentSense's Recommendation Agent — a Principal AI Architect. You are given a
workflow profile, its Agentification Readiness score, the recommended Azure services, and a set of
RETRIEVED DESIGN PATTERNS from our curated library. Recommend a concrete agentic architecture that
COMPOSES the most relevant retrieved patterns. Reference patterns by name in recommended_patterns and
justify the design against the workflow's specific characteristics (decision density, compliance,
volume, rule stability). Be specific and pragmatic — if the score is low, it is valid to recommend
RPA or no agent at all. In `critique`, honestly state the single biggest risk or weakness of your
own recommendation (a good architect names the failure mode)."""


class RecommendationAgent:
    def __init__(self):
        self.use_mock = not azure_is_configured()
        self.llm = get_chat_llm(temperature=0.3)

    def build_query(self, intel: WorkflowIntelligence, score: AgentSuitabilityScore) -> str:
        return (
            f"{intel.workflow_name}. {intel.summary} "
            f"Decision points: {intel.decision_points}, systems: {len(intel.systems)}, "
            f"compliance: {intel.compliance_sensitivity}, rule stability: {intel.rule_stability}, "
            f"unstructured content: {intel.unstructured_content}, error cost: {intel.error_cost}. "
            f"Suitability: {score.classification} ({score.agent_score}/100)."
        )

    def generate_recommendation(self, score: AgentSuitabilityScore, azure_mapping: dict,
                                intel: WorkflowIntelligence, patterns: list | None = None) -> dict:
        # Ground the recommendation in retrieved patterns (RAG).
        if patterns is None:
            patterns = retrieve_patterns(self.build_query(intel, score), top_k=4)
        pattern_names = [p.get("name") for p in patterns]

        if self.use_mock:
            return {
                "automation_strategy": "Compose a Supervisor/Worker multi-agent system fronted by a "
                                       "Conversational Diagnostic Agent, with a Human-in-the-Loop Gate "
                                       "before any irreversible financial action.",
                "recommended_patterns": pattern_names or ["Supervisor / Worker Multi-Agent",
                                                          "Human-in-the-Loop Gate", "RAG-Grounded Agent"],
                "memory_strategy": "Episodic + long-term memory in Azure Cosmos DB keyed by case ID.",
                "governance": "Guardrail/policy filter on I/O; full audit trail; human approval on "
                              "high-value exceptions.",
                "justification": "High decision density and cross-system coordination favour multi-agent "
                                 "orchestration, while high compliance sensitivity mandates a HITL gate.",
                "critique": "Biggest risk: exception-handling quality — if the long tail of edge cases is "
                            "under-specified, the worker agents may over-escalate and erode the ROI.",
                "confidence": _data_completeness(intel),
                "_retrieved_patterns": patterns,
            }

        payload = json.dumps({
            "score": score.model_dump(),
            "azure_services": azure_mapping,
            "workflow": intel.model_dump(),
            "retrieved_patterns": patterns,
        })
        result = structured_call(self.llm, _SYSTEM, payload, Recommendation)
        out = result.model_dump() if result else {
            "automation_strategy": "Unavailable", "recommended_patterns": pattern_names,
            "memory_strategy": "", "governance": "", "justification": "LLM unavailable.", "critique": "",
        }
        # Confidence is grounded in data completeness, not the model's own optimism.
        out["confidence"] = _data_completeness(intel)
        out["_retrieved_patterns"] = patterns
        return out


recommendation_agent = RecommendationAgent()

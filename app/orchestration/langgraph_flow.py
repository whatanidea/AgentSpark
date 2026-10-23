import time
import logging
from uuid import uuid4
from typing import TypedDict, Optional, Dict, Any, List

from langchain_core.callbacks import BaseCallbackHandler
from langgraph.graph import StateGraph, END

class TokenCountingCallback(BaseCallbackHandler):
    def __init__(self):
        self.total_tokens = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0

    def on_llm_end(self, response, **kwargs):
        for generation in response.generations:
            for g in generation:
                if hasattr(g, "message"):
                    msg = g.message
                    if hasattr(msg, "usage_metadata") and msg.usage_metadata:
                        self.total_tokens += msg.usage_metadata.get("total_tokens", 0)
                        self.prompt_tokens += msg.usage_metadata.get("input_tokens", 0)
                        self.completion_tokens += msg.usage_metadata.get("output_tokens", 0)
                    elif hasattr(msg, "response_metadata") and "token_usage" in msg.response_metadata:
                        usage = msg.response_metadata["token_usage"]
                        self.total_tokens += usage.get("total_tokens", 0)
                        self.prompt_tokens += usage.get("prompt_tokens", 0)
                        self.completion_tokens += usage.get("completion_tokens", 0)

from app.utils.models import (
    WorkflowState, WorkflowIntelligence, AgentSuitabilityScore, EnterpriseContext,
    ROIEstimate, WorkflowStatus, WorkflowDiagnosis, DemoScenario, ROIAssumptions, EvidenceEntry,
)
from app.utils.evidence import build_evidence_report
from app.agents.diagnostic_agent import diagnostic_agent
from app.agents.mapping_agent import mapping_agent
from app.agents.recommendation_agent import recommendation_agent
from app.agents.blueprint_agent import blueprint_agent
from app.agents.governance_agent import governance_agent
from app.scoring.scoring_engine import scoring_engine
from app.scoring.roi import estimate_roi
from app.database.cosmos_client import db_client

logger = logging.getLogger(__name__)


class GraphState(TypedDict):
    session_id: str
    enterprise_context: Optional[EnterpriseContext]
    chat_history: List[Dict[str, str]]
    demo_scenario: Optional[DemoScenario]
    diagnosis: Optional[WorkflowDiagnosis]
    evidence_register: List[EvidenceEntry]
    evidence_revision: int
    evidence_report: Optional[Dict[str, Any]]
    roi_assumptions: ROIAssumptions
    workflow_intelligence: Optional[WorkflowIntelligence]
    suitability_score: Optional[AgentSuitabilityScore]
    cloud_mapping: Optional[Dict[str, Any]]
    retrieved_patterns: List[Dict[str, Any]]
    recommendation: Optional[Dict[str, Any]]
    governance: Optional[Dict[str, Any]]
    roi: Optional[Dict[str, Any]]
    blueprint: Optional[Dict[str, Any]]
    trace: List[Dict[str, Any]]
    status: WorkflowStatus


def _trace(state: GraphState, agent: str, detail: str, started: float, status: str = "ok"):
    state.setdefault("trace", []).append({
        "step": len(state.get("trace", [])) + 1,
        "agent": agent,
        "status": status,
        "detail": detail,
        "duration_ms": int((time.perf_counter() - started) * 1000),
    })


# ── Nodes ────────────────────────────────────────────────────────────────
def extract_intelligence(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[1/7] Diagnostic Agent → extracting workflow intelligence")
    diagnosis = diagnostic_agent.analyze_chat_history(
        state["chat_history"], state.get("enterprise_context"), state.get("demo_scenario"),
    )
    state["diagnosis"] = diagnosis
    state["evidence_report"] = build_evidence_report(
        state.get("evidence_register", []), state.get("evidence_revision", 0), diagnosis)
    intel = diagnosis.intelligence
    state["workflow_intelligence"] = intel
    if diagnosis.missing_facts:
        state["status"] = "needs_clarification"
        _trace(state, "Diagnostic Agent", f"Clarification required: {', '.join(diagnosis.missing_facts)}. "
               "Scoring, ROI and blueprint withheld.", t, status="warn")
        return state
    _trace(state, "Diagnostic Agent", f"Extracted '{intel.workflow_name}' ({intel.steps} steps, "
           f"{intel.decision_points} decisions, {len(intel.systems)} systems).", t)
    return state


def score_workflow(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[2/7] Scoring Engine → Agentification Readiness Index")
    score = scoring_engine.evaluate(state["workflow_intelligence"])
    state["suitability_score"] = score
    _trace(state, "Scoring Engine", f"Readiness {score.agent_score}/100 ({score.classification}); "
           f"12 criteria evaluated; HITL={'required' if score.requires_hitl else 'optional'}.", t)
    return state


def map_services(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[3/7] Mapping Agent: target cloud service mapping")
    state["cloud_mapping"] = mapping_agent.map_services(
        state["workflow_intelligence"], state["suitability_score"], state["enterprise_context"])
    _trace(state, "Mapping Agent",
           f"Mapped {state['cloud_mapping']['cloud_name']} candidates (AI: {state['cloud_mapping'].get('ai')}).", t)
    return state


def generate_recommendations(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[4/7] Recommendation Agent → RAG-grounded design")
    state["evidence_report"] = build_evidence_report(
        state.get("evidence_register", []), state.get("evidence_revision", 0),
        state["diagnosis"], state["suitability_score"])
    rec = recommendation_agent.generate_recommendation(
        state["suitability_score"], state["cloud_mapping"], state["workflow_intelligence"],
        diagnosis=state["diagnosis"],
        target_cloud=state["enterprise_context"].target_cloud,
        assessment_evidence=state["evidence_report"],
    )
    state["retrieved_patterns"] = rec.pop("_retrieved_patterns", [])
    state["recommendation"] = rec
    _trace(state, "Recommendation Agent", f"Retrieved {len(state['retrieved_patterns'])} patterns; "
           f"composed: {', '.join(rec.get('recommended_patterns', [])[:3])}. "
           f"Data completeness {int(rec['data_completeness']*100)}% (not model confidence).", t)
    return state


def evaluate_governance(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[6/7] Governance Agent → enterprise compliance & risk rules")
    result = governance_agent.evaluate(
        state["workflow_intelligence"], state["suitability_score"], state["recommendation"],
        ROIEstimate.model_validate(state["roi"]),
    )
    state["governance"] = result.model_dump()
    _trace(state, "Governance Agent", f"Decision: {result.decision}; "
           f"Risk {result.overall_risk}; "
           f"{len(result.triggered_rules)} rules triggered.", t)
    return state


def estimate_value(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[5/7] ROI Engine → value estimate")
    roi = estimate_roi(state["workflow_intelligence"], state["suitability_score"], state["roi_assumptions"])
    state["roi"] = roi.model_dump()
    _trace(state, "ROI Engine", f"~${roi.cost_saved_per_year:,}/yr saved, "
           f"{roi.roi_multiple}x ROI, payback {roi.payback_months} mo.", t)
    return state


def create_blueprint(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[7/7] Blueprint Agent → architecture + scaffold")
    state["blueprint"] = blueprint_agent.generate_blueprint(
        state["suitability_score"], state["recommendation"],
        intelligence=state["workflow_intelligence"], context=state["enterprise_context"],
        mapping=state["cloud_mapping"], governance=state["governance"], roi=state["roi"],
        diagnosis=state["diagnosis"],
        assessment_evidence=state["evidence_report"],
    )
    gov = state.get("governance") or {}
    state["status"] = "awaiting_human_review" if gov.get("decision") == "HUMAN_REVIEW_REQUIRED" else "completed"
    _trace(state, "Blueprint Agent", f"Blueprint generated; final status: {state['status']}.", t)
    return state


def reject_recommendation(state: GraphState) -> GraphState:
    t = time.perf_counter()
    state["blueprint"] = None
    state["status"] = "rejected"
    _trace(state, "Governance Outcome", "Recommendation rejected; no agentic blueprint generated.",
           t, status="warn")
    return state


def route_governance(state: GraphState) -> str:
    return "reject_recommendation" if state["governance"]["decision"] == "REJECT" else "create_blueprint"


# ── Graph wiring ─────────────────────────────────────────────────────────
workflow = StateGraph(GraphState)
workflow.add_node("extract_intelligence", extract_intelligence)
workflow.add_node("score_workflow", score_workflow)
workflow.add_node("map_services", map_services)
workflow.add_node("generate_recommendations", generate_recommendations)
workflow.add_node("evaluate_governance", evaluate_governance)
workflow.add_node("estimate_value", estimate_value)
workflow.add_node("create_blueprint", create_blueprint)
workflow.add_node("reject_recommendation", reject_recommendation)

workflow.set_entry_point("extract_intelligence")
workflow.add_conditional_edges("extract_intelligence",
                               lambda state: "clarify" if state["status"] == "needs_clarification" else "score",
                               {"clarify": END, "score": "score_workflow"})
workflow.add_edge("score_workflow", "map_services")
workflow.add_edge("map_services", "generate_recommendations")
workflow.add_edge("generate_recommendations", "estimate_value")
workflow.add_edge("estimate_value", "evaluate_governance")
workflow.add_conditional_edges("evaluate_governance", route_governance, {
    "reject_recommendation": "reject_recommendation",
    "create_blueprint": "create_blueprint",
})
workflow.add_edge("create_blueprint", END)
workflow.add_edge("reject_recommendation", END)

orchestrator_app = workflow.compile()


def run_orchestration(session_id: str, roi_assumptions: ROIAssumptions | None = None) -> WorkflowState:
    """Load state from DB, run the 7-stage LangGraph flow, persist, and return it."""
    db_state = db_client.get_workflow_state(session_id)
    if roi_assumptions is not None:
        db_state.roi_assumptions = roi_assumptions

    initial_state: GraphState = {
        "session_id": db_state.session_id,
        "enterprise_context": db_state.enterprise_context,
        "chat_history": db_state.chat_history,
        "demo_scenario": db_state.demo_scenario,
        "diagnosis": None,
        "evidence_register": db_state.evidence_register,
        "evidence_revision": db_state.evidence_revision,
        "evidence_report": None,
        "roi_assumptions": db_state.roi_assumptions,
        "workflow_intelligence": None,
        "suitability_score": None,
        "cloud_mapping": None,
        "retrieved_patterns": [],
        "recommendation": None,
        "governance": None,
        "roi": None,
        "blueprint": None,
        "trace": [],
        "status": "processing",
    }

    cb = TokenCountingCallback()
    result = orchestrator_app.invoke(
        initial_state,
        config={"callbacks": [cb]}
    )
    
    logger.info(f"Total tokens used for this run: {cb.total_tokens} (Prompt: {cb.prompt_tokens}, Completion: {cb.completion_tokens})")

    db_state.workflow_intelligence = result["workflow_intelligence"]
    db_state.diagnosis = result["diagnosis"]
    db_state.evidence_report = result["evidence_report"]
    db_state.suitability_score = result["suitability_score"]
    db_state.cloud_mapping = result["cloud_mapping"]
    db_state.azure_mapping = result["cloud_mapping"] if db_state.enterprise_context.target_cloud == "azure" else None
    db_state.retrieved_patterns = result["retrieved_patterns"]
    db_state.architecture_recommendation = {
        "mapping": result["cloud_mapping"],
        "strategy": result["recommendation"],
        "patterns": result["retrieved_patterns"],
    } if result["recommendation"] is not None else None
    db_state.governance = result["governance"]
    db_state.roi = result["roi"]
    db_state.blueprint = result["blueprint"]
    db_state.trace = result["trace"]
    db_state.status = result["status"]
    db_state.analysis_id = str(uuid4()) if result["status"] != "needs_clarification" else None
    db_state.human_review = None
    db_state.decision_recorded_at = None
    
    from app.utils.models import TokenUsage
    db_state.token_usage = TokenUsage(
        total_tokens=cb.total_tokens,
        prompt_tokens=cb.prompt_tokens,
        completion_tokens=cb.completion_tokens
    )

    db_client.save_workflow_state(db_state)
    return db_state

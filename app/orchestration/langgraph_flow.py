import time
import logging
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
)
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
    workflow_intelligence: Optional[WorkflowIntelligence]
    suitability_score: Optional[AgentSuitabilityScore]
    azure_mapping: Optional[Dict[str, Any]]
    retrieved_patterns: List[Dict[str, Any]]
    recommendation: Optional[Dict[str, Any]]
    governance: Optional[Dict[str, Any]]
    roi: Optional[Dict[str, Any]]
    blueprint: Optional[Dict[str, Any]]
    trace: List[Dict[str, Any]]
    status: str


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
    intel = diagnostic_agent.analyze_chat_history(state["chat_history"], state.get("enterprise_context"))
    state["workflow_intelligence"] = intel
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
    logger.info("[3/7] Mapping Agent → Azure service mapping")
    state["azure_mapping"] = mapping_agent.map_services(state["workflow_intelligence"])
    _trace(state, "Mapping Agent", f"Mapped Azure stack (AI: {state['azure_mapping'].get('ai')}).", t)
    return state


def generate_recommendations(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[4/7] Recommendation Agent → RAG-grounded design")
    rec = recommendation_agent.generate_recommendation(
        state["suitability_score"], state["azure_mapping"], state["workflow_intelligence"],
    )
    state["retrieved_patterns"] = rec.pop("_retrieved_patterns", [])
    state["recommendation"] = rec
    _trace(state, "Recommendation Agent", f"Retrieved {len(state['retrieved_patterns'])} patterns; "
           f"composed: {', '.join(rec.get('recommended_patterns', [])[:3])}. "
           f"Confidence {int(rec.get('confidence', 0)*100)}%.", t)
    return state


def evaluate_governance(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[5/7] Governance Agent → enterprise compliance & risk rules")
    result = governance_agent.evaluate(
        state["workflow_intelligence"], state["suitability_score"], state["recommendation"],
    )
    state["governance"] = result.model_dump()
    _trace(state, "Governance Agent", f"Decision: {result.decision}; "
           f"Risk {result.overall_risk}; "
           f"{len(result.triggered_rules)} rules triggered.", t)
    return state


def estimate_value(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[6/7] ROI Engine → value estimate")
    roi = estimate_roi(state["workflow_intelligence"], state["suitability_score"])
    state["roi"] = roi.model_dump()
    _trace(state, "ROI Engine", f"~${roi.cost_saved_per_year:,}/yr saved, "
           f"{roi.roi_multiple}x ROI, payback {roi.payback_months} mo.", t)
    return state


def create_blueprint(state: GraphState) -> GraphState:
    t = time.perf_counter()
    logger.info("[7/7] Blueprint Agent → architecture + scaffold")
    state["blueprint"] = blueprint_agent.generate_blueprint(
        state["suitability_score"], state["recommendation"],
    )
    gov = state.get("governance") or {}
    state["status"] = "awaiting_human_review" if gov.get("decision") == "HUMAN_REVIEW_REQUIRED" else "completed"
    _trace(state, "Blueprint Agent", f"Blueprint generated; final status: {state['status']}.", t)
    return state


# ── Graph wiring ─────────────────────────────────────────────────────────
workflow = StateGraph(GraphState)
workflow.add_node("extract_intelligence", extract_intelligence)
workflow.add_node("score_workflow", score_workflow)
workflow.add_node("map_services", map_services)
workflow.add_node("generate_recommendations", generate_recommendations)
workflow.add_node("evaluate_governance", evaluate_governance)
workflow.add_node("estimate_value", estimate_value)
workflow.add_node("create_blueprint", create_blueprint)

workflow.set_entry_point("extract_intelligence")
workflow.add_edge("extract_intelligence", "score_workflow")
workflow.add_edge("score_workflow", "map_services")
workflow.add_edge("map_services", "generate_recommendations")
workflow.add_edge("generate_recommendations", "evaluate_governance")
workflow.add_edge("evaluate_governance", "estimate_value")
workflow.add_edge("estimate_value", "create_blueprint")
workflow.add_edge("create_blueprint", END)

orchestrator_app = workflow.compile()


def run_orchestration(session_id: str) -> WorkflowState:
    """Load state from DB, run the 7-stage LangGraph flow, persist, and return it."""
    db_state = db_client.get_workflow_state(session_id)
    if not db_state.chat_history:
        return db_state

    initial_state: GraphState = {
        "session_id": db_state.session_id,
        "enterprise_context": db_state.enterprise_context,
        "chat_history": db_state.chat_history,
        "workflow_intelligence": None,
        "suitability_score": None,
        "azure_mapping": None,
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
    db_state.suitability_score = result["suitability_score"]
    db_state.azure_mapping = result["azure_mapping"]
    db_state.retrieved_patterns = result["retrieved_patterns"]
    db_state.architecture_recommendation = {
        "mapping": result["azure_mapping"],
        "strategy": result["recommendation"],
        "patterns": result["retrieved_patterns"],
    }
    db_state.governance = result["governance"]
    db_state.roi = result["roi"]
    db_state.blueprint = result["blueprint"]
    db_state.trace = result["trace"]
    db_state.status = result["status"]
    
    from app.utils.models import TokenUsage
    db_state.token_usage = TokenUsage(
        total_tokens=cb.total_tokens,
        prompt_tokens=cb.prompt_tokens,
        completion_tokens=cb.completion_tokens
    )

    db_client.save_workflow_state(db_state)
    return db_state

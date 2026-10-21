from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
from typing import Literal
from app.utils.models import HumanReview

from app.database.cosmos_client import db_client
from app.orchestration.langgraph_flow import run_orchestration
from app.agents.diagnostic_agent import diagnostic_agent
from app.rag.retrieval import retrieve_patterns
from app.security.guardrails import scan_input, redact_pii

router = APIRouter()


class IntakeRequest(BaseModel):
    session_id: str
    business_domain: str
    team_size: str
    existing_systems: str
    pain_points: str
    compliance_requirements: str


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    analysis_id: str = Field(min_length=1)
    decision: Literal["approve", "reject"]
    reviewer: str = Field(min_length=1, max_length=200)
    note: str = Field(min_length=1, max_length=2000)


@router.post("/intake")
async def save_intake(req: IntakeRequest):
    state = db_client.get_workflow_state(req.session_id)
    state.invalidate_analysis()
    state.enterprise_context.business_domain = req.business_domain
    state.enterprise_context.team_size = req.team_size
    state.enterprise_context.existing_systems = req.existing_systems
    state.enterprise_context.pain_points = req.pain_points
    state.enterprise_context.compliance_requirements = req.compliance_requirements
    db_client.save_workflow_state(state)
    return {"status": "success", "session_id": req.session_id}


@router.post("/chat")
async def chat_interaction(req: ChatRequest):
    state = db_client.get_workflow_state(req.session_id)

    # Security gate: screen every inbound message before it reaches the LLM.
    guard = scan_input(req.message)
    if guard.flags:
        state.guardrail_events.append({"message": req.message[:120], "result": guard.model_dump()})

    if not guard.safe:
        warning = ("🛡️ **Guardrail triggered.** Your message looks like a prompt-injection attempt, "
                   "so it was not passed to the AI agent. Please rephrase as a genuine description of "
                   "your workflow.")
        # IMPORTANT: do NOT persist the blocked message into chat_history — keeping
        # injection text out of the transcript prevents it from poisoning the later
        # diagnostic-extraction LLM call (which Azure's content filter would reject).
        db_client.save_workflow_state(state)  # persists only the guardrail_event recorded above
        return {"status": "blocked", "response": warning, "guardrail": guard.model_dump()}

    # Diagnostic Agent answers grounded in the intake context. PII is redacted before storage.
    response_text = diagnostic_agent.chat(req.message, state.chat_history, state.enterprise_context)
    state.invalidate_analysis()
    state.chat_history.append({"role": "user", "content": redact_pii(req.message)})
    state.chat_history.append({"role": "assistant", "content": response_text})
    db_client.save_workflow_state(state)
    return {"status": "success", "response": response_text, "guardrail": guard.model_dump()}


@router.post("/analyze/{session_id}")
async def analyze_workflow(session_id: str):
    try:
        s = run_orchestration(session_id)
        return {
            "status": s.status,
            "score": s.suitability_score.model_dump() if s.suitability_score else None,
            "recommendation": s.architecture_recommendation,
            "governance": s.governance,
            "roi": s.roi,
            "patterns": s.retrieved_patterns,
            "trace": s.trace,
            "analysis_id": s.analysis_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/blueprint/{session_id}")
async def get_blueprint(session_id: str):
    state = db_client.get_workflow_state(session_id)
    if not state.blueprint and state.status != "rejected":
        raise HTTPException(status_code=404, detail="Blueprint not generated yet.")

    res = dict(state.blueprint or {})
    res["status"] = state.status
    res["analysis_id"] = state.analysis_id
    res["provisional"] = state.status == "awaiting_human_review"
    res["human_review"] = state.human_review.model_dump(mode="json") if state.human_review else None
    if state.status == "rejected":
        res["alternative"] = (
            (state.governance or {}).get("rejection_package") or {}
        ).get("alternative", "Use standard software or a deterministic approval workflow without agentic loops.")
    res["enterprise_context"] = state.enterprise_context.model_dump()
    if state.suitability_score:
        res["suitability_score"] = state.suitability_score.model_dump()
    if state.workflow_intelligence:
        res["workflow_intelligence"] = state.workflow_intelligence.model_dump()
    if state.architecture_recommendation:
        res["architecture_recommendation"] = state.architecture_recommendation
    if state.governance:
        res["governance"] = state.governance
    if state.roi:
        res["roi"] = state.roi
    if state.retrieved_patterns:
        res["retrieved_patterns"] = state.retrieved_patterns
    if state.token_usage:
        res["token_usage"] = state.token_usage.model_dump() if hasattr(state.token_usage, "model_dump") else state.token_usage
    return res


@router.get("/review/{session_id}")
async def get_review(session_id: str):
    state = db_client.get_workflow_state(session_id)
    if not state.analysis_id:
        raise HTTPException(status_code=404, detail="No current analysis to review.")
    return {
        "analysis_id": state.analysis_id,
        "status": state.status,
        "governance": state.governance,
        "human_review": state.human_review.model_dump(mode="json") if state.human_review else None,
    }


@router.post("/review/{session_id}")
async def submit_review(session_id: str, req: ReviewRequest):
    state = db_client.get_workflow_state(session_id)
    if not state.analysis_id:
        raise HTTPException(status_code=404, detail="No current analysis to review.")
    if state.analysis_id != req.analysis_id:
        raise HTTPException(status_code=409, detail="Analysis changed; fetch the current recommendation before reviewing.")
    if (state.status != "awaiting_human_review"
            or not state.blueprint
            or (state.governance or {}).get("decision") != "HUMAN_REVIEW_REQUIRED"):
        raise HTTPException(status_code=409, detail="Only a pending human review can be decided.")
    state.human_review = HumanReview(**req.model_dump(), reviewed_at=datetime.now(timezone.utc))
    state.status = "completed" if req.decision == "approve" else "rejected"
    if req.decision == "reject":
        state.blueprint = None
    db_client.save_workflow_state(state)
    return {
        "status": state.status,
        "analysis_id": state.analysis_id,
        "human_review": state.human_review.model_dump(mode="json"),
    }


@router.post("/guardrail-check")
async def guardrail_check(req: ChatRequest):
    """Live security demo: screen arbitrary text for injection/PII without storing it."""
    return scan_input(req.message).model_dump()


@router.get("/patterns")
async def search_patterns(q: str = "agentic enterprise workflow", k: int = 6):
    """Expose the RAG pattern library so judges can probe retrieval directly."""
    return {"query": q, "results": retrieve_patterns(q, top_k=k)}


@router.get("/portfolio")
async def portfolio():
    """Rank a backlog of candidate workflows by agentification readiness."""
    from app.scoring.portfolio import score_backlog
    return {"portfolio": [e.model_dump() for e in score_backlog()]}

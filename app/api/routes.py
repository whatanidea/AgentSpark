from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


@router.post("/intake")
async def save_intake(req: IntakeRequest):
    state = db_client.get_workflow_state(req.session_id)
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
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/blueprint/{session_id}")
async def get_blueprint(session_id: str):
    state = db_client.get_workflow_state(session_id)
    if not state.blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not generated yet.")

    res = dict(state.blueprint)
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

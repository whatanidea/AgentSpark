import json
import logging

from pydantic import BaseModel, Field

from app.utils.models import AgentSuitabilityScore
from app.utils.llm import get_chat_llm, structured_call, azure_is_configured

logger = logging.getLogger(__name__)


class Blueprint(BaseModel):
    architecture_doc: str = Field(..., description="Markdown architecture document")
    mermaid_diagram: str = Field(..., description="Mermaid 'graph TD' source, no code fences")
    cost_estimate: str = Field(..., description="Approximate monthly Azure cost with assumptions")
    roadmap: str = Field(..., description="Markdown 30/60/90-day implementation roadmap")
    code_scaffold: str = Field(..., description="Python FastAPI + LangGraph starter scaffold")


_SYSTEM = """You are AgentSense's Blueprint Agent — a Principal AI Architect and Lead Engineer. Turn the
suitability score and architecture recommendation into an implementation-ready blueprint: a markdown
architecture doc, a Mermaid graph TD diagram (no code fences), an Azure cost estimate with assumptions,
a 30/60/90-day roadmap, and a runnable Python scaffold (FastAPI + LangGraph) reflecting the recommended
patterns. Be concrete and specific to this workflow."""

_MOCK_MERMAID = """graph TD
    U[Stakeholder] --> DA[Diagnostic Agent]
    DA --> RI[Agentification Readiness Index]
    RI --> MA[Mapping Agent]
    RI --> RA[Recommendation Agent]
    RA --> BA[Blueprint Agent]
    BA --> VA[Validation Agent]
    VA -->|approved| OUT[Blueprint + Scaffold]
    VA -->|needs review| H[Human Reviewer]
    H --> OUT"""

_MOCK_SCAFFOLD = """from fastapi import FastAPI
from langgraph.graph import StateGraph, END

app = FastAPI(title="Generated Agentic Service")

# TODO: implement nodes for each recommended pattern
def supervisor(state): ...
def worker(state): ...
def hitl_gate(state): ...

graph = StateGraph(dict)
graph.add_node("supervisor", supervisor)
graph.add_node("worker", worker)
graph.add_node("hitl_gate", hitl_gate)
graph.set_entry_point("supervisor")
graph.add_edge("supervisor", "worker")
graph.add_edge("worker", "hitl_gate")
graph.add_edge("hitl_gate", END)
runtime = graph.compile()
"""


class BlueprintAgent:
    def __init__(self):
        self.use_mock = not azure_is_configured()
        self.llm = get_chat_llm(temperature=0.2)

    def generate_blueprint(self, score: AgentSuitabilityScore, recommendation: dict) -> dict:
        if self.use_mock:
            return Blueprint(
                architecture_doc=(
                    "# Agentic Architecture Blueprint\n\n"
                    f"**Recommended pattern:** {score.recommended_pattern}\n\n"
                    "A Supervisor/Worker multi-agent system fronted by a conversational diagnostic agent. "
                    "Retrieval grounds recommendations in vetted patterns; a Human-in-the-Loop gate guards "
                    "high-value, compliance-sensitive actions; an audit trail records every decision.\n\n"
                    "## Components\n- **Orchestrator** (Azure AI Foundry + LangGraph)\n"
                    "- **Specialist agents** (Azure OpenAI GPT-4o, function calling)\n"
                    "- **Knowledge** (Azure AI Search RAG)\n- **State/Memory** (Azure Cosmos DB)\n"
                    "- **Governance** (validation agent + HITL gate + audit log)\n"
                ),
                mermaid_diagram=_MOCK_MERMAID,
                cost_estimate="~$180–$320/month at low volume: App Service B1 (~$13), Cosmos DB serverless "
                              "(~$25), AI Search Basic (~$75), Azure OpenAI usage (~$60–$200 by traffic).",
                roadmap="**0–30 days:** MVP — diagnostic + scoring + single-agent copilot in staging.\n"
                        "**31–60 days:** Add RAG grounding, validation agent, HITL gate, audit trail.\n"
                        "**61–90 days:** Scale to supervisor/worker, add evals + feedback loop, production rollout.",
                code_scaffold=_MOCK_SCAFFOLD,
            ).model_dump()

        payload = json.dumps({"score": score.model_dump(), "recommendation": recommendation})
        result = structured_call(self.llm, _SYSTEM, payload, Blueprint)
        if result is None:
            return Blueprint(
                architecture_doc="Error generating document.", mermaid_diagram=_MOCK_MERMAID,
                cost_estimate="Unknown", roadmap="Unknown", code_scaffold="# Error generating scaffold",
            ).model_dump()
        return result.model_dump()


blueprint_agent = BlueprintAgent()

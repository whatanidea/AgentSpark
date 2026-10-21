import logging

from app.utils.models import WorkflowIntelligence, AzureServiceMapping, AgentSuitabilityScore
from app.utils.llm import get_chat_llm, structured_call
from app.utils.runtime import demo_mode

logger = logging.getLogger(__name__)

_SYSTEM = """You are AgentSpark's Mapping Agent — an Azure Cloud Architect. Given a workflow's
intelligence profile, recommend the specific Microsoft Azure services that should implement the
agentic solution. Map Compute, Database, AI, Search, and Orchestration, and give a one-sentence
rationale tying the choices to the workflow's characteristics."""


class MappingAgent:
    def __init__(self):
        self.use_mock = demo_mode()

    def map_services(self, intel: WorkflowIntelligence, score: AgentSuitabilityScore | None = None) -> dict:
        if score is not None and score.classification == "Not Suitable":
            return AzureServiceMapping(
                compute="Existing application hosting", database="Existing system of record",
                ai="Not required", search="Not required", orchestration="Deterministic application code",
                rationale="Readiness does not justify an agentic system; retain standard software.",
            ).model_dump()
        if self.use_mock:
            return AzureServiceMapping(
                orchestration="Deterministic workflow with AI exception triage" if score and score.classification == "Low"
                              else "Copilot request handler" if score and score.classification == "Medium"
                              else "Azure AI Foundry + LangGraph",
                rationale=f"Illustrative stack for {intel.workflow_name}; validate availability, integrations, and pricing."
            ).model_dump()

        constraints = (f"\nRequired design: {score.recommended_pattern}; autonomy: {score.autonomy_level}. "
                       "Do not introduce agents or orchestration beyond that design." if score else "")
        result = structured_call(get_chat_llm(temperature=0.1), _SYSTEM + constraints, intel.model_dump_json(), AzureServiceMapping)
        return result.model_dump()


mapping_agent = MappingAgent()

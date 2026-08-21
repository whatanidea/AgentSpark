import logging

from app.utils.models import WorkflowIntelligence, AzureServiceMapping
from app.utils.llm import get_chat_llm, structured_call, azure_is_configured

logger = logging.getLogger(__name__)

_SYSTEM = """You are AgentSense's Mapping Agent — an Azure Cloud Architect. Given a workflow's
intelligence profile, recommend the specific Microsoft Azure services that should implement the
agentic solution. Map Compute, Database, AI, Search, and Orchestration, and give a one-sentence
rationale tying the choices to the workflow's characteristics."""


class MappingAgent:
    def __init__(self):
        self.use_mock = not azure_is_configured()
        self.llm = get_chat_llm(temperature=0.1)

    def map_services(self, intel: WorkflowIntelligence) -> dict:
        if self.use_mock:
            return AzureServiceMapping(
                rationale="High-volume, compliance-sensitive workflow → managed hosting, durable state, "
                          "grounded retrieval, and an auditable orchestration layer."
            ).model_dump()

        result = structured_call(self.llm, _SYSTEM, intel.model_dump_json(), AzureServiceMapping)
        if result is None:
            return AzureServiceMapping(rationale="Default mapping (LLM unavailable).").model_dump()
        return result.model_dump()


mapping_agent = MappingAgent()

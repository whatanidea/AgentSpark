import logging

from app.utils.models import WorkflowIntelligence, AzureServiceMapping
from app.utils.llm import get_chat_llm, structured_call
from app.utils.runtime import demo_mode

logger = logging.getLogger(__name__)

_SYSTEM = """You are AgentSense's Mapping Agent — an Azure Cloud Architect. Given a workflow's
intelligence profile, recommend the specific Microsoft Azure services that should implement the
agentic solution. Map Compute, Database, AI, Search, and Orchestration, and give a one-sentence
rationale tying the choices to the workflow's characteristics."""


class MappingAgent:
    def __init__(self):
        self.use_mock = demo_mode()

    def map_services(self, intel: WorkflowIntelligence) -> dict:
        if self.use_mock:
            return AzureServiceMapping(
                rationale="High-volume, compliance-sensitive workflow → managed hosting, durable state, "
                          "grounded retrieval, and an auditable orchestration layer."
            ).model_dump()

        result = structured_call(get_chat_llm(temperature=0.1), _SYSTEM, intel.model_dump_json(), AzureServiceMapping)
        return result.model_dump()


mapping_agent = MappingAgent()

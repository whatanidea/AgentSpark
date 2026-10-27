import logging
import json

from app.utils.models import WorkflowIntelligence, CloudServiceMapping, AgentSuitabilityScore, EnterpriseContext
from app.utils.llm import get_chat_llm, structured_call, model_dependency
from app.utils.runtime import demo_mode
from app.utils.errors import InvalidDependencyResponse
from app.agents.cloud_catalog import CATALOGS, CLOUD_NAMES, LIMITATIONS, AWS_REFERENCES

logger = logging.getLogger(__name__)

_SYSTEM = """You are AgentSpark's Mapping Agent, assessing the CUSTOMER's selected target cloud.
Choose each service field verbatim from its supplied catalog candidates. Give a rationale tied to the
workflow and supplied deployment constraints. Do not change the cloud or imply region availability,
model access, data residency, pricing, provisioning or deployment readiness has been verified.
Existing customer systems can remain external integrations; they do not change the hosting target."""


class MappingAgent:
    def __init__(self):
        self.use_mock = demo_mode()

    def map_services(self, intel: WorkflowIntelligence, score: AgentSuitabilityScore | None = None,
                     context: EnterpriseContext | None = None) -> dict:
        context = context or EnterpriseContext()
        cloud = context.target_cloud
        catalog = CATALOGS[cloud]
        if score is not None and score.classification == "Not Suitable":
            result = CloudServiceMapping(
                compute="Existing application hosting", database="Existing system of record",
                ai="Not required", search="Not required", orchestration="Deterministic application code",
                rationale="Readiness does not justify an agentic system; retain standard software.",
            )
        elif self.use_mock:
            result = CloudServiceMapping(
                compute=catalog["compute"][0], database=catalog["database"][0],
                ai=catalog["ai"][0], search=catalog["search"][0],
                orchestration="Deterministic workflow with AI exception triage" if score and score.classification == "Low"
                              else "Copilot request handler" if score and score.classification == "Medium"
                              else catalog["orchestration"][0],
                rationale=f"Illustrative stack for {intel.workflow_name}; validate availability, integrations, and pricing."
            )
        else:
            constraints = (f"\nRequired design: {score.recommended_pattern}; autonomy: {score.autonomy_level}. "
                           "Do not introduce agents or orchestration beyond that design." if score else "")
            payload = {"workflow": intel.model_dump(), "deployment_preferences": context.model_dump(),
                       "catalog_candidates": catalog}
            result = structured_call(get_chat_llm(temperature=0.1), _SYSTEM + constraints,
                                     json.dumps(payload), CloudServiceMapping)
            if any(getattr(result, field) not in catalog[field]
                   for field in ("compute", "database", "ai", "search", "orchestration")):
                logger.error("Mapping selected a service outside the target cloud catalog.")
                raise InvalidDependencyResponse(model_dependency())
        return {**result.model_dump(), "target_cloud": cloud, "cloud_name": CLOUD_NAMES[cloud],
                "preferred_region": context.preferred_region,
                "identity": catalog["identity"], "secrets": catalog["secrets"], "monitoring": catalog["monitoring"],
                "implementation_references": AWS_REFERENCES if cloud == "aws" else [],
                "limitations": LIMITATIONS}


mapping_agent = MappingAgent()

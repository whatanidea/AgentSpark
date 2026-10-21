import json
import logging

from pydantic import BaseModel, Field

from app.utils.models import (
    AgentSuitabilityScore, WorkflowIntelligence, EnterpriseContext, WorkflowDiagnosis,
    DesignFamily, AutonomyLevel, GovernanceDecision,
)
from app.utils.llm import get_chat_llm, structured_call
from app.utils.runtime import demo_mode
from app.utils.errors import InvalidDependencyResponse

logger = logging.getLogger(__name__)


class Blueprint(BaseModel):
    design_family: DesignFamily
    autonomy_level: AutonomyLevel
    requires_hitl: bool
    pattern_ids: list[str] = Field(min_length=1, max_length=4)
    governance_decision: GovernanceDecision
    architecture_doc: str = Field(..., description="Markdown architecture for the CUSTOMER workflow")
    mermaid_diagram: str = Field(..., description="Mermaid graph TD of the customer workflow, no fences")
    cost_estimate: str = Field(..., description="Unpriced cost drivers; distinguish supplied budgets from assumptions")
    roadmap: str = Field(..., description="30/60/90-day roadmap that preserves the prescribed design and human gate")
    code_scaffold: str = Field(..., description="Illustrative untested scaffold, NOT deployment-ready code")


_SYSTEM = """You are AgentSense's Blueprint Agent. Design the CUSTOMER workflow, never AgentSense's
diagnostic/scoring pipeline. Use ALL supplied context, workflow facts and evidence, prescribed design,
Azure mapping, grounded pattern IDs/source references, ROI assumptions and scenarios, and policy outcome.
The prescribed design/autonomy and any human gate are mandatory; do not escalate a copilot or RPA design
into multi-agent autonomy. A HUMAN_REVIEW_REQUIRED blueprint is provisional, not approved for deployment.
Do not invent measured facts, prices, integrations, or citations. Costs without supplied pricing are
unpriced cost drivers, not Azure quotes. Include limitations. Code is illustrative, untested scaffolding;
never claim it is runnable, production-ready, or deployed. Do not include code fences in code_scaffold."""

_SCAFFOLD = '''from fastapi import FastAPI, HTTPException

app = FastAPI(title=WORKFLOW_NAME)

@app.post("/cases")
def submit_case(payload: dict):
    raise HTTPException(
        status_code=501,
        detail="Scaffold only: implement validated integrations, authorization, audit, and required approval gates.",
    )
'''


class BlueprintAgent:
    def __init__(self):
        self.use_mock = demo_mode()

    def generate_blueprint(self, score: AgentSuitabilityScore, recommendation: dict, *,
                           intelligence: WorkflowIntelligence, context: EnterpriseContext,
                           mapping: dict, governance: dict, roi: dict, diagnosis: WorkflowDiagnosis) -> dict:
        if governance["decision"] == "REJECT" or diagnosis.missing_facts:
            raise ValueError("A rejected or incomplete workflow cannot receive a blueprint.")
        payload = {
            "workflow": intelligence.model_dump(), "context": context.model_dump(), "score": score.model_dump(),
            "recommendation": recommendation, "azure_mapping": mapping, "governance": governance,
            "roi": roi, "diagnosis": diagnosis.model_dump(),
        }
        if self.use_mock:
            citations = "\n".join(f"- {p['id']}: {p['name']} ({p['source_ref']}; SHA256 {p['content_sha256']})"
                                  for p in recommendation["pattern_references"])
            gate = "Mandatory human approval" if score.requires_hitl else "Bounded action policy and exception review"
            diagram = (f'graph TD\n    I[Customer workflow input] --> P["{score.recommended_pattern}"]\n'
                       f'    P --> G["{gate}"]\n    G --> S[Existing systems]\n    G --> A[Audit record]')
            result = Blueprint(
                design_family=recommendation["design_family"], autonomy_level=score.autonomy_level,
                requires_hitl=score.requires_hitl, pattern_ids=recommendation["pattern_ids"],
                governance_decision=governance["decision"],
                architecture_doc=(
                    f"# {intelligence.workflow_name}\n\n{intelligence.summary}\n\n"
                    f"**Fictional demo fixture, not extracted customer facts.**\n\n"
                    f"**Design:** {score.recommended_pattern}; autonomy {score.autonomy_level}.\n"
                    f"**Policy:** {governance['decision']}. {gate}.\n\n"
                    f"**Systems:** {', '.join(intelligence.systems) or 'None'}.\n"
                    f"**Workload:** {intelligence.volume_per_day}/day, {intelligence.steps} steps, "
                    f"{intelligence.decision_points} decisions, {intelligence.exceptions_per_week} exceptions/week.\n"
                    f"**Hosting:** {mapping['compute']}; state: {mapping['database']}; "
                    f"AI: {mapping['ai']}; orchestration: {mapping['orchestration']}.\n\n"
                    f"## Grounding (keyword lookup + required design IDs)\n{citations}\n\n"
                    f"## Estimate limitations\n{roi['assumptions']}\n"
                    "Validate handling time, labor rates, data access, quality thresholds and integration permissions "
                    "with the workflow owner before implementation. Labor effort is not guaranteed cash savings."
                ),
                mermaid_diagram=diagram,
                cost_estimate="Unpriced cost drivers: hosting, model tokens, search, state storage, monitoring and integration. "
                              "No live Azure pricing was queried. " +
                              (f"Operating budget assumption: ${roi['assumption_inputs']['annual_operating_cost']:,}/year; "
                               "a supplied assumption, not an Azure quote." if roi["operating_costs_included"] else
                               "Annual operating cost is unknown; net savings are unavailable."),
                roadmap=f"**0-30 days:** Measure {intelligence.workflow_name} baseline and validate data and tool access.\n"
                        f"**31-60 days:** Pilot {score.recommended_pattern} in staging; implement {gate.lower()} and audit.\n"
                        "**61-90 days:** Run quality, failure and approval-gate tests; obtain owner sign-off; "
                        "roll out gradually without increasing the prescribed autonomy.",
                code_scaffold=(
                    f"WORKFLOW_NAME = {intelligence.workflow_name!r}\n"
                    f"DESIGN_FAMILY = {recommendation['design_family']!r}\n"
                    f"AUTONOMY = {score.autonomy_level!r}\n"
                    f"REQUIRES_HUMAN_APPROVAL = {score.requires_hitl!r}\n"
                    f"PATTERN_IDS = {recommendation['pattern_ids']!r}\n\n" + _SCAFFOLD
                ),
            )
        else:
            result = structured_call(get_chat_llm(temperature=0.2), _SYSTEM, json.dumps(payload), Blueprint)
        if (result.design_family != recommendation["design_family"]
                or result.autonomy_level != score.autonomy_level
                or result.requires_hitl != score.requires_hitl
                or set(result.pattern_ids) != set(recommendation["pattern_ids"])
                or len(result.pattern_ids) != len(set(result.pattern_ids))
                or result.governance_decision != governance["decision"]):
            logger.error("Blueprint contradicted the prescribed design, sources, autonomy, or policy outcome.")
            raise InvalidDependencyResponse("openai")
        out = result.model_dump()
        out["scaffold_status"] = "illustrative_untested"
        out["code_scaffold"] = "# Illustrative, untested scaffold. Not deployment-ready.\n" + out["code_scaffold"]
        out["design_constraints"] = {
            "workflow_name": intelligence.workflow_name, "design_family": recommendation["design_family"],
            "autonomy_level": score.autonomy_level, "requires_hitl": score.requires_hitl,
            "pattern_ids": recommendation["pattern_ids"], "policy_decision": governance["decision"],
        }
        return out


blueprint_agent = BlueprintAgent()

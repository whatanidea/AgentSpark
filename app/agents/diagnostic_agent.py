import logging
import re

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from app.utils.models import WorkflowDiagnosis, EnterpriseContext, DemoScenario, ESSENTIAL_FACTS, FactEvidence
from app.agents.demo_scenarios import demo_diagnosis
from app.utils.llm import get_chat_llm, structured_call, invoke_llm
from app.utils.runtime import demo_mode
from app.utils.errors import InvalidDependencyResponse

logger = logging.getLogger(__name__)

_EXTRACTION_ATTEMPTS = 2
_TYPOGRAPHIC = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
                              "\u2013": "-", "\u2014": "-", "\u00a0": " "})


def _normalize_quote(text: str) -> str:
    """Compare quotes verbatim modulo whitespace and typographic punctuation."""
    return re.sub(r"\s+", " ", text.translate(_TYPOGRAPHIC)).strip()

_INTERVIEW_SYSTEM = """You are AgentSpark's Diagnostic Agent — a senior Enterprise AI Transformation
Architect interviewing a stakeholder. Your goal is to understand one business workflow well enough to
judge whether AI agents belong there.

Probe for: process steps, decision points, systems involved, exception frequency, daily volume,
compliance sensitivity, how much human judgement is required, how stable the rules are, and how much
of the work is unstructured text/documents. Ask ONE sharp, professional question at a time. Keep
replies under 60 words. Do not give recommendations yet — you are only gathering intelligence."""

_EXTRACT_SYSTEM = """You are AgentSpark's Diagnostic Agent. From the enterprise context and interview
transcript, extract a WorkflowDiagnosis with intelligence and evidence for EVERY essential field:
workflow_name, summary, steps, departments, decision_points, systems, exceptions_per_week, volume_per_day,
compliance_sensitivity, data_availability, rule_stability, human_judgment, unstructured_content, error_cost.
Set each fact's status to supplied, inferred, or missing. Supplied facts MUST have an exact verbatim quote
from INTERVIEW USER INPUT or ENTERPRISE CONTEXT, and source interview or intake respectively.
The source field only accepts interview, intake, or none (never inferred or missing); use none when
no quote backs the fact.
Never treat assistant messages, defaults, or plausible guesses as supplied facts. Explicit zero counts
and explicitly empty system lists are valid supplied facts. Inferences must be marked inferred and
cannot substitute for essential facts. Leave absent values at schema defaults and mark missing;
if no workflow can be identified, return intelligence null. Do not manufacture evidence.
Categorical values must be High/Medium/Low, or Stable/Evolving/Volatile for rule_stability."""


class DiagnosticAgent:
    def __init__(self):
        self.use_mock = demo_mode()
        if self.use_mock:
            logger.info("DiagnosticAgent is running in explicit demo mode.")

    @staticmethod
    def _context_block(context: EnterpriseContext | None) -> str:
        if not context:
            return ""
        return (
            "ENTERPRISE CONTEXT (from intake form):\n"
            f"- Business domain: {context.business_domain or 'n/a'}\n"
            f"- Team size: {context.team_size or 'n/a'}\n"
            f"- Existing systems: {context.existing_systems or 'n/a'}\n"
            f"- Pain points: {context.pain_points or 'n/a'}\n"
            f"- Compliance requirements: {context.compliance_requirements or 'n/a'}\n"
        )

    def chat(self, user_message: str, chat_history: list, context: EnterpriseContext | None = None,
             demo_scenario: DemoScenario | None = None) -> str:
        """Handle one turn of the diagnostic interview, grounded in the intake context."""
        if self.use_mock:
            if demo_scenario is None:
                return WorkflowDiagnosis(demo_scenario_required=True).follow_up_questions[0]
            return (f"**[Demo fixture: {demo_scenario}]** Analysis uses the selected fictional scenario, "
                    "not facts extracted from your messages. Change the sample in Enterprise Context "
                    "to explore a different workflow; use live mode to analyze your own interview.")

        system = _INTERVIEW_SYSTEM
        ctx = self._context_block(context)
        if ctx:
            system = system + "\n\n" + ctx

        messages = [SystemMessage(content=system)]
        for msg in chat_history:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg.get("content", "")))
            else:
                messages.append(AIMessage(content=msg.get("content", "")))
        messages.append(HumanMessage(content=user_message))

        content = invoke_llm(get_chat_llm(temperature=0.2), messages).content
        if not isinstance(content, str) or not content.strip():
            logger.error("Diagnostic chat received an empty or non-text completion.")
            raise InvalidDependencyResponse("openai")
        return content

    def analyze_chat_history(self, chat_history, context: EnterpriseContext | None = None,
                             demo_scenario: DemoScenario | None = None) -> WorkflowDiagnosis:
        """Extract facts with verifiable provenance; unknown facts block downstream analysis."""
        if self.use_mock:
            return demo_diagnosis(demo_scenario) if demo_scenario else WorkflowDiagnosis(demo_scenario_required=True)

        sources = {
            "intake": self._context_block(context),
            "interview": "\n".join(m.get("content", "") for m in chat_history if m.get("role") == "user"),
        }
        transcript = sources["intake"] + "\nINTERVIEW USER INPUT:\n" + sources["interview"]
        normalized = {name: _normalize_quote(text) for name, text in sources.items()}
        # Model output is nondeterministic: one fresh extraction may cite verbatim where the first paraphrased.
        for attempt in range(1, _EXTRACTION_ATTEMPTS + 1):
            diagnosis = structured_call(get_chat_llm(temperature=0.2), _EXTRACT_SYSTEM, transcript, WorkflowDiagnosis)
            diagnosis.demo_scenario_required = False
            diagnosis.evidence = {key: diagnosis.evidence.get(key, FactEvidence()) for key in ESSENTIAL_FACTS}
            unverifiable = [
                key for key, evidence in diagnosis.evidence.items()
                if evidence.status == "supplied" and (
                    not _normalize_quote(evidence.quote) or evidence.source not in sources
                    or _normalize_quote(evidence.quote) not in normalized[evidence.source]
                    or diagnosis.intelligence is None or key not in diagnosis.intelligence.model_fields_set
                )
            ]
            if not unverifiable:
                return diagnosis
            logger.error("Diagnostic extraction attempt %d supplied unverifiable evidence for %s.",
                         attempt, ", ".join(unverifiable))
        raise InvalidDependencyResponse("openai")


diagnostic_agent = DiagnosticAgent()

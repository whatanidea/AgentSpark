import logging

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from app.utils.models import WorkflowIntelligence, EnterpriseContext
from app.utils.llm import get_chat_llm, structured_call, invoke_llm
from app.utils.runtime import demo_mode
from app.utils.errors import InvalidDependencyResponse

logger = logging.getLogger(__name__)

_INTERVIEW_SYSTEM = """You are AgentSense's Diagnostic Agent — a senior Enterprise AI Transformation
Architect interviewing a stakeholder. Your goal is to understand one business workflow well enough to
judge whether AI agents belong there.

Probe for: process steps, decision points, systems involved, exception frequency, daily volume,
compliance sensitivity, how much human judgement is required, how stable the rules are, and how much
of the work is unstructured text/documents. Ask ONE sharp, professional question at a time. Keep
replies under 60 words. Do not give recommendations yet — you are only gathering intelligence."""

_EXTRACT_SYSTEM = """You are AgentSense's Diagnostic Agent. From the enterprise context and interview
transcript, extract a single structured WorkflowIntelligence record. Infer reasonable values where the
user was vague, but stay faithful to what was said. Categorical fields must be one of their allowed
values (High/Medium/Low, or Stable/Evolving/Volatile for rule_stability)."""


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

    def chat(self, user_message: str, chat_history: list, context: EnterpriseContext | None = None) -> str:
        """Handle one turn of the diagnostic interview, grounded in the intake context."""
        if self.use_mock:
            return ("**[Mock mode]** Thanks. To gauge agent suitability: how many *decision points* "
                    "need human judgement in this workflow, and which systems does it touch?")

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

    def analyze_chat_history(self, chat_history, context: EnterpriseContext | None = None) -> WorkflowIntelligence:
        """Extract a structured WorkflowIntelligence record from the conversation + intake context."""
        if self.use_mock:
            return WorkflowIntelligence(
                workflow_name="Invoice Approval",
                summary="Multi-department invoice approval with finance and legal sign-off.",
                steps=8, departments=["Finance", "Legal"], decision_points=6,
                systems=["SAP", "Email", "DocuSign"], exceptions_per_week=25, volume_per_day=500,
                compliance_sensitivity="High", data_availability="High", rule_stability="Evolving",
                human_judgment="Medium", unstructured_content="High", error_cost="High",
            )

        transcript = self._context_block(context) + "\nINTERVIEW TRANSCRIPT:\n" + "\n".join(
            f"{m.get('role')}: {m.get('content','')}" for m in chat_history
        )
        return structured_call(get_chat_llm(temperature=0.2), _EXTRACT_SYSTEM, transcript, WorkflowIntelligence)


diagnostic_agent = DiagnosticAgent()

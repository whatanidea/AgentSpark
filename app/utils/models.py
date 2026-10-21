from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, StringConstraints, computed_field
from typing import List, Optional, Dict, Any, Literal, Annotated
from datetime import datetime


AutonomyLevel = Literal["Autonomous", "Supervised", "Assisted", "Manual"]
DesignFamily = Literal["supervisor_worker", "rag_copilot", "rpa_triage", "standard_software"]
GovernanceDecision = Literal["AUTO_APPROVE", "HUMAN_REVIEW_REQUIRED", "REJECT"]
RiskLevel = Literal["Low", "Medium", "High", "Critical"]
WorkflowStatus = Literal["init", "processing", "needs_clarification", "awaiting_human_review", "completed", "rejected"]
DemoScenario = Literal["invoice", "support", "claims", "payroll"]
SignalLevel = Literal["High", "Medium", "Low"]
SessionId = Annotated[str, StringConstraints(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]
WorkflowLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


# ──────────────────────────────────────────────────────────────
# Workflow intelligence — the structured signal extracted from the
# diagnostic interview. These raw signals feed the 12-criteria
# Agentification Readiness Index.
# ──────────────────────────────────────────────────────────────
class WorkflowIntelligence(BaseModel):
    workflow_name: WorkflowLabel = Field(..., description="Name of the workflow")
    summary: str = Field(default="", max_length=2000, description="One-line description of the workflow")
    steps: int = Field(default=0, ge=0, le=1000, strict=True, description="Number of discrete steps")
    departments: List[WorkflowLabel] = Field(default_factory=list, max_length=100, description="Departments involved")
    decision_points: int = Field(default=0, ge=0, le=1000, strict=True, description="Number of human decision points")
    systems: List[WorkflowLabel] = Field(default_factory=list, max_length=100, description="Systems touched")
    exceptions_per_week: int = Field(default=0, ge=0, le=1000000, strict=True, description="Weekly exception count")
    volume_per_day: int = Field(default=0, ge=0, le=10000000, strict=True, description="Daily transaction count")
    compliance_sensitivity: SignalLevel = "Low"
    data_availability: SignalLevel = "Medium"
    rule_stability: Literal["Stable", "Evolving", "Volatile"] = "Evolving"
    human_judgment: SignalLevel = "Medium"
    unstructured_content: SignalLevel = "Medium"
    error_cost: SignalLevel = "Medium"


ESSENTIAL_FACTS = {
    "workflow_name": "What is the workflow called?",
    "summary": "What does this workflow do, from input to outcome?",
    "steps": "How many discrete steps does each item pass through?",
    "departments": "Which departments participate? Explicitly say none if there are no departments.",
    "decision_points": "How many human decision points are there per item? Zero is valid.",
    "systems": "Which systems does it touch? Explicitly say none if there are no integrations.",
    "exceptions_per_week": "How many exceptions need intervention per week? Zero is valid.",
    "volume_per_day": "How many items are processed per day? Zero is valid.",
    "compliance_sensitivity": "Is compliance sensitivity Low, Medium, or High?",
    "data_availability": "Is usable data availability Low, Medium, or High?",
    "rule_stability": "Are the rules Stable, Evolving, or Volatile?",
    "human_judgment": "Is the need for human judgment Low, Medium, or High?",
    "unstructured_content": "Is the proportion of unstructured content Low, Medium, or High?",
    "error_cost": "Is the impact of an incorrect outcome Low, Medium, or High?",
}


class FactEvidence(BaseModel):
    status: Literal["supplied", "inferred", "missing"] = "missing"
    source: Literal["interview", "intake", "demo_fixture", "none"] = "none"
    quote: str = Field(default="", max_length=2000)


class WorkflowDiagnosis(BaseModel):
    intelligence: Optional[WorkflowIntelligence] = None
    evidence: Dict[str, FactEvidence] = Field(default_factory=lambda: {key: FactEvidence() for key in ESSENTIAL_FACTS})
    demo_scenario_required: bool = False

    @computed_field
    @property
    def missing_facts(self) -> List[str]:
        return [
            key for key in ESSENTIAL_FACTS
            if self.intelligence is None or self.evidence.get(key, FactEvidence()).status != "supplied"
            or (isinstance(getattr(self.intelligence, key), str) and not getattr(self.intelligence, key).strip())
        ]

    @computed_field
    @property
    def data_completeness(self) -> float:
        return round(1 - len(self.missing_facts) / len(ESSENTIAL_FACTS), 2)

    @computed_field
    @property
    def follow_up_questions(self) -> List[str]:
        if self.demo_scenario_required:
            return ["Select an explicit demo sample in Enterprise Context, or use the invoice sample in Diagnostic. "
                    "Demo mode does not extract facts from arbitrary interview text."]
        return [ESSENTIAL_FACTS[key] for key in self.missing_facts[:3]]


# ──────────────────────────────────────────────────────────────
# Scoring — the 12-criteria Agentification Readiness Index.
# Each criterion contributes a weighted, explained sub-score.
# ──────────────────────────────────────────────────────────────
class CriterionScore(BaseModel):
    name: str
    raw: float = Field(..., description="Normalised 0-1 signal strength for this criterion")
    weight: float = Field(..., description="Relative weight of this criterion")
    contribution: float = Field(..., description="Points contributed to the 0-100 index")
    rationale: str = Field(default="", description="Why this score was assigned")


class AgentSuitabilityScore(BaseModel):
    agent_score: int = Field(..., ge=0, le=100, description="Agentification Readiness Index, 0 to 100")
    classification: Literal["High", "Medium", "Low", "Not Suitable"]
    recommended_pattern: str = Field(..., description="Recommended architecture pattern")
    autonomy_level: AutonomyLevel = "Assisted"
    requires_hitl: bool = Field(default=True, description="Whether a human-in-the-loop gate is required")
    explanation: str = Field(default="", description="Narrative explanation of the score")
    criteria: List[CriterionScore] = Field(default_factory=list, description="Per-criterion breakdown")


# ──────────────────────────────────────────────────────────────
# Pattern library — entries retrieved via RAG to ground the
# recommendation agent in concrete, vetted agentic designs.
# ──────────────────────────────────────────────────────────────
class AgentPattern(BaseModel):
    id: str
    name: str
    category: str = Field(default="", description="e.g. Orchestration, Memory, Tooling, Governance")
    description: str = ""
    when_to_use: str = ""
    azure_services: List[str] = Field(default_factory=list)
    score: float = Field(default=0.0, description="Retrieval relevance score")


class AzureServiceMapping(BaseModel):
    compute: str = "Azure App Service"
    database: str = "Azure Cosmos DB"
    ai: str = "Azure OpenAI (GPT-4o)"
    search: str = "Azure AI Search"
    orchestration: str = "Azure AI Foundry + LangGraph"
    rationale: str = ""


# ──────────────────────────────────────────────────────────────
# Governance — the 5th agent. Replaces Validation with an Enterprise Governance
# rule engine that produces a comprehensive risk and compliance assessment.
# ──────────────────────────────────────────────────────────────
class GovernanceAssessment(BaseModel):
    score: str = ""
    status: str = Field(..., description="pass, warn, or fail")
    risk_level: RiskLevel = "Low"
    reason: str = ""
    recommendation: str = ""


class GovernanceResult(BaseModel):
    decision: GovernanceDecision
    overall_risk: RiskLevel = "Low"
    overall_confidence: int = Field(default=0)
    reason: str = ""
    triggered_rules: List[str] = Field(default_factory=list)
    assessments: Dict[str, GovernanceAssessment] = Field(default_factory=dict)
    human_review_package: Optional[Dict[str, Any]] = None
    rejection_package: Optional[Dict[str, Any]] = None


class ROIAssumptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    working_days_per_year: int = Field(default=250, ge=1, le=366, strict=True)
    loaded_hourly_rate: float = Field(default=45, ge=1, le=1000, allow_inf_nan=False, strict=True)
    minutes_per_step: float = Field(default=1.5, ge=0, le=60, allow_inf_nan=False, strict=True)
    minutes_per_decision: float = Field(default=2, ge=0, le=240, allow_inf_nan=False, strict=True)
    implementation_cost_per_agent: int = Field(default=12000, ge=1, le=1000000, strict=True)
    annual_operating_cost: Optional[int] = Field(default=None, ge=0, le=1000000000, strict=True)


class ROIScenario(BaseModel):
    name: Literal["conservative", "base", "optimistic"]
    automation_multiplier: float
    automatable_fraction: float
    hours_saved_per_year: int
    cost_saved_per_year: int
    implementation_cost: int
    annual_net_savings: Optional[int]
    payback_months: Optional[float]
    roi_multiple: Optional[float]


class ROIEstimate(BaseModel):
    automatable_fraction: float = Field(default=0.0, description="Share of effort agents can absorb, 0-1")
    hours_saved_per_year: int = 0
    cost_saved_per_year: int = 0
    implementation_cost: int = 0
    payback_months: Optional[float] = None
    roi_multiple: Optional[float] = Field(default=None, description="Annual savings ÷ implementation cost")
    assumptions: str = ""
    assumption_inputs: ROIAssumptions = Field(default_factory=ROIAssumptions)
    scenarios: List[ROIScenario] = Field(default_factory=list)
    estimate_basis: str = "Illustrative gross labor effort; not guaranteed cash savings. Operating costs excluded unless supplied."

    @computed_field
    @property
    def operating_costs_included(self) -> bool:
        return self.assumption_inputs.annual_operating_cost is not None

    @computed_field
    @property
    def first_year_balance(self) -> int:
        return self.cost_saved_per_year - self.implementation_cost - (self.assumption_inputs.annual_operating_cost or 0)


class GuardrailFlag(BaseModel):
    type: str = Field(..., description="injection, pii, or jailbreak")
    severity: str = Field(default="low", description="low, medium, high")
    detail: str = ""


class GuardrailResult(BaseModel):
    safe: bool = True
    flags: List[GuardrailFlag] = Field(default_factory=list)
    summary: str = ""


class TraceStep(BaseModel):
    step: int
    agent: str
    status: str = "ok"
    detail: str = ""
    duration_ms: int = 0


class EnterpriseContext(BaseModel):
    business_domain: str = ""
    team_size: str = ""
    existing_systems: str = ""
    pain_points: str = ""
    compliance_requirements: str = ""


# ──────────────────────────────────────────────────────────────
# Portfolio — a scored workflow within a multi-workflow analysis,
# so AgentSense can rank a whole transformation backlog.
# ──────────────────────────────────────────────────────────────
class TokenUsage(BaseModel):
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0


class PortfolioEntry(BaseModel):
    workflow_name: str
    agent_score: int
    classification: str
    recommended_pattern: str
    governance_decision: str = "PENDING"
    governance_risk: str = "Unknown"


class HumanReview(BaseModel):
    analysis_id: SessionId
    decision: Literal["approve", "reject"]
    reviewer: str
    note: str
    reviewed_at: datetime


class WorkflowState(BaseModel):
    _etag: Optional[str] = PrivateAttr(default=None)
    session_id: SessionId
    enterprise_context: EnterpriseContext = Field(default_factory=EnterpriseContext)
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    demo_scenario: Optional[DemoScenario] = None
    diagnosis: Optional[WorkflowDiagnosis] = None
    roi_assumptions: ROIAssumptions = Field(default_factory=ROIAssumptions)
    workflow_intelligence: Optional[WorkflowIntelligence] = None
    suitability_score: Optional[AgentSuitabilityScore] = None
    azure_mapping: Optional[Dict[str, Any]] = None
    retrieved_patterns: List[Dict[str, Any]] = Field(default_factory=list)
    architecture_recommendation: Optional[Dict[str, Any]] = None
    governance: Optional[Dict[str, Any]] = None
    roi: Optional[Dict[str, Any]] = None
    blueprint: Optional[Dict[str, Any]] = None
    portfolio: List[PortfolioEntry] = Field(default_factory=list)
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    guardrail_events: List[Dict[str, Any]] = Field(default_factory=list)
    token_usage: Optional[TokenUsage] = None
    status: WorkflowStatus = "init"
    analysis_id: Optional[SessionId] = None
    human_review: Optional[HumanReview] = None

    def invalidate_analysis(self) -> None:
        self.diagnosis = None
        self.workflow_intelligence = None
        self.suitability_score = None
        self.azure_mapping = None
        self.retrieved_patterns = []
        self.architecture_recommendation = None
        self.governance = None
        self.roi = None
        self.blueprint = None
        self.trace = []
        self.token_usage = None
        self.analysis_id = None
        self.human_review = None
        self.status = "init"

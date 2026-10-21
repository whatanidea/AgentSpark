from pydantic import BaseModel, Field, PrivateAttr, StringConstraints
from typing import List, Optional, Dict, Any, Literal, Annotated
from datetime import datetime


AutonomyLevel = Literal["Autonomous", "Supervised", "Assisted", "Manual"]
GovernanceDecision = Literal["AUTO_APPROVE", "HUMAN_REVIEW_REQUIRED", "REJECT"]
RiskLevel = Literal["Low", "Medium", "High", "Critical"]
WorkflowStatus = Literal["init", "processing", "awaiting_human_review", "completed", "rejected"]
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


class ROIEstimate(BaseModel):
    automatable_fraction: float = Field(default=0.0, description="Share of effort agents can absorb, 0-1")
    hours_saved_per_year: int = 0
    cost_saved_per_year: int = 0
    implementation_cost: int = 0
    payback_months: float = 0.0
    roi_multiple: float = Field(default=0.0, description="Annual savings ÷ implementation cost")
    assumptions: str = ""


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

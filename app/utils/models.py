from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# ──────────────────────────────────────────────────────────────
# Workflow intelligence — the structured signal extracted from the
# diagnostic interview. These raw signals feed the 12-criteria
# Agentification Readiness Index.
# ──────────────────────────────────────────────────────────────
class WorkflowIntelligence(BaseModel):
    workflow_name: str = Field(..., description="Name of the workflow")
    summary: str = Field(default="", description="One-line description of the workflow")
    steps: int = Field(default=0, description="Number of discrete steps in the workflow")
    departments: List[str] = Field(default_factory=list, description="Departments involved")
    decision_points: int = Field(default=0, description="Number of human decision points")
    systems: List[str] = Field(default_factory=list, description="Systems/applications touched")
    exceptions_per_week: int = Field(default=0, description="Exceptions/edge cases per week")
    volume_per_day: int = Field(default=0, description="Transactions processed per day")
    compliance_sensitivity: str = Field(default="Low", description="High, Medium, or Low")
    data_availability: str = Field(default="Medium", description="High, Medium, or Low — is the data digital/accessible/structured")
    rule_stability: str = Field(default="Evolving", description="Stable, Evolving, or Volatile")
    human_judgment: str = Field(default="Medium", description="High, Medium, or Low — degree of subjective judgement")
    unstructured_content: str = Field(default="Medium", description="High, Medium, or Low — share of free-text/document content")
    error_cost: str = Field(default="Medium", description="High, Medium, or Low — business cost of a mistake")


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
    agent_score: int = Field(..., description="Agentification Readiness Index, 0 to 100")
    classification: str = Field(..., description="High, Medium, Low, or Not Suitable")
    recommended_pattern: str = Field(..., description="Recommended architecture pattern")
    autonomy_level: str = Field(default="Assisted", description="Autonomous, Supervised, Assisted, or Manual")
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
    risk_level: str = Field(default="Low")
    reason: str = ""
    recommendation: str = ""


class GovernanceResult(BaseModel):
    decision: str = Field(..., description="AUTO_APPROVE, HUMAN_REVIEW_REQUIRED, or REJECT")
    overall_risk: str = Field(default="Low")
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


class WorkflowState(BaseModel):
    session_id: str
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
    status: str = "init"

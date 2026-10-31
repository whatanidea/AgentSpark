from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, StringConstraints, computed_field, field_validator, model_validator
from typing import List, Optional, Dict, Any, Literal, Annotated
from datetime import datetime, timezone, timedelta
import os


AutonomyLevel = Literal["Autonomous", "Supervised", "Assisted", "Manual"]
DesignFamily = Literal["supervisor_worker", "rag_copilot", "rpa_triage", "standard_software"]
GovernanceDecision = Literal["AUTO_APPROVE", "HUMAN_REVIEW_REQUIRED", "REJECT"]
RiskLevel = Literal["Low", "Medium", "High", "Critical"]
WorkflowStatus = Literal["init", "processing", "needs_clarification", "awaiting_human_review", "completed", "rejected"]
DemoScenario = Literal["invoice", "support", "claims", "payroll"]
SignalLevel = Literal["High", "Medium", "Low"]
CloudProvider = Literal["azure", "aws"]
InterviewRole = Literal["all", "business_operator", "process_owner", "technical_owner"]
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
    status: Literal["supplied", "inferred", "missing"] = Field(
        default="missing", description="Whether the fact was supplied verbatim, inferred, or is missing"
    )
    source: Literal["interview", "intake", "checklist", "demo_fixture", "none"] = Field(
        default="none", description="Where the verbatim quote came from; none when there is no quote"
    )
    quote: str = Field(default="", max_length=2000, description="Exact verbatim quote backing a supplied fact")


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


class InterviewAnswer(BaseModel):
    value: str = Field(min_length=1, max_length=2000)
    quote: str = Field(min_length=1, max_length=2000)
    source: Literal["interview", "intake"] = "interview"


class InterviewDiagnosis(WorkflowDiagnosis):
    answers: Dict[str, InterviewAnswer] = Field(default_factory=dict, max_length=64)


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


class CloudServiceMapping(BaseModel):
    compute: str
    database: str
    ai: str
    search: str
    orchestration: str
    rationale: str


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
    target_cloud: CloudProvider = "azure"
    preferred_region: str = Field(default="", max_length=100, pattern=r"^[a-z0-9-]*$")
    data_residency_requirements: str = Field(default="", max_length=2000)
    deployment_constraints: str = Field(default="", max_length=2000)


# ──────────────────────────────────────────────────────────────
# Portfolio — a scored workflow within a multi-workflow analysis,
# so AgentSpark can rank a whole transformation backlog.
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


class EvidenceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    id: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$")]
    kind: Literal["client_fact", "supported_finding", "assumption", "open_question"]
    statement: str = Field(min_length=1, max_length=1000)
    source_reference: str = Field(default="", max_length=500)
    reporting_period: str = Field(default="", max_length=100)
    related_facts: List[str] = Field(default_factory=list, max_length=14)

    @field_validator("related_facts")
    @classmethod
    def valid_links(cls, value: List[str]) -> List[str]:
        if len(set(value)) != len(value) or not set(value).issubset(ESSENTIAL_FACTS):
            raise ValueError("Links must be unique essential diagnostic fact names.")
        return value

    @model_validator(mode="after")
    def source_required(self):
        if self.kind == "supported_finding" and not self.source_reference:
            raise ValueError("An evidence-supported finding requires a source reference.")
        return self


class EvidenceConfirmation(BaseModel):
    confirmed_by: str
    confirmed_at: datetime
    method: str = Field(min_length=1, max_length=1000)


class EvidenceEntry(EvidenceInput):
    created_by: str
    created_at: datetime
    updated_by: str
    updated_at: datetime
    confirmation: Optional[EvidenceConfirmation] = None


ReadinessCheckId = Literal["integration_access", "data_quality", "security_privacy",
                           "human_oversight", "cloud_prerequisites", "operations"]
ReadinessCheckStatus = Literal["unknown", "needs_validation", "blocked", "ready"]
EvidenceId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$")]


class ReadinessCheckInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    id: ReadinessCheckId
    status: ReadinessCheckStatus = "unknown"
    finding: str = Field(default="", max_length=1000)
    evidence_ids: List[EvidenceId] = Field(default_factory=list, max_length=10)
    owner: str = Field(default="", max_length=200)
    owner_status: Literal["unassigned", "proposed", "client_confirmed"] = "unassigned"
    owner_confirmation_reference: str = Field(default="", max_length=500)
    next_action: str = Field(default="", max_length=1000)
    completion_criteria: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def consistent_check(self):
        if len(set(self.evidence_ids)) != len(self.evidence_ids):
            raise ValueError("Evidence links must be unique.")
        if self.status != "unknown" and not self.finding:
            raise ValueError("An assessed check requires a finding.")
        if bool(self.owner) != (self.owner_status != "unassigned"):
            raise ValueError("Name an owner for proposed or client-confirmed assignments; otherwise use unassigned.")
        if (self.owner_status == "client_confirmed") != bool(self.owner_confirmation_reference):
            raise ValueError("Only client-confirmed ownership requires a confirmation reference.")
        return self


class PilotPlan(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    scope: str = Field(default="", max_length=1000)
    success_metrics: str = Field(default="", max_length=1000)
    failure_handling: str = Field(default="", max_length=1000)
    authorization_boundaries: str = Field(default="", max_length=1000)


class ReadinessAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    checks: List[ReadinessCheckInput] = Field(default_factory=list, max_length=6)
    pilot: PilotPlan = Field(default_factory=PilotPlan)

    @field_validator("checks")
    @classmethod
    def unique_checks(cls, value):
        if len({check.id for check in value}) != len(value):
            raise ValueError("Readiness check IDs must be unique.")
        return value


class InferenceModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id: Literal["azure-openai", "foundry-claude-haiku", "demo"]
    provider: Literal["Azure OpenAI", "Anthropic on Azure Foundry", "Deterministic demo"]
    model: str
    deployment: str
    version: str = ""
    configuration: str


class RuntimeRequirements(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    reasoning: Literal["unknown", "deterministic", "bounded", "dynamic"] = "unknown"
    duration: Literal["unknown", "request_bound", "long_running"] = "unknown"
    external_waits: Literal["unknown", "no", "yes"] = "unknown"
    recovery: Literal["unknown", "restartable", "durable"] = "unknown"
    side_effects: Literal["unknown", "read_only", "consequential"] = "unknown"
    side_effect_safety: Literal["unknown", "defined", "unresolved"] = "unknown"
    existing_reasoning: Literal["unknown", "none", "bounded_handler", "langgraph"] = "unknown"
    existing_runtime: Literal["unknown", "none", "temporal", "azure_durable_functions",
                              "aws_step_functions", "other"] = "unknown"
    runtime_hosting: Literal["unknown", "managed_service", "self_hosted"] = "unknown"
    operational_owner: str = Field(default="", max_length=200)
    scale_constraints: str = Field(default="", max_length=1000)
    platform_constraints: str = Field(default="", max_length=1000)


class RuntimeOption(BaseModel):
    id: str
    label: str
    eligible: bool
    reason: str
    tradeoffs: List[str]


class RuntimeLayerDecision(BaseModel):
    selected: Optional[str] = None
    label: str = "Unresolved"
    rationale: List[str] = Field(default_factory=list)
    alternatives: List[RuntimeOption] = Field(default_factory=list)


class RuntimeDecision(BaseModel):
    status: Literal["recommended", "provisional", "insufficient_information"]
    rules_version: str
    catalog_version: str
    target_cloud: CloudProvider
    requirements: RuntimeRequirements
    provenance: Dict[str, FactEvidence]
    reasoning: RuntimeLayerDecision
    durable_execution: RuntimeLayerDecision
    validation_tasks: List[str]
    boundaries: List[str]
    limitations: str


class BriefSource(BaseModel):
    id: str
    label: str
    basis: str


class BriefClaim(BaseModel):
    label: str
    statement: str
    source_ids: List[str]


class ExecutiveBrief(BaseModel):
    version: Literal["executive-brief-v1"] = "executive-brief-v1"
    analysis_id: Optional[SessionId] = None
    workflow_name: str
    decision: Literal["investigate_further", "conventional_automation", "bounded_ai_pilot", "do_not_proceed"]
    decision_label: str
    rationale: str
    approval_status: str
    claims: List[BriefClaim]
    sources: List[BriefSource]
    risks_and_gaps: List[str]
    next_action: str
    limitations: str


class DiscoveryContribution(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    id: SessionId
    role: Literal["business_operator", "process_owner", "technical_owner"]
    statement: str = Field(min_length=1, max_length=2000)


class DiscoveryOpportunity(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    id: SessionId
    title: WorkflowLabel
    problem: str = Field(min_length=1, max_length=2000)
    status: Literal["proposed", "selected", "parked"] = "proposed"
    source_ids: List[Annotated[str, StringConstraints(min_length=1, max_length=200)]] = Field(default_factory=list, max_length=20)
    ratings: Optional["DiscoveryRatings"] = None


class DiscoveryRatings(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    value: Optional[int] = Field(default=None, strict=True, ge=1, le=5)
    feasibility: Optional[int] = Field(default=None, strict=True, ge=1, le=5)
    evidence_confidence: Optional[int] = Field(default=None, strict=True, ge=1, le=5)
    risk: Optional[int] = Field(default=None, strict=True, ge=1, le=5)
    effort: Optional[int] = Field(default=None, strict=True, ge=1, le=5)
    rationale: str = Field(default="", max_length=1000)


class DiscoveryParticipant(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity_id: SessionId
    role: Literal["business_operator", "process_owner", "technical_owner"]
    assigned_by: SessionId
    assigned_at: datetime
    membership_generation: str
    status: Literal["invited", "draft", "submitted"] = "invited"
    answers: Dict[str, Annotated[str, StringConstraints(max_length=1000)]] = Field(default_factory=dict, max_length=3)
    submitted_at: Optional[datetime] = None


class DiscoverySource(BaseModel):
    id: str
    label: str
    statement: str


class DiscoveryFinding(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: WorkflowLabel
    statement: str = Field(min_length=1, max_length=1000)
    source_ids: List[Annotated[str, StringConstraints(min_length=1, max_length=200)]] = Field(min_length=1, max_length=20)
    id: Optional[SessionId] = None


class DiscoverySynthesisContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    themes: List[DiscoveryFinding] = Field(default_factory=list, max_length=10)
    opportunities: List[DiscoveryFinding] = Field(default_factory=list, max_length=10)
    conflicts: List[DiscoveryFinding] = Field(default_factory=list, max_length=10)
    open_questions: List[Annotated[str, StringConstraints(min_length=1, max_length=500)]] = Field(default_factory=list, max_length=10)


class DiscoverySynthesis(BaseModel):
    rules_version: Literal["discovery-synthesis-v1"] = "discovery-synthesis-v1"
    source_digest: str
    sources: List[DiscoverySource]
    content: DiscoverySynthesisContent
    model: InferenceModel
    generated_by: SessionId
    generated_at: datetime


class DiscoveryOrigin(BaseModel):
    engagement_id: SessionId
    opportunity_id: SessionId
    source_version: str
    title: str
    problem: str
    sources: List[DiscoverySource]
    priority: Dict[str, Any]
    reviewed_by: SessionId
    reviewed_at: datetime


class DiscoveryHandoff(BaseModel):
    session_id: SessionId
    origin: DiscoveryOrigin
    context: EnterpriseContext
    model: InferenceModel
    assessment_expires_at: datetime
    status: Literal["pending", "completed"] = "pending"


class DiscoveryEngagement(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: WorkflowLabel
    objective: str = Field(min_length=1, max_length=2000)
    business_units: str = Field(min_length=1, max_length=1000)
    sponsor: str = Field(min_length=1, max_length=200)
    engagement_owner: str = Field(min_length=1, max_length=200)
    required_topics: str = Field(default="", max_length=2000)
    excluded_topics: str = Field(default="", max_length=2000)
    starts_on: str = Field(default="", max_length=10)
    ends_on: str = Field(default="", max_length=10)
    status: Literal["planned", "active", "completed"] = "planned"
    contributions: List[DiscoveryContribution] = Field(default_factory=list, max_length=20)
    opportunities: List[DiscoveryOpportunity] = Field(default_factory=list, max_length=20)
    assessment_ids: List[SessionId] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def valid_engagement(self):
        from datetime import date
        for value in (self.starts_on, self.ends_on):
            if value and date.fromisoformat(value).isoformat() != value:
                raise ValueError("Discovery dates must use YYYY-MM-DD.")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("Discovery end date must not precede its start.")
        for values in ([item.id for item in self.contributions], [item.id for item in self.opportunities],
                       self.assessment_ids):
            if len(values) != len(set(values)):
                raise ValueError("Discovery item identifiers must be unique.")
        return self


class WorkflowState(BaseModel):
    _etag: Optional[str] = PrivateAttr(default=None)
    session_id: SessionId
    record_kind: Literal["assessment", "discovery"] = "assessment"
    discovery: Optional[DiscoveryEngagement] = None
    discovery_created_at: Optional[datetime] = None
    discovery_participants: List[DiscoveryParticipant] = Field(default_factory=list, max_length=20)
    discovery_synthesis: Optional[DiscoverySynthesis] = None
    discovery_handoffs: List[DiscoveryHandoff] = Field(default_factory=list, max_length=20)
    discovery_origin: Optional[DiscoveryOrigin] = None
    owner_id: str = "local-demo"
    organization_id: Optional[SessionId] = None
    team_id: Optional[SessionId] = None
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(
        hours=int(os.getenv("SESSION_RETENTION_HOURS", "24"))))
    enterprise_context: EnterpriseContext = Field(default_factory=EnterpriseContext)
    inference_model: Optional[InferenceModel] = None
    model_locked: bool = False
    evidence_register: List[EvidenceEntry] = Field(default_factory=list, max_length=50)
    evidence_revision: int = Field(default=0, ge=0)
    evidence_report: Optional[Dict[str, Any]] = None
    readiness_assessment: ReadinessAssessment = Field(default_factory=ReadinessAssessment)
    readiness_revision: int = Field(default=0, ge=0)
    readiness_report: Optional[Dict[str, Any]] = None
    runtime_requirements: RuntimeRequirements = Field(default_factory=RuntimeRequirements)
    runtime_requirement_sources: Dict[str, FactEvidence] = Field(default_factory=dict)
    runtime_decision: Optional[RuntimeDecision] = None
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    demo_scenario: Optional[DemoScenario] = None
    diagnosis: Optional[WorkflowDiagnosis] = None
    interview_diagnosis: Optional[WorkflowDiagnosis] = None
    interview_answers: Dict[str, str] = Field(default_factory=dict, max_length=14)
    interview_role: InterviewRole = "all"
    interview_unconfirmed: List[str] = Field(default_factory=list, max_length=64)
    executive_brief: Optional[ExecutiveBrief] = None
    roi_assumptions: ROIAssumptions = Field(default_factory=ROIAssumptions)
    workflow_intelligence: Optional[WorkflowIntelligence] = None
    suitability_score: Optional[AgentSuitabilityScore] = None
    azure_mapping: Optional[Dict[str, Any]] = None
    cloud_mapping: Optional[Dict[str, Any]] = None
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
    decision_recorded_at: Optional[datetime] = None

    def invalidate_analysis(self) -> None:
        self.executive_brief = None
        self.evidence_report = None
        self.readiness_report = None
        self.runtime_decision = None
        self.diagnosis = None
        self.workflow_intelligence = None
        self.suitability_score = None
        self.azure_mapping = None
        self.cloud_mapping = None
        self.retrieved_patterns = []
        self.architecture_recommendation = None
        self.governance = None
        self.roi = None
        self.blueprint = None
        self.trace = []
        self.token_usage = None
        self.analysis_id = None
        self.human_review = None
        self.decision_recorded_at = None
        self.status = "init"

    def invalidate_readiness_context(self) -> None:
        """Retain drafts, but require renewed validation after workflow context changes."""
        for check in self.readiness_assessment.checks:
            if check.status == "ready":
                check.status = "needs_validation"
            if check.owner_status == "client_confirmed":
                check.owner_status = "proposed"
                check.owner_confirmation_reference = ""
        self.readiness_revision += 1

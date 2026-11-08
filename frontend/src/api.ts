// Same-origin API client. In dev, Vite proxies /api → :8000; in prod FastAPI
// serves this SPA and the API from the same origin, so relative URLs just work.
const BASE = "/api/v1";
let accessToken = "";
let tokenProvider: (() => Promise<string>) | null = null;
let authenticationVersion = 0;
export function setAccessToken(token: string) { accessToken = token; authenticationVersion++; }
/** When set, each request asks the provider for a current token (silently refreshed by MSAL). */
export function setTokenProvider(provider: typeof tokenProvider) { tokenProvider = provider; authenticationVersion++; }
export type Permissions = { read: boolean; write: boolean; review: boolean; delete: boolean };
export type CloudProvider = "azure" | "aws";
export type InterviewRole = "all" | "business_operator" | "process_owner" | "technical_owner";
export type ExecutiveBrief = {
  version: string; analysis_id: string | null; workflow_name: string;
  decision: "investigate_further" | "conventional_automation" | "bounded_ai_pilot" | "do_not_proceed";
  decision_label: string; rationale: string; approval_status: string;
  claims: { label: string; statement: string; source_ids: string[] }[];
  sources: { id: string; label: string; basis: string }[];
  risks_and_gaps: string[]; next_action: string; limitations: string;
};
export type DiscoveryEngagement = {
  title: string; objective: string; business_units: string; sponsor: string; engagement_owner: string;
  required_topics: string; excluded_topics: string; starts_on: string; ends_on: string;
  status: "planned" | "active" | "completed";
  contributions: { id: string; role: Exclude<InterviewRole, "all">; statement: string }[];
  opportunities: { id: string; title: string; problem: string; status: "proposed" | "selected" | "parked";
    source_ids: string[]; ratings: DiscoveryRatings | null; process_ids?: string[];
    alternatives?: DiscoveryAlternative[]; preferred_alternative?: DiscoveryAlternativeKind | null }[];
  assessment_ids: string[];
  processes?: DiscoveryProcess[];
  playbook_id?: "ai_native_readiness" | "workflow_opportunity" | null;
  playbook_answers?: Record<string, string>;
  discovery_outcome?: "gather_more_evidence" | "improve_process" | "conventional_automation" | "bounded_ai_pilot" | "do_not_proceed" | null;
  outcome_rationale?: string;
  success_measures?: string;
};
export type DiscoverySection = "overview" | "processes" | "people" | "alignment" | "evidence" | "opportunities" | "findings";
export type AlignmentFunction = "business" | "it" | "risk" | "compliance_privacy" | "operations";
export type AlignmentOwnerRole = "executive_sponsor" | "business_owner" | "operational_owner";
export type AlignmentAcceptance = { context_digest: string; recorded_at: string };
export type AlignmentPositionInput = {
  position: "support" | "conditional" | "more_evidence" | "object"; rationale: string; conditions: string; source_ids: string[];
};
export type AlignmentNominationInput = { identity_id: string; label: string };
export type AlignmentNomination = AlignmentNominationInput & {
  id: string; membership_generation: string; nominated_by: string; nominated_at: string; withdrawn: boolean;
};
export type AlignmentDecisionInput = AlignmentNominationInput & {
  question: string; authority_basis: string; next_action: string; due_on: string; source_ids: string[]; replaces_id: string | null;
};
export type AlignmentOutcomeInput = { outcome: string; rationale: string; next_action: string };
export type AlignmentSnapshot = {
  rules_version: "discovery-alignment-v1"; source_version: string; recorded_at: string; context_digest: string;
  charter: Record<string, string>;
  record: {
    stakeholders: (AlignmentNomination & { function: AlignmentFunction; positions: (AlignmentPositionInput & AlignmentAcceptance)[] })[];
    owners: (AlignmentNomination & { role: AlignmentOwnerRole; acceptances: AlignmentAcceptance[] })[];
    decisions: (AlignmentNomination & AlignmentDecisionInput & {
      acceptances: AlignmentAcceptance[]; outcomes: (AlignmentOutcomeInput & AlignmentAcceptance)[];
    })[];
  };
  current_positions: string[]; inactive_assignments: string[]; accepted_owners: string[]; accepted_decisions: string[];
  current_decisions: string[]; superseded_decisions: string[]; missing_functions: AlignmentFunction[];
  unaccepted_owners: AlignmentOwnerRole[]; open_decisions: string[]; limitations: string;
};
export type DiscoveryPlaybook = {
  id: NonNullable<DiscoveryEngagement["playbook_id"]>; title: string; description: string;
  questions: { id: string; label: string; role: Exclude<InterviewRole, "all"> }[];
};
export type DiscoveryOverview = {
  stage: string; documented_checks: number; total_checks: number; pending_requests: number;
  overdue_requests: number; submitted_perspectives: number; source_count: number; review_issues: number;
  unanswered_prompts: string[]; unranked_opportunities: number; limitations: string;
  checks: { id: string; section: DiscoverySection; label: string; complete: boolean; detail: string }[];
  next_actions: { section: DiscoverySection; message: string }[];
};
export type DiscoveryRatings = {
  value: number | null; feasibility: number | null; evidence_confidence: number | null;
  risk: number | null; effort: number | null; rationale: string;
};
export type DiscoverySource = { id: string; label: string; statement: string };
export type DiscoveryProcess = {
  id: string; title: string; process_owner: string; goal: string; scope: string; systems: string;
  volume: string; baseline_pain: string;
  steps: { id: string; title: string; work: string; systems: string }[];
};
export type DiscoveryAlternativeKind = "unchanged" | "process_improvement" | "deterministic_automation" | "ai_assistance" | "hybrid";
export type DiscoveryAlternative = { kind: DiscoveryAlternativeKind; rationale: string };
export type DiscoveryBaseline = { statement: string; source_reference: string; basis: "self_reported" | "measured" };
export type DiscoveryTaskAssignment = {
  process_id: string; step_id: string; assignee: string; role: Exclude<InterviewRole, "all">;
  requested_information: string; due_on: string;
};
export type DiscoveryTask = DiscoveryTaskAssignment & {
  id: string; assigned_by: string; membership_generation: string;
  status: "draft" | "submitted" | "clarification_needed"; answers: Record<string, string>; evidence: DiscoveryBaseline[];
};
export type DiscoverySourceReviewInput = {
  source_ids: string[]; status: "clarification_needed" | "disagreement" | "resolved" | "reviewer_checked"; rationale: string;
};
export type DiscoverySourceReview = DiscoverySourceReviewInput & {
  id: string; source_digest: string; reviewed_by: string; reviewed_at: string;
};
export type DiscoveryProcessSource = DiscoverySource & {
  process_id?: string | null; step_id?: string | null; task_id?: string | null; source_reference?: string;
  basis?: "self_reported" | "measured"; review_status?: string; review_rationale?: string;
};
export type DiscoveryFinding = { id: string | null; title: string; statement: string; source_ids: string[] };
export type DiscoveryPriority = {
  opportunity_id: string; title: string; score: number | null; missing: string[];
  source_ids: string[]; ratings: DiscoveryRatings | null;
};
export type DiscoveryOrigin = {
  engagement_id: string; opportunity_id: string; source_version: string; title: string; problem: string;
  sources: DiscoveryProcessSource[]; priority: DiscoveryPriority; reviewed_by: string; reviewed_at: string;
  processes?: DiscoveryProcess[]; alternatives?: DiscoveryAlternative[];
  preferred_alternative?: DiscoveryAlternativeKind | null; source_reviews?: DiscoverySourceReview[];
  alignment?: AlignmentSnapshot | null;
};
export type DiscoveryParticipant = {
  identity_id: string; role: Exclude<InterviewRole, "all">; assigned_by: string; assigned_at: string;
  status: "invited" | "draft" | "submitted"; answers: Record<string, string>; submitted_at: string | null;
};
export type DiscoveryRecord = {
  id: string; version: string; engagement: DiscoveryEngagement; permissions: Permissions; expires_at: string;
  overview?: DiscoveryOverview; playbooks?: DiscoveryPlaybook[];
  alignment?: AlignmentSnapshot | null;
  assessments: { session_id: string; title: string; status: string }[]; unavailable_assessments: string[];
  progress: { contributions: number; opportunities: number; assessments: number }; limitations: string;
  retention: { days: number; created_at: string | null; policy: string };
  tasks?: DiscoveryTask[]; sources?: DiscoveryProcessSource[]; source_reviews?: DiscoverySourceReview[];
  participation: { participants: DiscoveryParticipant[]; identity_id: string; can_assign: boolean;
    can_submit: boolean; questions: Record<Exclude<InterviewRole, "all">, Record<string, string>>;
    step_questions?: Record<Exclude<InterviewRole, "all">, Record<string, string>> };
  synthesis: { rules_version: string; source_digest: string; sources: DiscoverySource[];
    content: { themes: DiscoveryFinding[]; opportunities: DiscoveryFinding[]; conflicts: DiscoveryFinding[]; open_questions: string[] };
    model: InferenceModel; generated_by: string; generated_at: string } | null;
  synthesis_current: boolean;
  prioritization: { rules_version: string; weights: Record<string, number>; items: DiscoveryPriority[]; limitations: string };
  handoffs: { session_id: string; origin: DiscoveryOrigin; context: { target_cloud: CloudProvider };
    model: InferenceModel; assessment_expires_at: string; status: "pending" | "completed" }[];
};
export type RuntimeRequirements = {
  specialist_roles?: string;
  reasoning: "unknown" | "deterministic" | "bounded" | "dynamic";
  duration: "unknown" | "request_bound" | "long_running";
  external_waits: "unknown" | "no" | "yes";
  recovery: "unknown" | "restartable" | "durable";
  side_effects: "unknown" | "read_only" | "consequential";
  side_effect_safety: "unknown" | "defined" | "unresolved";
  existing_reasoning: "unknown" | "none" | "bounded_handler" | "langgraph";
  existing_runtime: "unknown" | "none" | "temporal" | "azure_durable_functions" | "aws_step_functions" | "other";
  runtime_hosting: "unknown" | "managed_service" | "self_hosted";
  operational_owner: string; scale_constraints: string; platform_constraints: string;
};
export type RuntimeDecisionLayer = {
  selected: string | null; label: string; rationale: string[];
  alternatives: { id: string; label: string; eligible: boolean; reason: string; tradeoffs: string[] }[];
};
export type RuntimeDecision = {
  status: "recommended" | "provisional" | "insufficient_information";
  rules_version: string; catalog_version: string; target_cloud: CloudProvider;
  requirements: RuntimeRequirements;
  provenance: Record<string, {
    status: "supplied" | "inferred" | "missing";
    source: "interview" | "checklist" | "intake" | "none" | "demo_fixture" | "document"; quote: string;
  }>;
  reasoning: RuntimeDecisionLayer; durable_execution: RuntimeDecisionLayer;
  validation_tasks: string[]; boundaries: string[]; limitations: string;
};
export type InferenceModel = {
  id: "azure-openai" | "foundry-claude-haiku" | "demo";
  provider: string; model: string; deployment: string; version: string; configuration: string;
};
export type ModelCatalog = {
  mode: "demo" | "live";
  items: { id: InferenceModel["id"]; label: string; available: boolean; reason: string; definition: InferenceModel | null }[];
};
export type DeploymentPreferences = {
  target_cloud: CloudProvider; preferred_region: string; data_residency_requirements: string; deployment_constraints: string;
};
export type WorkspaceSelection = {
  organization_id: string; team_id: string; organization_name: string; team_name: string; permissions: Permissions;
};
let workspace: Pick<WorkspaceSelection, "organization_id" | "team_id"> | null = null;
export function setWorkspace(value: typeof workspace) { workspace = value; }
export type DirectoryPage<T> = { items: T[]; next_cursor: string | null };
export type Organization = { organization_id: string; name: string; role: "owner" | "admin" | "member" };
export type Team = { team_id: string; name: string; permissions: (keyof Permissions)[] };
export function teamWorkspace(organization: Organization, team: Team): WorkspaceSelection {
  return {
    organization_id: organization.organization_id, organization_name: organization.name,
    team_id: team.team_id, team_name: team.name,
    permissions: { read: team.permissions.includes("read"), write: team.permissions.includes("write"),
      review: team.permissions.includes("review"), delete: team.permissions.includes("delete") },
  };
}
export type TeamRole = "contributor" | "reviewer" | "viewer";
export type DirectoryMember = {
  identity_id: string; role: "owner" | "admin" | "member"; roles: TeamRole[];
  active: boolean; version: string; effective_active?: boolean;
};
export type InviteRequest = {
  role: "admin" | "member"; team_id?: string; team_roles?: TeamRole[]; expires_in_hours: number; max_uses: number;
};
export type Invite = {
  invite_id: string; role: "admin" | "member"; team_id: string | null; team_roles: TeamRole[]; expires_at: string;
  max_uses: number; uses: number; created_by: string; status: "active" | "used" | "expired" | "revoked";
};
export type InviteRedemption = {
  organization_id: string; name: string; role: Organization["role"]; team_id: string | null;
  status: "joined" | "already_member"; workspace: WorkspaceSelection | null;
};
export type InvitePreview = {
  organization_name: string; team_name: string | null; role: "admin" | "member";
  team_roles: TeamRole[]; expires_at: string;
};
/** Accepts a full invite link (…#invite=CODE) or a bare code. */
export function parseInviteCode(value: string): string {
  const text = value.trim();
  const match = text.match(/[#?&]invite=([A-Za-z0-9_.-]+)/);
  return match ? match[1] : text;
}
export function inviteLink(code: string): string {
  return `${window.location.origin}/workspace#invite=${code}`;
}
export type SignInConfig = { client_id: string; authority: string; scope: string };
export type AuthConfig = {
  mode: "local-demo" | "oidc"; retention_hours: number; archive_retention_days: number; sign_in?: SignInConfig | null;
};
export type HomeStatus = "draft" | "pending_review" | "approved" | "rejected";
export type HomeItem = {
  can_delete: boolean;
  kind: "session" | "decision" | "engagement"; session_id: string; analysis_id: string | null;
  title: string; domain: string; status: HomeStatus; score: number | null;
  updated_at: string; expires_at: string; sort_key: string; legacy: boolean;
};
export type HomePage = { items: HomeItem[]; next_cursor: string | null; archive_retention_days: number };
export type AdoptionAssessment = {
  rules_version: "adoption-rules-v1";
  opportunity: "supported" | "potential" | "not_indicated";
  design_family: "supervisor_worker" | "rag_copilot" | "rpa_triage" | "standard_software" | "tool_agent" | "hybrid_agentic";
  design_label: string; decision_basis: string; current_approach: string; rationale: string[];
  evidence: { field_id: string; value: string; source: string; quote: string; reference?: string }[];
  deterministic_responsibilities: string[]; proposed_agent_responsibilities: string[];
  human_boundaries: string[]; questions: string[]; pilot_scope: string; success_criteria: string[];
  stop_conditions: string[]; expansion_conditions: string[]; readiness_basis: string;
};
export type ArchitectureView = {
  version: "architecture-view-v1";
  outcome: string; why: string;
  flow: {
    title: string; kind: "software" | "ai" | "human"; purpose: string;
    receives: string; produces: string; control: string;
    components: ("compute" | "database" | "ai" | "search" | "orchestration" | "systems")[];
  }[];
  choices: { component: "compute" | "database"; why: string; alternative: string; tradeoff: string }[];
  milestones: { title: string; acceptance: string }[];
};
export type ArchivedDecision = {
  summary: HomeItem;
  details: {
    inference_model?: InferenceModel | null;
    deployment_preferences?: DeploymentPreferences;
    cloud_mapping?: Record<string, unknown> | null;
    evidence_report?: EvidenceReport | null;
    readiness_report?: ImplementationReadinessReport | null;
    runtime_decision?: RuntimeDecision | null;
    executive_brief?: ExecutiveBrief | null;
    discovery_origin?: DiscoveryOrigin | null;
    workflow_intelligence: { summary: string; systems: string[] } | null;
    suitability_score: { agent_score: number; recommended_pattern: string; explanation: string; adoption?: AdoptionAssessment | null } | null;
    human_review: { decision: "approve" | "reject"; reviewer: string; note: string; reviewed_at: string } | null;
    governance: { decision: string; overall_risk: string; reason: string } | null;
    architecture_doc: string; cost_estimate: string; roadmap: string;
    architecture_view?: ArchitectureView | null;
    retrieved_patterns: { id: string; name: string; source_ref: string; content_sha256: string }[];
    roi: import("./components/ROIReport").ROIResult | null;
  };
};
export type Identity = { identity: string; can_review: boolean; platform_access: boolean };
export type EvidenceInput = {
  id: string; kind: "client_fact" | "supported_finding" | "assumption" | "open_question";
  statement: string; source_reference: string; reporting_period: string; related_facts: string[];
};
export type EvidenceEntry = EvidenceInput & {
  created_by: string; created_at: string; updated_by: string; updated_at: string;
  confirmation: { confirmed_by: string; confirmed_at: string; method: string } | null;
};
export type EvidenceReport = {
  revision: number; entries: EvidenceEntry[];
  findings: { fact: string; value: unknown; provenance: { status: string; source: string; quote: string }; evidence_ids: string[] }[];
  recommendation_basis: {
    classification: string | null; agent_score: number | null; recommended_pattern: string | null;
    basis: string; evidence_ids: string[];
  };
  validation_checklist: { evidence_id: string; statement: string; action: string }[];
  limitations: string;
};
export type EvidenceRegisterResponse = { revision: number; entries: EvidenceEntry[]; permissions: Permissions };
export type ReadinessCheckId = "integration_access" | "data_quality" | "security_privacy" |
  "human_oversight" | "cloud_prerequisites" | "operations";
export type ReadinessCheckInput = {
  id: ReadinessCheckId; status: "unknown" | "needs_validation" | "blocked" | "ready";
  finding: string; evidence_ids: string[]; owner: string;
  owner_status: "unassigned" | "proposed" | "client_confirmed"; owner_confirmation_reference: string;
  next_action: string; completion_criteria: string;
};
export type PilotPlan = { scope: string; success_metrics: string; failure_handling: string; authorization_boundaries: string };
export type ReadinessAssessment = { checks: ReadinessCheckInput[]; pilot: PilotPlan };
export type ReadinessCatalogItem = {
  id: ReadinessCheckId; title: string; question: string; completion_criteria: string; depends_on: ReadinessCheckId[];
};
export type ImplementationReadinessReport = {
  revision: number; evidence_revision: number; assessed_at: string;
  decision: "ready" | "ready_with_conditions" | "blocked" | "not_assessed"; rationale: string;
  target_cloud: CloudProvider; preferred_region: string;
  workflow_context: { systems: string[] | string; data_residency_requirements: string; deployment_constraints: string };
  checks: (ReadinessCheckInput & ReadinessCatalogItem & {
    reported_status: ReadinessCheckInput["status"]; validation_needs: string[];
    evidence: { id: string; statement: string; source_reference: string; confirmation: EvidenceEntry["confirmation"] }[];
  })[];
  blockers: ReadinessCheckId[];
  actions: {
    check_id: ReadinessCheckId | "pilot_definition"; priority: "P0" | "P1"; action: string; owner: string;
    owner_status: ReadinessCheckInput["owner_status"]; depends_on: ReadinessCheckId[];
    completion_criteria: string; evidence_ids: string[];
  }[];
  pilot: PilotPlan; missing_pilot_fields: (keyof PilotPlan)[]; pilot_entry_criteria: string[]; limitations: string;
};
export type ImplementationReadinessResponse = {
  revision: number; evidence_revision: number; assessment: ReadinessAssessment;
  catalog: ReadinessCatalogItem[]; report: ImplementationReadinessReport; evidence_entries: EvidenceEntry[];
  permissions: Permissions;
  review: ReadinessReviewContext;
};
export type ReadinessReviewContext = {
  analysis_id: string | null; status: string;
  human_review: { decision: "approve" | "reject"; reviewer: string; note: string; reviewed_at: string } | null;
};
export type SessionSnapshot = {
  session_id: string;
  version: string;
  executive_brief: ExecutiveBrief | null;
  discovery_origin: DiscoveryOrigin | null;
  enterprise_context: Record<string, string>;
  evidence_register: EvidenceEntry[];
  evidence_revision: number;
  evidence_report: EvidenceReport | null;
  readiness_assessment: ReadinessAssessment;
  readiness_revision: number;
  readiness_report: ImplementationReadinessReport | null;
  runtime_decision?: RuntimeDecision | null;
  chat_history: { role: "user" | "assistant"; content: string }[];
  status: string;
  expires_at: string;
  demo_scenario: DemoScenario | null;
  analysis_id: string | null;
  organization_id: string | null;
  team_id: string | null;
  permissions: Permissions;
  workspace: { organization_name: string; team_name: string } | null;
  [key: string]: any;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ReviewRequest = {
  analysis_id: string;
  decision: "approve" | "reject";
  reviewer: string;
  note: string;
};

export type RuntimeHealth = { status: string; live: boolean; mode: "demo" | "live" };
export type DemoScenario = "invoice" | "support" | "claims" | "payroll";
export type ValueEvidence = { basis: "assumed" | "measured" | "finance_approved"; reference: string };
export type RoleEffort = {
  role: string; manual_minutes_per_item: number | null; effort_reduction_percent: number | null;
  loaded_hourly_rate: number | null; evidence: Partial<Record<"manual_minutes_per_item" | "effort_reduction_percent" | "loaded_hourly_rate", ValueEvidence>>;
};
export type ROIAssumptions = {
  mode: "deferred" | "estimate";
  working_days_per_year: number | null; manual_minutes_per_item: number | null;
  effort_reduction_percent: number | null; loaded_hourly_rate: number | null;
  productive_hours_per_fte: number | null; implementation_cost: number | null;
  annual_operating_cost: number | null; annual_cash_savings: number | null;
  annual_avoided_hiring_value: number | null; service_improvements: string;
  evidence: Partial<Record<ValueField, ValueEvidence>>; roles: RoleEffort[];
  minutes_per_step?: number | null; implementation_cost_per_agent?: number | null;
};
export type ValueField = Exclude<keyof ROIAssumptions,
  "mode" | "roles" | "evidence" | "minutes_per_step" | "implementation_cost_per_agent">;
export type Diagnosis = {
  intelligence: Record<string, unknown> | null;
  evidence: Record<string, { status: "supplied" | "inferred" | "missing"; source: string; quote: string; reference?: string }>;
  missing_facts: string[];
  follow_up_questions: string[];
  data_completeness: number;
};
export type InterviewField = {
  id: string; label: string; question: string; group: string;
  kind: "text" | "number" | "select"; options: string[]; max_length: number;
  assigned_role: Exclude<InterviewRole, "all">;
};
export type InterviewProgress = {
  role: InterviewRole; roles: Record<InterviewRole, string>; role_missing_fields: string[];
  deferred_fields: string[]; unconfirmed_fields: string[];
  version: string; rounds_used: number; max_rounds: number; limit_reached: boolean; can_chat: boolean;
  questions: string[]; question_ids: string[]; missing_fields: string[]; missing_facts: string[];
  fields: InterviewField[]; answers: Record<string, string>; permissions: Permissions;
  document?: {
    available: boolean; filename: string | null; expires_at: string | null;
    checks: Record<string, "found" | "not_found" | "conflict" | "needs_confirmation">; excluded_fields: string[];
    answers: (DocumentField & { source: DocumentMetadata; capture: "human_reviewed" | "document_lookup" })[];
    conflicts: DocumentField[];
  };
};
export type ChatResponse = { status: "blocked"; response: string } |
  { status: "success"; response: string; message: string; interview: InterviewProgress;
    capture: { field_id: string; label: string;
      status: "captured" | "unconfirmed" | "needs_confirmation" | "not_answered"; value: string | null }[] };
export type Readiness = {
  status: "ready" | "degraded";
  ready: boolean;
  mode: "demo" | "live";
  dependencies: Record<string, "demo" | "ready" | "unavailable">;
};
export type DocumentMetadata = { filename: string; format: "pdf" | "docx"; sha256: string; source_count: number };
export type SourceExcerpt = { quote: string; location: string };
export type DocumentField = SourceExcerpt & {
  field_id: string; value: string; edited: boolean;
  count_basis?: "literal" | "number_words" | "decision_ordinals"; supporting_quotes?: SourceExcerpt[];
};
export type DocumentSource = { metadata: DocumentMetadata; units: { location: string; text: string }[] };
export type DocumentApproval = {
  metadata: DocumentMetadata; fields: DocumentField[]; context_approved: true;
  version: string | null; confirm_overwrite: boolean;
  source?: DocumentSource; excluded_fields?: string[];
};
export type DocumentPreview = {
  metadata: DocumentMetadata; candidates: DocumentField[]; fields: InterviewField[];
  conflicting_fields: string[]; warnings: string[]; version: string | null; model_id: InferenceModel["id"];
  source?: DocumentSource;
};
export type ProcessingUpdate = {
  id: string; label: string; phase: "start" | "stage" | "activity" | "complete" | "error";
  stage?: string; active?: boolean; error?: string;
};
export const PROCESSING_EVENT = "agentsense-processing";
function processing(update: ProcessingUpdate) {
  window.dispatchEvent(new CustomEvent<ProcessingUpdate>(PROCESSING_EVENT, { detail: update }));
}

async function readProcessingResponse(response: Response, id: string, label: string, requireCurrentSignIn: () => void): Promise<Response> {
  if (!response.body) throw new ApiError(0, "The processing stream is unavailable. Reload saved state before retrying.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Response | null = null;
  function consume(line: string) {
    requireCurrentSignIn();
    if (!line.trim()) return;
    const event: unknown = JSON.parse(line);
    if (!event || typeof event !== "object" || !("kind" in event)) {
      throw new ApiError(0, "Invalid processing event. Reload saved state before retrying.");
    }
    if (result) throw new ApiError(0, "Unexpected event after completion. Reload saved state before retrying.");
    if (event.kind === "stage" && "label" in event && typeof event.label === "string" && event.label.length <= 240) {
      processing({ id, label, phase: "stage", stage: event.label });
    } else if (event.kind === "activity" && "active" in event && typeof event.active === "boolean") {
      processing({ id, label, phase: "activity", active: event.active });
    } else if (event.kind === "result" && "data" in event) {
      result = new Response(JSON.stringify(event.data), { headers: { "Content-Type": "application/json" } });
    } else if (event.kind === "error" && "status" in event && typeof event.status === "number" &&
               "detail" in event && typeof event.detail === "string") {
      if (event.status === 401) window.dispatchEvent(new Event("agentsense-auth-expired"));
      throw new ApiError(event.status, `${event.status}: ${event.detail}`);
    } else if (event.kind !== "heartbeat") {
      throw new ApiError(0, "Invalid processing event. Reload saved state before retrying.");
    }
  }
  try {
    while (true) {
      const chunk = await reader.read();
      requireCurrentSignIn();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 2 * 1024 * 1024) throw new ApiError(0, "The processing response exceeded safe limits.");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consume);
      if (chunk.done) break;
    }
    consume(buffer);
    if (!result) throw new ApiError(0, "Processing was interrupted. The operation may still finish; reload saved state before retrying.");
    return result;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

// Safe UUID: crypto.randomUUID() is only defined in secure contexts (https or
// localhost). Fall back so sessions still work if ever served over plain http.
export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return crypto.randomUUID();
  } catch {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function requestResponse(path: string, method = "GET", body?: unknown, file?: File): Promise<Response> {
  const version = authenticationVersion;
  const requireCurrentSignIn = () => {
    if (version !== authenticationVersion) throw new ApiError(0, "Sign-in changed while the request was running. Sign in and reload saved state before retrying.");
  };
  const id = uid();
  const track = method !== "GET";
  const stream = method === "POST" && (path === "/intake" || path.startsWith("/intake/document-preview?") ||
    path === "/chat" || path.startsWith("/analyze/") || path.endsWith("/interview/document-lookup") ||
    /^\/engagements\/[^/]+\/synthesis$/.test(path));
  const label = file ? "Document review" : path.startsWith("/analyze/") ? "Workflow analysis and blueprint"
    : path.endsWith("/interview/document-lookup") ? "Document answer lookup"
    : path === "/chat" ? "Diagnostic response" : path.endsWith("/synthesis") ? "Discovery synthesis"
    : path === "/intake" ? "Enterprise intake" : "Saving workspace changes";
  if (track) processing({ id, label, phase: "start", stage: "Preparing a secure request" });
  try {
  const token = tokenProvider ? (await tokenProvider().catch(() => "")) || accessToken : accessToken;
  requireCurrentSignIn();
  if (track) processing({ id, label, phase: "stage", stage: file ? "Uploading the document" : "Sending the request" });
  const readiness = path === "/ready";
  let r = await fetch(`${readiness ? "" : BASE}${path}`, {
    method, cache: "no-store",
    headers: { ...(file ? { "Content-Type": file.type || "application/octet-stream" }
      : body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(stream ? { Accept: "application/x-ndjson" } : {}),
      ...(workspace ? { "X-Organization-ID": workspace.organization_id, "X-Team-ID": workspace.team_id } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: file || (body === undefined ? undefined : JSON.stringify(body)),
  });
  requireCurrentSignIn();
  if (!r.ok && !(readiness && r.status === 503)) {
    const error = await r.json().catch(() => null);
    requireCurrentSignIn();
    const detail = typeof error?.detail === "string" ? error.detail
      : Array.isArray(error?.detail) ? error.detail.map((e: any) => `${e.loc?.slice(1).join(".")}: ${e.msg}`).join("; ")
      : "Request failed. Please retry.";
    if (r.status === 401) window.dispatchEvent(new Event("agentsense-auth-expired"));
    if (r.status === 403 && error?.code === "invitation_required") {
      window.dispatchEvent(new Event("agentspark-invitation-required"));
    }
    throw new ApiError(r.status, `${r.status}: ${detail}`);
  }
  if (stream && r.headers.get("content-type")?.includes("application/x-ndjson")) {
    r = await readProcessingResponse(r, id, label, requireCurrentSignIn);
  }
  requireCurrentSignIn();
  if (track) processing({ id, label, phase: "complete" });
  return r;
  } catch (error) {
    const failure = error instanceof ApiError ? error
      : new ApiError(0, "The response was interrupted. The operation may still finish; reload saved state before retrying.");
    if (track) processing({ id, label, phase: "error", error: failure.message });
    throw failure;
  }
}
async function request(path: string, method = "GET", body?: unknown) {
  const version = authenticationVersion;
  const result = await (await requestResponse(path, method, body)).json();
  if (version !== authenticationVersion) throw new ApiError(0, "Sign-in changed while the response was loading. Sign in and reload saved state before retrying.");
  return result;
}
const get = (path: string) => request(path);
const post = (path: string, body: unknown) => request(path, "POST", body);

export const api = {
  previewDocument: async (file: File, session_id: string, model_id: InferenceModel["id"],
    target_cloud?: CloudProvider): Promise<DocumentPreview> => {
    const query = new URLSearchParams({ session_id, filename: file.name, model_id, ...(target_cloud ? { target_cloud } : {}) });
    return (await requestResponse(`/intake/document-preview?${query}`, "POST", undefined, file)).json();
  },
  models: (): Promise<ModelCatalog> => get("/models"),
  organizations: (cursor = ""): Promise<DirectoryPage<Organization>> =>
    get(`/organizations?${new URLSearchParams({ cursor })}`),
  createOrganization: (name: string): Promise<Organization> => post("/organizations", { name }),
  organization: (organization: string): Promise<Organization> => get(`/organizations/${organization}`),
  teams: (organization: string, cursor = ""): Promise<DirectoryPage<Team>> =>
    get(`/organizations/${encodeURIComponent(organization)}/teams?${new URLSearchParams({ cursor })}`),
  createTeam: (organization: string, name: string): Promise<Pick<Team, "team_id" | "name">> =>
    post(`/organizations/${encodeURIComponent(organization)}/teams`, { name }),
  members: (organization: string, cursor = ""): Promise<DirectoryPage<DirectoryMember>> =>
    get(`/organizations/${encodeURIComponent(organization)}/members?${new URLSearchParams({ cursor })}`),
  setMember: (organization: string, identity: string, role: "admin" | "member", active: boolean, version?: string) =>
    request(`/organizations/${encodeURIComponent(organization)}/members/${encodeURIComponent(identity)}`, "PUT", { role, active, version }),
  teamMembers: (organization: string, team: string, cursor = ""): Promise<DirectoryPage<DirectoryMember>> =>
    get(`/organizations/${encodeURIComponent(organization)}/teams/${encodeURIComponent(team)}/members?${new URLSearchParams({ cursor })}`),
  setTeamMember: (organization: string, team: string, identity: string, roles: TeamRole[], active: boolean, version?: string) =>
    request(`/organizations/${encodeURIComponent(organization)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(identity)}`,
      "PUT", { roles, active, version }),
  invites: (organization: string, cursor = ""): Promise<DirectoryPage<Invite>> =>
    get(`/organizations/${encodeURIComponent(organization)}/invites?${new URLSearchParams({ cursor })}`),
  createInvite: (organization: string, body: InviteRequest): Promise<Invite & { code: string }> =>
    post(`/organizations/${encodeURIComponent(organization)}/invites`, body),
  revokeInvite: (organization: string, invite: string) =>
    request(`/organizations/${encodeURIComponent(organization)}/invites/${encodeURIComponent(invite)}`, "DELETE"),
  redeemInvite: (code: string): Promise<InviteRedemption> => post("/invites/redeem", { code }),
  previewInvite: (code: string): Promise<InvitePreview> => post("/invites/preview", { code }),
  authConfig: (): Promise<AuthConfig> => get("/auth/config"),
  me: (): Promise<Identity> => get("/auth/me"),
  session: (id: string): Promise<SessionSnapshot> => get(`/sessions/${encodeURIComponent(id)}`),
  interview: (id: string): Promise<InterviewProgress> => get(`/sessions/${encodeURIComponent(id)}/interview`),
  lookupDocument: (id: string, version: string, field_ids: string[] = []): Promise<InterviewProgress> =>
    post(`/sessions/${encodeURIComponent(id)}/interview/document-lookup`, { version, field_ids }),
  saveInterview: (id: string, version: string, answers: Record<string, string>, role?: InterviewRole): Promise<InterviewProgress> =>
    request(`/sessions/${encodeURIComponent(id)}/interview`, "PUT", { version, answers, ...(role ? { role } : {}) }),
  engagements: (cursor = ""): Promise<DirectoryPage<HomeItem>> => get(`/engagements?${new URLSearchParams({ cursor })}`),
  engagement: (id: string): Promise<DiscoveryRecord> => get(`/engagements/${encodeURIComponent(id)}`),
  discoveryPlaybooks: (): Promise<DiscoveryPlaybook[]> => get("/discovery-playbooks"),
  discoveryFindingsPdf: async (id: string, version: string): Promise<Blob> =>
    (await requestResponse(`/engagements/${encodeURIComponent(id)}/findings/pdf?${new URLSearchParams({ version })}`)).blob(),
  createEngagement: (engagement: DiscoveryEngagement): Promise<DiscoveryRecord> => post("/engagements", { engagement }),
  saveEngagement: (id: string, version: string, engagement: DiscoveryEngagement): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}`, "PUT", { version, engagement }),
  deleteEngagement: (id: string, version: string) =>
    request(`/engagements/${encodeURIComponent(id)}?${new URLSearchParams({ version })}`, "DELETE"),
  renewEngagement: (id: string, version: string): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/renew`, { version }),
  startAlignment: (id: string, version: string): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment`, { version }),
  nominateAlignmentStakeholder: (id: string, version: string, value: AlignmentNominationInput & { function: AlignmentFunction }): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/stakeholders`, { version, ...value }),
  nominateAlignmentOwner: (id: string, version: string, value: AlignmentNominationInput & { role: AlignmentOwnerRole }): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/owners`, { version, ...value }),
  nominateAlignmentDecision: (id: string, version: string, value: AlignmentDecisionInput): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/decisions`, { version, ...value }),
  recordAlignmentPosition: (id: string, assignment: string, version: string, value: AlignmentPositionInput): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/stakeholders/${encodeURIComponent(assignment)}/position`, { version, ...value }),
  acceptAlignmentResponsibility: (id: string, collection: "owners" | "decisions", assignment: string, version: string): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/${collection}/${encodeURIComponent(assignment)}/accept`, { version }),
  withdrawAlignmentNomination: (id: string, collection: "owners" | "stakeholders", assignment: string, version: string): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/${collection}/${encodeURIComponent(assignment)}/withdraw`, { version }),
  recordAlignmentOutcome: (id: string, assignment: string, version: string, value: AlignmentOutcomeInput): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/alignment/decisions/${encodeURIComponent(assignment)}/outcome`, { version, ...value }),
  eligibleParticipants: (id: string, cursor = ""): Promise<DirectoryPage<{ identity_id: string }>> =>
    get(`/engagements/${encodeURIComponent(id)}/eligible-participants?${new URLSearchParams({ cursor })}`),
  assignParticipant: (id: string, identity: string, version: string, role: Exclude<InterviewRole, "all">): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/participants/${encodeURIComponent(identity)}`, "PUT", { version, role }),
  removeParticipant: (id: string, identity: string, version: string): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/participants/${encodeURIComponent(identity)}`, "DELETE", { version }),
  saveContribution: (id: string, version: string, answers: Record<string, string>, submit: boolean): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/contribution`, "PUT", { version, answers, submit }),
  saveDiscoveryProcess: (id: string, version: string, process: DiscoveryProcess): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/processes/${encodeURIComponent(process.id)}`, "PUT", { version, process }),
  createDiscoveryTask: (id: string, version: string, assignment: DiscoveryTaskAssignment): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/tasks`, { version, ...assignment }),
  saveStepContribution: (id: string, task: string, version: string, answers: Record<string, string>,
    evidence: DiscoveryBaseline[], submit: boolean): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task)}/contribution`, "PUT", { version, answers, evidence, submit }),
  reviewDiscoverySources: (id: string, version: string, review: DiscoverySourceReviewInput): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/source-reviews`, { version, ...review }),
  compareDiscoveryAlternatives: (id: string, opportunity: string, version: string, alternatives: DiscoveryAlternative[],
    preferred_alternative: DiscoveryAlternativeKind): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/opportunities/${encodeURIComponent(opportunity)}/alternatives`, "PUT",
      { version, alternatives, preferred_alternative }),
  saveDiscoveryRatings: (id: string, opportunity: string, version: string, ratings: DiscoveryRatings): Promise<DiscoveryRecord> =>
    request(`/engagements/${encodeURIComponent(id)}/opportunities/${encodeURIComponent(opportunity)}/ratings`, "PUT", { version, ratings }),
  synthesizeDiscovery: (id: string, version: string, model_id: InferenceModel["id"]): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/synthesis`, { version, model_id }),
  acceptDiscoveryCandidate: (id: string, candidate: string, version: string): Promise<DiscoveryRecord> =>
    post(`/engagements/${encodeURIComponent(id)}/candidates/${encodeURIComponent(candidate)}/accept`, { version }),
  handoffOpportunity: (id: string, opportunity: string, version: string, model_id: InferenceModel["id"],
    target_cloud: CloudProvider, reviewed: boolean): Promise<{ session_id: string; engagement: DiscoveryRecord }> =>
    post(`/engagements/${encodeURIComponent(id)}/opportunities/${encodeURIComponent(opportunity)}/handoff`,
      { version, model_id, target_cloud, reviewed, alignment_reviewed: reviewed }),
  executiveBriefPdf: async (id: string, version: string): Promise<Blob> =>
    (await requestResponse(`/sessions/${encodeURIComponent(id)}/executive-brief/pdf?${new URLSearchParams({ version })}`)).blob(),
  evidence: (id: string): Promise<EvidenceRegisterResponse> => get(`/sessions/${encodeURIComponent(id)}/evidence`),
  saveEvidence: (id: string, revision: number, entries: EvidenceInput[]): Promise<EvidenceRegisterResponse> =>
    request(`/sessions/${encodeURIComponent(id)}/evidence`, "PUT", { revision, entries }),
  confirmEvidence: (id: string, entry: string, revision: number, method: string): Promise<EvidenceRegisterResponse> =>
    post(`/sessions/${encodeURIComponent(id)}/evidence/${encodeURIComponent(entry)}/confirm`, { revision, method }),
  implementationReadiness: (id: string): Promise<ImplementationReadinessResponse> =>
    get(`/sessions/${encodeURIComponent(id)}/implementation-readiness`),
  saveImplementationReadiness: (id: string, revision: number, evidence_revision: number,
    assessment: ReadinessAssessment): Promise<ImplementationReadinessResponse> =>
    request(`/sessions/${encodeURIComponent(id)}/implementation-readiness`, "PUT", { revision, evidence_revision, assessment }),
  deleteSession: (id: string) => request(`/sessions/${encodeURIComponent(id)}`, "DELETE"),
  home: (status = "all", cursor = ""): Promise<HomePage> => get(`/home?${new URLSearchParams({ status, cursor })}`),
  decision: (session: string, analysis: string): Promise<ArchivedDecision> =>
    get(`/decisions/${encodeURIComponent(session)}/${encodeURIComponent(analysis)}`),
  deleteArchivedWorkflow: (session: string, analysis: string) =>
    request(`/decisions/${encodeURIComponent(session)}/${encodeURIComponent(analysis)}`, "DELETE"),
  health: async (): Promise<RuntimeHealth> => {
    const response = await fetch("/health");
    if (!response.ok) throw new Error(`Health check failed (${response.status})`);
    return response.json();
  },
  readiness: async (): Promise<Readiness> => {
    return (await requestResponse("/ready")).json();
  },
  intake: (body: any) => post("/intake", body),
  chat: (session_id: string, message: string, version: string, question_ids: string[],
    demo_scenario?: DemoScenario): Promise<ChatResponse> =>
    post("/chat", { session_id, message, version, question_ids, demo_scenario }),
  analyze: (session_id: string, roi_assumptions?: ROIAssumptions, version?: string) =>
    post(`/analyze/${session_id}`, { roi_assumptions, ...(version ? { version } : {}) }),
  blueprint: (session_id: string) => get(`/blueprint/${session_id}`),
  blueprintPdf: async (id: string, analysis_id: string, status: string): Promise<Blob> => {
    const response = await requestResponse(`/blueprint/${encodeURIComponent(id)}/pdf?${new URLSearchParams({ analysis_id, status })}`);
    if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) {
      throw new ApiError(502, "PDF export returned an unexpected response. Fetch the blueprint and retry.");
    }
    return response.blob();
  },
  review: (session_id: string) => get(`/review/${session_id}`),
  submitReview: (session_id: string, body: ReviewRequest) => post(`/review/${session_id}`, body),
  portfolio: () => get("/portfolio"),
  patterns: (q: string, k = 6) => get(`/patterns?q=${encodeURIComponent(q)}&k=${k}`),
  guardrailCheck: (message: string) => post("/guardrail-check", { session_id: "demo", message }),
};

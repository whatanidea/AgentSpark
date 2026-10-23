// Same-origin API client. In dev, Vite proxies /api → :8000; in prod FastAPI
// serves this SPA and the API from the same origin, so relative URLs just work.
const BASE = "/api/v1";
let accessToken = "";
let tokenProvider: (() => Promise<string>) | null = null;
export function setAccessToken(token: string) { accessToken = token; }
/** When set, each request asks the provider for a current token (silently refreshed by MSAL). */
export function setTokenProvider(provider: typeof tokenProvider) { tokenProvider = provider; }
export type Permissions = { read: boolean; write: boolean; review: boolean; delete: boolean };
export type CloudProvider = "azure" | "aws";
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
  status: "joined" | "already_member";
};
/** Accepts a full invite link (…#invite=CODE) or a bare code. */
export function parseInviteCode(value: string): string {
  const text = value.trim();
  const match = text.match(/[#?&]invite=([A-Za-z0-9_.-]+)/);
  return match ? match[1] : text;
}
export function inviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#invite=${code}`;
}
export type SignInConfig = { client_id: string; authority: string; scope: string };
export type AuthConfig = {
  mode: "local-demo" | "oidc"; retention_hours: number; archive_retention_days: number; sign_in?: SignInConfig | null;
};
export type HomeStatus = "draft" | "pending_review" | "approved" | "rejected";
export type HomeItem = {
  can_delete: boolean;
  kind: "session" | "decision"; session_id: string; analysis_id: string | null;
  title: string; domain: string; status: HomeStatus; score: number | null;
  updated_at: string; expires_at: string; sort_key: string; legacy: boolean;
};
export type HomePage = { items: HomeItem[]; next_cursor: string | null; archive_retention_days: number };
export type ArchivedDecision = {
  summary: HomeItem;
  details: {
    deployment_preferences?: DeploymentPreferences;
    cloud_mapping?: Record<string, unknown> | null;
    evidence_report?: EvidenceReport | null;
    readiness_report?: ImplementationReadinessReport | null;
    workflow_intelligence: { summary: string; systems: string[] } | null;
    suitability_score: { agent_score: number; recommended_pattern: string; explanation: string } | null;
    human_review: { decision: "approve" | "reject"; reviewer: string; note: string; reviewed_at: string } | null;
    governance: { decision: string; overall_risk: string; reason: string } | null;
    architecture_doc: string; cost_estimate: string; roadmap: string;
    retrieved_patterns: { id: string; name: string; source_ref: string; content_sha256: string }[];
    roi: import("./components/ROIReport").ROIResult | null;
  };
};
export type Identity = { identity: string; can_review: boolean };
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
  enterprise_context: Record<string, string>;
  evidence_register: EvidenceEntry[];
  evidence_revision: number;
  evidence_report: EvidenceReport | null;
  readiness_assessment: ReadinessAssessment;
  readiness_revision: number;
  readiness_report: ImplementationReadinessReport | null;
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
export type ROIAssumptions = {
  working_days_per_year: number;
  loaded_hourly_rate: number;
  minutes_per_step: number;
  minutes_per_decision: number;
  implementation_cost_per_agent: number;
  annual_operating_cost: number | null;
};
export type Diagnosis = {
  intelligence: Record<string, unknown> | null;
  evidence: Record<string, { status: "supplied" | "inferred" | "missing"; source: string; quote: string }>;
  missing_facts: string[];
  follow_up_questions: string[];
  data_completeness: number;
};
export type InterviewField = {
  id: string; label: string; question: string; group: string;
  kind: "text" | "number" | "select"; options: string[]; max_length: number;
};
export type InterviewProgress = {
  version: string; rounds_used: number; max_rounds: number; limit_reached: boolean; can_chat: boolean;
  questions: string[]; missing_fields: string[]; missing_facts: string[];
  fields: InterviewField[]; answers: Record<string, string>; permissions: Permissions;
};
export type ChatResponse = { status: "blocked"; response: string } |
  { status: "success"; response: string; message: string; interview: InterviewProgress };
export type Readiness = {
  status: "ready" | "degraded";
  ready: boolean;
  mode: "demo" | "live";
  dependencies: Record<string, "demo" | "ready" | "unavailable">;
};

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

async function requestResponse(path: string, method = "GET", body?: unknown): Promise<Response> {
  const token = tokenProvider ? (await tokenProvider().catch(() => "")) || accessToken : accessToken;
  const r = await fetch(`${BASE}${path}`, {
    method, cache: "no-store",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(workspace ? { "X-Organization-ID": workspace.organization_id, "X-Team-ID": workspace.team_id } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const error = await r.json().catch(() => null);
    const detail = typeof error?.detail === "string" ? error.detail
      : Array.isArray(error?.detail) ? error.detail.map((e: any) => `${e.loc?.slice(1).join(".")}: ${e.msg}`).join("; ")
      : "Request failed. Please retry.";
    if (r.status === 401) window.dispatchEvent(new Event("agentsense-auth-expired"));
    throw new ApiError(r.status, `${r.status}: ${detail}`);
  }
  return r;
}
async function request(path: string, method = "GET", body?: unknown) {
  return (await requestResponse(path, method, body)).json();
}
const get = (path: string) => request(path);
const post = (path: string, body: unknown) => request(path, "POST", body);

export const api = {
  organizations: (cursor = ""): Promise<DirectoryPage<Organization>> =>
    get(`/organizations?${new URLSearchParams({ cursor })}`),
  createOrganization: (name: string): Promise<Organization> => post("/organizations", { name }),
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
  authConfig: (): Promise<AuthConfig> => get("/auth/config"),
  me: (): Promise<Identity> => get("/auth/me"),
  session: (id: string): Promise<SessionSnapshot> => get(`/sessions/${encodeURIComponent(id)}`),
  interview: (id: string): Promise<InterviewProgress> => get(`/sessions/${encodeURIComponent(id)}/interview`),
  saveInterview: (id: string, version: string, answers: Record<string, string>): Promise<InterviewProgress> =>
    request(`/sessions/${encodeURIComponent(id)}/interview`, "PUT", { version, answers }),
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
    const response = await fetch("/ready");
    if (!response.ok && response.status !== 503) throw new Error(`Readiness check failed (${response.status})`);
    return response.json();
  },
  intake: (body: any) => post("/intake", body),
  chat: (session_id: string, message: string, demo_scenario?: DemoScenario): Promise<ChatResponse> =>
    post("/chat", { session_id, message, demo_scenario }),
  analyze: (session_id: string, roi_assumptions?: ROIAssumptions) => post(`/analyze/${session_id}`, { roi_assumptions }),
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

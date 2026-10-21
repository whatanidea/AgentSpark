// Same-origin API client. In dev, Vite proxies /api → :8000; in prod FastAPI
// serves this SPA and the API from the same origin, so relative URLs just work.
const BASE = "/api/v1";
let accessToken = "";
export function setAccessToken(token: string) { accessToken = token; }
export type Permissions = { read: boolean; write: boolean; review: boolean; delete: boolean };
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
export type AuthConfig = { mode: "local-demo" | "oidc"; retention_hours: number; archive_retention_days: number };
export type HomeStatus = "draft" | "pending_review" | "approved" | "rejected";
export type HomeItem = {
  kind: "session" | "decision"; session_id: string; analysis_id: string | null;
  title: string; domain: string; status: HomeStatus; score: number | null;
  updated_at: string; expires_at: string; sort_key: string; legacy: boolean;
};
export type HomePage = { items: HomeItem[]; next_cursor: string | null; archive_retention_days: number };
export type ArchivedDecision = {
  summary: HomeItem;
  details: {
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
export type SessionSnapshot = {
  session_id: string;
  enterprise_context: Record<string, string>;
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

async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method, cache: "no-store",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(workspace ? { "X-Organization-ID": workspace.organization_id, "X-Team-ID": workspace.team_id } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
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
  return r.json();
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
  authConfig: (): Promise<AuthConfig> => get("/auth/config"),
  me: (): Promise<Identity> => get("/auth/me"),
  session: (id: string): Promise<SessionSnapshot> => get(`/sessions/${encodeURIComponent(id)}`),
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
  chat: (session_id: string, message: string, demo_scenario?: DemoScenario) => post("/chat", { session_id, message, demo_scenario }),
  analyze: (session_id: string, roi_assumptions?: ROIAssumptions) => post(`/analyze/${session_id}`, { roi_assumptions }),
  blueprint: (session_id: string) => get(`/blueprint/${session_id}`),
  review: (session_id: string) => get(`/review/${session_id}`),
  submitReview: (session_id: string, body: ReviewRequest) => post(`/review/${session_id}`, body),
  portfolio: () => get("/portfolio"),
  patterns: (q: string, k = 6) => get(`/patterns?q=${encodeURIComponent(q)}&k=${k}`),
  guardrailCheck: (message: string) => post("/guardrail-check", { session_id: "demo", message }),
};

// Same-origin API client. In dev, Vite proxies /api → :8000; in prod FastAPI
// serves this SPA and the API from the same origin, so relative URLs just work.
const BASE = "/api/v1";

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

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
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

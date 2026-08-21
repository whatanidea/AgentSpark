// Same-origin API client. In dev, Vite proxies /api → :8000; in prod FastAPI
// serves this SPA and the API from the same origin, so relative URLs just work.
const BASE = "/api/v1";

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
  health: () => fetch("/health").then((r) => r.json()),
  intake: (body: any) => post("/intake", body),
  chat: (session_id: string, message: string) => post("/chat", { session_id, message }),
  analyze: (session_id: string) => post(`/analyze/${session_id}`, {}),
  blueprint: (session_id: string) => get(`/blueprint/${session_id}`),
  portfolio: () => get("/portfolio"),
  patterns: (q: string, k = 6) => get(`/patterns?q=${encodeURIComponent(q)}&k=${k}`),
  guardrailCheck: (message: string) => post("/guardrail-check", { session_id: "demo", message }),
};

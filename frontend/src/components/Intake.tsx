import { useState } from "react";
import { api, uid } from "../api";
import { Card, Button } from "./ui";

const SAMPLES: Record<string, any> = {
  "🧾 Invoice Approval (Finance)": {
    business_domain: "Financial Services — Accounts Payable",
    team_size: "201-1000",
    existing_systems: "SAP, DocuSign, Outlook, internal SQL ledger",
    pain_points: "500+ invoices/day need 6-8 approvals across Finance & Legal; 25 exceptions/week handled manually; 5-day cycle time.",
    compliance_requirements: "High",
  },
  "🎧 Customer Support Triage": {
    business_domain: "SaaS Customer Support",
    team_size: "51-200",
    existing_systems: "Zendesk, Salesforce, internal KB, Slack",
    pain_points: "High volume of unstructured tickets; agents spend hours routing and drafting replies; rules change weekly.",
    compliance_requirements: "Low",
  },
  "🏥 Claims Verification (Healthcare)": {
    business_domain: "Healthcare Claims",
    team_size: "201-1000",
    existing_systems: "Epic EHR, legacy SQL, Salesforce, Outlook",
    pain_points: "Manual claim verification takes 5 days; high error cost; HIPAA compliance checks are slow.",
    compliance_requirements: "High",
  },
};

const EMPTY = { business_domain: "", team_size: "201-1000", existing_systems: "", pain_points: "", compliance_requirements: "Medium" };

export default function Intake({ sessionId, setSessionId, setContext, goNext }: any) {
  const [form, setForm] = useState<any>(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const sid = uid();
      await api.intake({ session_id: sid, ...form });
      setSessionId(sid);
      setContext?.({ ...form });   // share intake context with the Diagnostic Agent
      setMsg(`✅ Intake saved. Session ${sid.slice(0, 8)}… — continue to the Diagnostic Agent.`);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Enterprise Context</h1>
        <p className="text-slate-400 mt-1">Tell AgentSense about a workflow you're considering for agentification — or load a sample to see a full run fast.</p>
      </header>

      <Card title="Quick start">
        <div className="flex flex-wrap gap-2">
          {Object.keys(SAMPLES).map((k) => (
            <Button key={k} variant="ghost" onClick={() => setForm({ ...EMPTY, ...SAMPLES[k] })}>
              {k}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Workflow details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Business Domain"><input className={inp} value={form.business_domain} onChange={set("business_domain")} placeholder="e.g. Financial Services" /></Field>
          <Field label="Team Size">
            <select className={inp} value={form.team_size} onChange={set("team_size")}>
              {["1-50", "51-200", "201-1000", "1000+"].map((o) => <option key={o} className="bg-slate-900">{o}</option>)}
            </select>
          </Field>
          <Field label="Existing Systems" full><input className={inp} value={form.existing_systems} onChange={set("existing_systems")} placeholder="e.g. SAP, Salesforce, Jira" /></Field>
          <Field label="Current Pain Points" full><textarea className={inp} rows={3} value={form.pain_points} onChange={set("pain_points")} /></Field>
          <Field label="Compliance Requirements">
            <select className={inp} value={form.compliance_requirements} onChange={set("compliance_requirements")}>
              {["Low", "Medium", "High"].map((o) => <option key={o} className="bg-slate-900">{o}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex items-center gap-4 mt-5">
          <Button onClick={submit} disabled={busy || !form.business_domain}>{busy ? "Saving…" : "Submit Intake"}</Button>
          {sessionId && <Button variant="ghost" onClick={goNext}>Go to Diagnostic →</Button>}
        </div>
        {msg && <p className="mt-3 text-sm text-slate-300">{msg}</p>}
      </Card>
    </div>
  );
}

const inp = "w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500/60";
function Field({ label, children, full }: any) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

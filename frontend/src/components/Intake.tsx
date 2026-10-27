import { useEffect, useState } from "react";
import { api, uid, type InferenceModel, type ModelCatalog } from "../api";
import { Card, Button } from "./ui";
import Icon, { type IconName } from "./Icon";

const SAMPLES: Record<string, any> = {
  "🧾 Invoice Approval (Finance)": {
    demo_scenario: "invoice",
    business_domain: "Financial Services — Accounts Payable",
    team_size: "201-1000",
    existing_systems: "SAP, DocuSign, Outlook, internal SQL ledger",
    pain_points: "500+ invoices/day need 6-8 approvals across Finance & Legal; 25 exceptions/week handled manually; 5-day cycle time.",
    compliance_requirements: "High",
  },
  "🎧 Customer Support Triage": {
    demo_scenario: "support",
    business_domain: "SaaS Customer Support",
    team_size: "51-200",
    existing_systems: "Zendesk, Salesforce, internal KB, Slack",
    pain_points: "High volume of unstructured tickets; agents spend hours routing and drafting replies; rules change weekly.",
    compliance_requirements: "Low",
  },
  "🏥 Claims Verification (Healthcare)": {
    demo_scenario: "claims",
    business_domain: "Healthcare Claims",
    team_size: "201-1000",
    existing_systems: "Epic EHR, legacy SQL, Salesforce, Outlook",
    pain_points: "Manual claim verification takes 5 days; high error cost; HIPAA compliance checks are slow.",
    compliance_requirements: "High",
  },
  "Payroll Calculation (standard software)": {
    demo_scenario: "payroll", business_domain: "Payroll", team_size: "1-50",
    existing_systems: "Payroll", pain_points: "Apply fixed rules to structured timesheets.",
    compliance_requirements: "High",
  },
};

const EMPTY = { business_domain: "", team_size: "201-1000", existing_systems: "", pain_points: "", compliance_requirements: "Medium",
  target_cloud: "", preferred_region: "", data_residency_requirements: "", deployment_constraints: "" };

const SAMPLE_PRESENTATION: Record<string, { name: string; detail: string; icon: IconName }> = {
  invoice: { name: "Invoice Approval", detail: "Finance & accounts payable", icon: "finance" },
  support: { name: "Customer Support Triage", detail: "Ticket routing & response", icon: "support" },
  claims: { name: "Claims Verification", detail: "Healthcare & compliance", icon: "claims" },
  payroll: { name: "Payroll Calculation", detail: "A standard-software alternative", icon: "payroll" },
};

export default function Intake({ sessionId, initialContext, initialModel, modelLocked, onSaved, onBusyChange }: any) {
  const [form, setForm] = useState<any>({ ...EMPTY, ...initialContext });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"demo" | "live" | null>(null);
  const [confirmChange, setConfirmChange] = useState(false);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [modelId, setModelId] = useState<InferenceModel["id"] | "">(initialModel?.id || "");

  useEffect(() => {
    api.health().then((health) => setMode(health.mode)).catch((e: Error) => setMsg(e.message));
    api.models().then(result => {
      setCatalog(result);
      if (result.mode === "demo") setModelId("demo");
    }).catch((e: Error) => setMsg(`Model catalog could not be loaded: ${e.message}`));
  }, []);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    if (!modelId && !modelLocked) { setMsg("Select the assessment model before the interview."); return; }
    if (!form.target_cloud) { setMsg("Select the target cloud for this assessment."); return; }
    if (!/^[a-z0-9-]{0,100}$/.test(form.preferred_region)) { setMsg("Use lowercase letters, numbers and hyphens for the region."); return; }
    if (sessionId && initialContext && !confirmChange && [
      "target_cloud", "preferred_region", "data_residency_requirements", "deployment_constraints",
    ].some(key => (initialContext[key] || (key === "target_cloud" ? "azure" : "")) !== form[key])) {
      setConfirmChange(true); return;
    }
    setBusy(true); onBusyChange(true);
    setMsg("");
    try {
      const sid = sessionId || uid();
      const saved = await api.intake({ session_id: sid, ...form, ...(modelId ? { model_id: modelId } : {}) });
      setForm({ ...saved.enterprise_context, demo_scenario: form.demo_scenario });
      await onSaved(sid);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false); onBusyChange(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div className="eyebrow mb-2">Step 01 / Workflow setup</div>
        <h1>Enterprise Context</h1>
        <p className="mt-2">Tell AgentSpark about a workflow you're considering for agentification — or load a sample to see a full run fast.</p>
      </header>

      <Card title="Quick start" description="Explore a sample scenario, or describe your own workflow below.">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Object.keys(SAMPLES).map((k) => {
            const sample = SAMPLE_PRESENTATION[SAMPLES[k].demo_scenario];
            return (
              <button key={k} type="button" aria-label={k} aria-pressed={form.business_domain === SAMPLES[k].business_domain}
                className="sample-tile" disabled={!mode || busy} onClick={() => setForm({
                  ...form, ...SAMPLES[k], demo_scenario: mode === "demo" ? SAMPLES[k].demo_scenario : null,
                })}>
                <span className="sample-icon"><Icon name={sample.icon} /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800">{sample.name}</span>
                  <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">{sample.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
        {form.demo_scenario && <p className="notice notice-warning mt-4 block">
          Selected fictional demo: {form.demo_scenario}. Fixed fixture facts drive analysis, not your edits or interview text.
          {" "}<button className="underline underline-offset-2 font-semibold" disabled={busy} onClick={() => setForm({ ...form, demo_scenario: null })}>Clear sample selection</button>
        </p>}
        {mode === "live" && <p className="text-xs text-slate-500 mt-3">Samples load intake templates only in live mode; missing facts require clarification.</p>}
      </Card>

      <Card title="Assessment model" description="Choose the AI used for the interview and generated assessment, independently of the blueprint's target cloud.">
        <Field label="Assessment model">
          <select aria-label="Assessment model" className={inp} value={modelId} required={!modelLocked}
            disabled={busy || modelLocked || !catalog}
            onChange={event => setModelId(catalog?.items.find(item => item.id === event.target.value && item.available)?.id || "")}>
            <option value="">{modelLocked ? "Legacy Azure OpenAI default" : "Choose a model before the interview"}</option>
            {catalog?.items.map(item => <option key={item.id} value={item.id} disabled={!item.available}
              title={!item.available && item.id === "foundry-claude-haiku" ? "Coming soon" : item.reason}>
              {item.label}{item.available ? "" : item.id === "foundry-claude-haiku" ? " — Coming soon" : " — unavailable"}
            </option>)}
          </select>
        </Field>
        {initialModel && !catalog?.items.some(item => item.id === initialModel.id && item.available) &&
          <p className="text-xs text-slate-600 mt-3">Saved selection: {initialModel.provider} / {initialModel.model}. Its connection is not currently available.</p>}
        <p className="text-xs text-slate-500 mt-3">{catalog?.mode === "demo"
          ? "Deterministic demo fixtures only; no AI provider is called."
          : "The model is fixed after generation starts. Start a new assessment to compare models. No automatic provider fallback is used. Scoring and ROI formulas remain deterministic."}</p>
        {catalog?.items.filter(item => !item.available).map(item =>
          item.id === "foundry-claude-haiku" ?
            <div key={item.id} role="group" aria-label={`${item.label} — Coming soon`} aria-disabled="true"
              aria-describedby="claude-coming-soon" tabIndex={0}
              className="group relative mt-3 inline-flex cursor-not-allowed items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              <span>{item.label}</span>
              <span className="rounded-full bg-slate-200 px-2 py-1 font-medium">Coming soon</span>
              <span id="claude-coming-soon" role="tooltip"
                className="invisible absolute bottom-full left-0 z-10 mb-2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg group-hover:visible group-focus:visible">
                Coming soon. Continue with Azure OpenAI.
              </span>
            </div> :
            <p key={item.id} className="text-xs text-slate-500 mt-2">{item.label}: {item.reason}</p>)}
      </Card>

      <Card title="Deployment preferences" description="Choose the cloud for the customer's proposed solution, not AgentSpark's hosting.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Target cloud">
            <select aria-label="Target cloud" className={inp} required disabled={busy} value={form.target_cloud} onChange={event => {
              setForm({ ...form, target_cloud: event.target.value, preferred_region: "" }); setConfirmChange(false);
            }}>
              <option value="">Select a cloud</option><option value="azure">Microsoft Azure</option><option value="aws">AWS</option>
            </select>
          </Field>
          <Field label="Preferred region (optional)">
            <input className={inp} disabled={busy} maxLength={100} pattern="[a-z0-9-]*" value={form.preferred_region}
              placeholder={form.target_cloud === "aws" ? "e.g. us-east-1" : "e.g. westus3"} onChange={set("preferred_region")} />
          </Field>
          <Field label="Data residency requirements (optional)">
            <textarea className={inp} disabled={busy} maxLength={2000} value={form.data_residency_requirements}
              onChange={set("data_residency_requirements")} />
          </Field>
          <Field label="Existing cloud services or constraints (optional)">
            <textarea className={inp} disabled={busy} maxLength={2000} value={form.deployment_constraints}
              onChange={set("deployment_constraints")} />
          </Field>
        </div>
        <p className="text-xs text-slate-500 mt-3">Assessment only. No cloud account connection or deployment. Region availability, model access, residency and pricing require separate validation. AgentSpark remains hosted on Azure and processes assessment data using its configured Azure services.</p>
      </Card>
      {confirmChange && <section role="alertdialog" aria-label="Confirm deployment preference change" className="notice block">
        <p>Saving changed cloud preferences clears the current analysis, blueprint and approval. Existing archived decisions are retained unchanged.</p>
        <Button disabled={busy} onClick={submit}>Confirm preferences and save intake</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirmChange(false)}>Cancel</Button>
      </section>}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_250px] items-start gap-6">
      <Card title="Workflow details" description="Give your advisor the context it needs to ask better questions.">
        <fieldset disabled={busy} className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">
          <Field label="Business Domain"><input className={inp} value={form.business_domain} onChange={set("business_domain")} placeholder="e.g. Financial Services" required /></Field>
          <Field label="Team Size">
            <select className={inp} value={form.team_size} onChange={set("team_size")}>
              {["1-50", "51-200", "201-1000", "1000+"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Existing Systems" full><input className={inp} value={form.existing_systems} onChange={set("existing_systems")} placeholder="e.g. SAP, Salesforce, Jira" /></Field>
          <Field label="Current Pain Points" full><textarea className={inp} rows={4} value={form.pain_points} onChange={set("pain_points")} placeholder="What slows this workflow down? Describe manual steps, exceptions, or bottlenecks." /></Field>
          <Field label="Compliance Requirements">
            <select className={inp} value={form.compliance_requirements} onChange={set("compliance_requirements")}>
              {["Low", "Medium", "High"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </fieldset>
        <div className="flex items-center justify-between flex-wrap gap-4 mt-6 pt-5 border-t border-slate-100">
          <p className="text-xs text-slate-500">Next: a focused diagnostic interview</p>
          <Button onClick={submit} disabled={busy || !catalog || (!modelId && !modelLocked) || !form.business_domain || !form.target_cloud || confirmChange}>{busy ? "Saving…" : "Submit Intake"}<span aria-hidden="true">→</span></Button>
        </div>
        {msg && <p role="alert" className="mt-3 text-sm text-rose-700">{msg}</p>}
      </Card>
      <Card title="What happens next" className="bg-slate-50/60">
        <ol className="space-y-6">
          {[
            ["Understand", "A guided interview captures the workflow and the facts behind it."],
            ["Evaluate", "Assess readiness, potential value, and governance constraints."],
            ["Decide", "Review an advisory blueprint, or a simpler non-agentic alternative."],
          ].map(([title, detail], index) => (
            <li key={title} className="flex gap-3">
              <span className="text-[11px] font-semibold text-teal-700 pt-0.5" aria-hidden="true">0{index + 1}</span>
              <div><p className="text-xs font-semibold text-slate-800">{title}</p><p className="text-xs text-slate-500 leading-relaxed mt-1.5">{detail}</p></div>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-slate-500 leading-relaxed mt-6 pt-4 border-t border-slate-200">Recommendations guide decisions. They never execute or deploy your workflow.</p>
      </Card>
      </div>
    </div>
  );
}

const inp = "form-control";
function Field({ label, children, full }: any) {
  return (
    <label className={full ? "md:col-span-2" : ""}>
      <span className="block text-xs font-medium text-slate-700 mb-2">{label}</span>
      {children}
    </label>
  );
}

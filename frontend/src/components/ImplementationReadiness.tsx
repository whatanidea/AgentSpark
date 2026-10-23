import { useEffect, useState } from "react";
import { api, type ImplementationReadinessReport, type ImplementationReadinessResponse,
  type PilotPlan, type ReadinessAssessment, type ReadinessCheckId, type ReadinessCheckInput, type ReadinessReviewContext } from "../api";
import { Button, Card, Pill, Spinner } from "./ui";

const DECISIONS = { ready: "Ready", ready_with_conditions: "Ready with conditions", blocked: "Blocked", not_assessed: "Not assessed" };
const STATUSES = [["unknown", "Not assessed"], ["needs_validation", "Needs validation"],
  ["blocked", "Blocked"], ["ready", "Ready (requires confirmed evidence and owner)"]] as const;
const OWNERS = [["unassigned", "Unassigned"], ["proposed", "Proposed"], ["client_confirmed", "Client-confirmed"]] as const;
const PILOT: { key: keyof PilotPlan; label: string }[] = [
  { key: "scope", label: "Pilot scope" }, { key: "success_metrics", label: "Success metrics and acceptance thresholds" },
  { key: "failure_handling", label: "Failure handling and rollback tests" },
  { key: "authorization_boundaries", label: "Authorization boundaries and prohibited actions" },
];

function draftFrom(value: ImplementationReadinessResponse): ReadinessAssessment {
  return { pilot: value.assessment.pilot, checks: value.catalog.map(spec =>
    value.assessment.checks.find(check => check.id === spec.id) || {
      id: spec.id, status: "unknown", finding: "", evidence_ids: [], owner: "", owner_status: "unassigned",
      owner_confirmation_reference: "", next_action: "", completion_criteria: "",
    }) };
}

export function ReadinessSummary({ report }: { report?: ImplementationReadinessReport | null }) {
  if (!report) return <Card title="Implementation Readiness Report">
    <p className="text-sm">No implementation-readiness snapshot in this assessment. Complete Implementation readiness and rerun analysis.</p>
  </Card>;
  return <Card title="Implementation Readiness Report">
    <Pill tone={report.decision === "ready" ? "green" : report.decision === "blocked" ? "red" : "amber"}>
      {DECISIONS[report.decision]}
    </Pill>
    <p className="text-sm mt-3">{report.rationale}</p>
    <p className="text-xs text-slate-500 mt-2">{report.limitations}</p>
    <p className="text-xs mt-3">Readiness version {report.revision} / evidence version {report.evidence_revision}
      {" / "}{report.target_cloud === "aws" ? "AWS" : "Azure"} / {report.preferred_region || "Region unspecified"}
      {" / "}{new Date(report.assessed_at).toLocaleString()}</p>
    <p className="text-sm mt-3 break-words">Systems: {Array.isArray(report.workflow_context.systems)
      ? report.workflow_context.systems.join(", ") : report.workflow_context.systems || "Not specified"}</p>
    <p className="text-sm break-words">Residency: {report.workflow_context.data_residency_requirements || "Not specified"}</p>
    <p className="text-sm break-words">Deployment constraints: {report.workflow_context.deployment_constraints || "Not specified"}</p>
    <div className="mt-4 space-y-3">{report.checks.map(check =>
      <section key={check.id} className="rounded-lg border p-3 text-sm break-words">
        <h3 className="font-semibold">{check.title}: {check.status.replace(/_/g, " ")}</h3>
        {check.reported_status !== check.status && <p className="text-amber-800">Reported ready; validation is still required.</p>}
        <p className="whitespace-pre-wrap mt-2">{check.finding || "No finding supplied."}</p>
        <p>Owner: {check.owner || "Unassigned"} ({check.owner_status.replace(/_/g, " ")})</p>
        {check.owner_confirmation_reference && <p>Client confirmation reference: {check.owner_confirmation_reference}</p>}
        <p>Depends on: {check.depends_on.join(", ") || "No prerequisite checks"}</p>
        {check.validation_needs.length > 0 && <ul className="list-disc pl-5 text-amber-800">
          {check.validation_needs.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        {check.evidence.map(entry => <p key={entry.id} className="mt-2">
          Evidence [{entry.id}]: {entry.statement} / {entry.source_reference || "No source"}
          {" / "}{entry.confirmation ? `Reviewer attestation: ${entry.confirmation.method}` : "Not reviewer-confirmed"}
        </p>)}
      </section>)}</div>
    <h3 className="font-semibold mt-5">Prioritized action plan</h3>
    {report.actions.length ? <ul className="space-y-3 mt-3 text-sm">{report.actions.map(action =>
      <li key={action.check_id} className="border-l-2 pl-3 break-words">
        <strong>{action.priority} / {action.check_id}</strong>: {action.action}
        <p>Owner: {action.owner} ({action.owner_status.replace(/_/g, " ")})</p>
        <p>Completion evidence: {action.completion_criteria}</p>
        <p>Dependencies: {action.depends_on.join(", ") || "None"}</p>
      </li>)}</ul> : <p className="text-sm mt-2">No check-specific actions outstanding; review the pilot criteria below.</p>}
    <h3 className="font-semibold mt-5">Pilot plan and entry criteria</h3>
    <dl className="text-sm space-y-2 mt-3">{PILOT.map(({ key, label }) => <div key={key}>
      <dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words">{report.pilot[key] || "Not supplied — resolve before pilot"}</dd>
    </div>)}</dl>
    <ul className="list-disc pl-5 text-sm mt-3">{report.pilot_entry_criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
  </Card>;
}

export function readinessMarkdown(report?: ImplementationReadinessReport | null, review?: ReadinessReviewContext): string {
  if (!report) return "## Implementation Readiness Report\nNo readiness snapshot available.\n";
  return `## Implementation Readiness Report
**Decision:** ${DECISIONS[report.decision]}
${report.rationale}

${report.limitations}

**Target:** ${report.target_cloud} / ${report.preferred_region || "Region unspecified"}
**Assessed at:** ${report.assessed_at}
**Readiness / evidence versions:** ${report.revision} / ${report.evidence_revision}
**Analysis:** ${review?.analysis_id || "Not attached to a current analysis"}
**Recommendation status (not pilot authorization):** ${review?.status || "See enclosing assessment"}
${review?.human_review ? `**Human review:** ${review.human_review.decision} by ${review.human_review.reviewer} at ${review.human_review.reviewed_at}
**Review note:** ${review.human_review.note}` : "No human-review attestation supplied in this export section."}

### Findings and evidence
${report.checks.map(check => `- **${check.title}: ${check.status}** — ${check.finding || "Not assessed"}
  - Owner: ${check.owner || "Unassigned"} (${check.owner_status}); confirmation reference: ${check.owner_confirmation_reference || "None"}
  - Validation needs: ${check.validation_needs.join("; ") || "None recorded"}
  - Evidence: ${check.evidence.map(entry => `[${entry.id}] ${entry.source_reference}; ${entry.confirmation ? entry.confirmation.method : "Not reviewer-confirmed"}`).join("; ") || "None"}`).join("\n")}

### Prioritized action plan
${report.actions.map(action => `- **${action.priority} / ${action.check_id}:** ${action.action}
  - Owner: ${action.owner} (${action.owner_status})
  - Depends on: ${action.depends_on.join(", ") || "None"}
  - Completion evidence: ${action.completion_criteria}`).join("\n") || "No check-specific actions outstanding."}

### Pilot plan and entry criteria
${PILOT.map(({ key, label }) => `- **${label}:** ${report.pilot[key] || "Not supplied — resolve before pilot"}`).join("\n")}
${report.pilot_entry_criteria.map(criterion => `- ${criterion}`).join("\n")}

### Full readiness snapshot
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;
}

export default function ImplementationReadiness({ sessionId, hasAnalysis, onRefresh, onBusyChange }: {
  sessionId: string; hasAnalysis: boolean; onRefresh: () => Promise<void>; onBusyChange: (value: boolean) => void;
}) {
  const [saved, setSaved] = useState<ImplementationReadinessResponse | null>(null);
  const [draft, setDraft] = useState<ReadinessAssessment | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function accept(value: ImplementationReadinessResponse) {
    setSaved(value); setDraft(draftFrom(value)); setDirty(false);
  }
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setBusy(true); onBusyChange(true);
    api.implementationReadiness(sessionId).then(value => { if (!cancelled) accept(value); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) { setBusy(false); onBusyChange(false); } });
    return () => { cancelled = true; onBusyChange(false); };
  }, [sessionId]);
  function updateCheck(id: ReadinessCheckId, patch: Partial<ReadinessCheckInput>) {
    setDraft(value => value && { ...value, checks: value.checks.map(check => check.id === id ? { ...check, ...patch } : check) });
    setDirty(true); setMessage("");
  }
  async function save() {
    if (!saved || !draft) return;
    if (hasAnalysis && !window.confirm("Changing readiness clears the current analysis and approval. Archived decisions remain unchanged. Continue?")) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      accept(await api.saveImplementationReadiness(sessionId, saved.revision, saved.evidence_revision, draft));
      await onRefresh();
      setMessage("Readiness saved. Rerun analysis to include this report in the reviewed blueprint and archive.");
    } catch (e) { setError(e instanceof Error ? e.message : "Readiness save failed. Reload before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function reload() {
    if (dirty && !window.confirm("Discard unsaved readiness changes and reload?")) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try { accept(await api.implementationReadiness(sessionId)); await onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not reload readiness."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function download() {
    if (!saved) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const current = await api.implementationReadiness(sessionId);
      if (current.revision !== saved.revision || current.evidence_revision !== saved.evidence_revision) {
        setError("Readiness or evidence changed. Reload and inspect the report before exporting."); return;
      }
      const url = URL.createObjectURL(new Blob([readinessMarkdown(current.report, current.review)], { type: "text/markdown" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "AgentSpark_Readiness.md";
      anchor.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not export readiness."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="space-y-6">
    <header className="page-header"><h1>Implementation readiness</h1>
      <p className="mt-2">Identify delivery blockers and pilot prerequisites, separately from the agent-suitability score.</p></header>
    {!sessionId && <Card><p>Save intake before assessing implementation readiness.</p></Card>}
    {busy && <Spinner label="Loading or saving readiness..." />}
    {error && <p role="alert" className="notice text-rose-700">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {saved && draft && <>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={reload} disabled={busy}>Reload readiness</Button>
        <Button variant="ghost" onClick={download} disabled={busy || dirty}>Export readiness .md</Button>
      </div>
      <p className="notice">Ready requires source-supported reviewer-confirmed evidence and a client-confirmed owner.
        Owner confirmation is a recorded client attestation, not automatic verification.
        Changing intake or interview context resets ready checks to needs validation and client-confirmed owners to proposed.
        The report below reflects saved inputs only.</p>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy || !saved.permissions.write} className="space-y-5 min-w-0">
          {!saved.permissions.write && <p className="notice">Read-only: a contributor must update this assessment.</p>}
          {draft.checks.map(check => {
            const spec = saved.catalog.find(item => item.id === check.id)!;
            return <Card key={check.id} title={spec.title}>
              <p className="text-sm mb-4">{spec.question}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">Status — {spec.title}
                  <select className="input mt-1" value={check.status} onChange={event => {
                    const status = STATUSES.find(([key]) => key === event.target.value)?.[0];
                    if (status) updateCheck(check.id, { status });
                  }}>{STATUSES.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <label className="text-sm">Evidence links — {spec.title}
                  <select multiple className="input mt-1" value={check.evidence_ids} onChange={event =>
                    updateCheck(check.id, { evidence_ids: Array.from(event.target.selectedOptions, option => option.value) })}>
                    {saved.evidence_entries.map(entry => <option key={entry.id} value={entry.id}>
                      {entry.statement} [{entry.id}] {entry.confirmation ? "(reviewer-confirmed)" : "(unconfirmed)"}
                    </option>)}</select></label>
                {check.evidence_ids.length > 0 && <Button variant="ghost" className="sm:col-span-2"
                  onClick={() => updateCheck(check.id, { evidence_ids: [] })}>Clear evidence links — {spec.title}</Button>}
                <label className="text-sm sm:col-span-2">Finding — {spec.title}
                  <textarea className="input mt-1" value={check.finding} required={check.status !== "unknown"} maxLength={1000}
                    onChange={event => updateCheck(check.id, { finding: event.target.value })} /></label>
                <label className="text-sm">Owner — {spec.title}
                  <input className="input mt-1" value={check.owner} maxLength={200} required={check.owner_status !== "unassigned"}
                    onChange={event => updateCheck(check.id, { owner: event.target.value,
                      owner_status: event.target.value.trim() ? "proposed" : "unassigned", owner_confirmation_reference: "" })} /></label>
                <label className="text-sm">Owner assignment — {spec.title}
                  <select className="input mt-1" value={check.owner_status} onChange={event => {
                    const status = OWNERS.find(([key]) => key === event.target.value)?.[0];
                    if (status) updateCheck(check.id, { owner_status: status,
                      ...(status === "unassigned" ? { owner: "" } : {}),
                      ...(status !== "client_confirmed" ? { owner_confirmation_reference: "" } : {}) });
                  }}>{OWNERS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                {check.owner_status === "client_confirmed" && <label className="text-sm sm:col-span-2">Owner confirmation reference — {spec.title}
                  <input className="input mt-1" value={check.owner_confirmation_reference} maxLength={500} required
                    onChange={event => updateCheck(check.id, { owner_confirmation_reference: event.target.value })} /></label>}
                <label className="text-sm">Next action — {spec.title}
                  <textarea className="input mt-1" value={check.next_action} placeholder={spec.question} maxLength={1000}
                    onChange={event => updateCheck(check.id, { next_action: event.target.value })} /></label>
                <label className="text-sm">Completion evidence — {spec.title}
                  <textarea className="input mt-1" value={check.completion_criteria} placeholder={spec.completion_criteria} maxLength={1000}
                    onChange={event => updateCheck(check.id, { completion_criteria: event.target.value })} /></label>
              </div>
            </Card>;
          })}
          <Card title="Pilot definition">
            <div className="space-y-4">{PILOT.map(({ key, label }) => <label className="block text-sm" key={key}>{label}
              <textarea className="input mt-1" value={draft.pilot[key]} maxLength={1000} onChange={event => {
                setDraft({ ...draft, pilot: { ...draft.pilot, [key]: event.target.value } }); setDirty(true); setMessage("");
              }} /></label>)}</div>
          </Card>
          <Button type="submit" disabled={!dirty}>Save readiness assessment</Button>
          {dirty && <p className="text-sm text-amber-800">Unsaved changes. Save before exporting or leaving this page.</p>}
        </fieldset>
      </form>
      <ReadinessSummary report={saved.report} />
      <Card title="Current advisory recommendation review">
        <p className="text-sm">Analysis: {saved.review.analysis_id || "Not yet generated"} / {saved.review.status}</p>
        {saved.review.human_review ? <p className="text-sm mt-2 break-words">
          {saved.review.human_review.decision} by {saved.review.human_review.reviewer} at {saved.review.human_review.reviewed_at}
          {" / "}{saved.review.human_review.note}
        </p> : <p className="text-sm mt-2">No human review recorded. Readiness does not authorize deployment or business actions.</p>}
      </Card>
    </>}
  </div>;
}

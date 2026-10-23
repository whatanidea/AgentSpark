import { useEffect, useState } from "react";
import { api, uid, type EvidenceInput, type EvidenceEntry, type EvidenceReport, type EvidenceRegisterResponse } from "../api";
import { Button, Card, Spinner } from "./ui";

const KINDS: Record<EvidenceInput["kind"], string> = {
  client_fact: "Client-stated fact", supported_finding: "Evidence-supported finding",
  assumption: "Assumption", open_question: "Open question",
};
const FACTS = ["workflow_name", "summary", "steps", "departments", "decision_points", "systems",
  "exceptions_per_week", "volume_per_day", "compliance_sensitivity", "data_availability",
  "rule_stability", "human_judgment", "unstructured_content", "error_cost"];
const input = (entry: EvidenceInput): EvidenceInput => ({
  id: entry.id, kind: entry.kind, statement: entry.statement, source_reference: entry.source_reference,
  reporting_period: entry.reporting_period, related_facts: entry.related_facts,
});
const empty = (): EvidenceInput => ({
  id: uid(), kind: "client_fact", statement: "", source_reference: "", reporting_period: "", related_facts: [],
});
const date = (value: string) => new Date(value).toLocaleString();

function EntryDetails({ entry }: { entry: EvidenceEntry }) {
  return <div className="space-y-2 text-sm break-words">
    <p className="font-semibold">{KINDS[entry.kind]} <span className="font-mono text-xs">[{entry.id}]</span></p>
    <p className="whitespace-pre-wrap">{entry.statement}</p>
    <p>Source reference: {entry.source_reference || "Not supplied"}</p>
    <p>Reporting period: {entry.reporting_period || "Not supplied"}</p>
    <p>User-linked diagnostic inputs: {entry.related_facts.join(", ") || "None"}</p>
    {entry.confirmation ? <div className="rounded-lg bg-emerald-50 p-3">
      <p>Reviewer-confirmed by <span className="font-mono break-all">{entry.confirmation.confirmed_by}</span> at {date(entry.confirmation.confirmed_at)}</p>
      <p className="whitespace-pre-wrap">Confirmation method: {entry.confirmation.method}</p>
    </div> : <p className="text-amber-800">Not independently confirmed. A source reference does not verify this claim.</p>}
    <details className="text-xs text-slate-500">
      <summary className="cursor-pointer">Entry provenance</summary>
      <p className="break-all">Created by {entry.created_by} at {date(entry.created_at)}</p>
      <p className="break-all">Updated by {entry.updated_by} at {date(entry.updated_at)}</p>
    </details>
  </div>;
}

export function EvidenceSummary({ report }: { report?: EvidenceReport | null }) {
  if (!report) return <Card title="Evidence-backed assessment">
    <p className="text-sm">This historical assessment has no evidence-register snapshot. Rerun the assessment to include one.</p>
  </Card>;
  return <Card title="Evidence-backed assessment">
    <p className="text-sm text-slate-600">{report.limitations}</p>
    <p className="text-sm mt-3">Register version: {report.revision} / {report.entries.length} entries.</p>
    {!report.entries.length && <p className="notice mt-3">No supporting entries supplied. Diagnostic statements and calculated outputs are not independently verified.</p>}
    <div className="space-y-4 mt-4">{report.entries.map(entry =>
      <section id={`evidence-${entry.id}`} key={entry.id} className="border rounded-xl p-4"><EntryDetails entry={entry} /></section>)}</div>
    <h3 className="font-semibold mt-5">Recommendation basis</h3>
    <p className="text-sm mt-2">{report.recommendation_basis.basis}</p>
    {report.recommendation_basis.classification && <p className="text-sm mt-2">
      Calculated readiness: {report.recommendation_basis.agent_score}/100 ({report.recommendation_basis.classification}).
      {" "}Design: {report.recommendation_basis.recommended_pattern}.
    </p>}
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-teal-700">Inspect findings and user-linked evidence</summary>
      <ul className="space-y-3 mt-3 text-sm">{report.findings.map(finding => <li key={finding.fact}>
        <strong>{finding.fact}</strong>: {JSON.stringify(finding.value)} / {finding.provenance.status} / {finding.provenance.source}
        <p>Linked entries: {finding.evidence_ids.length ? finding.evidence_ids.map(id =>
          <a key={id} className="text-teal-700 underline mr-2" href={`#evidence-${id}`}>[{id}]</a>) : "None"}</p>
        {finding.provenance.quote && <blockquote className="border-l-2 pl-3 mt-1">{finding.provenance.quote}</blockquote>}
      </li>)}</ul>
    </details>
    <h3 className="font-semibold mt-5">Outstanding validation checklist</h3>
    {report.validation_checklist.length ? <ul className="list-disc pl-5 text-sm space-y-3 mt-3">
      {report.validation_checklist.map(item => <li key={item.evidence_id}>
        <a className="text-teal-700 underline" href={`#evidence-${item.evidence_id}`}>[{item.evidence_id}]</a>
        {" "}{item.statement}<p className="text-slate-600">{item.action}</p>
      </li>)}
    </ul> : <p className="text-sm mt-2">No entry-specific checks outstanding. This is not a readiness or compliance certification.</p>}
  </Card>;
}

export function evidenceMarkdown(report?: EvidenceReport | null): string {
  return `## Evidence register, findings and outstanding validation\n${report?.limitations || "No evidence-register snapshot in this historical assessment."}\n\n\`\`\`json\n${JSON.stringify(report ?? null, null, 2)}\n\`\`\`\n`;
}

export default function EvidenceRegister({ sessionId, hasAnalysis, onRefresh, onBusyChange }: {
  sessionId: string; hasAnalysis: boolean; onRefresh: () => Promise<void>; onBusyChange: (value: boolean) => void;
}) {
  const [register, setRegister] = useState<EvidenceRegisterResponse | null>(null);
  const [draft, setDraft] = useState<EvidenceInput>(empty);
  const [editing, setEditing] = useState(false);
  const [confirmationId, setConfirmationId] = useState("");
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setBusy(true); onBusyChange(true);
    api.evidence(sessionId).then(value => { if (!cancelled) setRegister(value); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) { setBusy(false); onBusyChange(false); } });
    return () => { cancelled = true; onBusyChange(false); };
  }, [sessionId]);

  function allowChange() {
    return !hasAnalysis || window.confirm("Changing evidence clears the current analysis and approval. Archived decisions remain unchanged. Continue?");
  }
  async function change(entries?: EvidenceInput[]) {
    if (!register || !allowChange()) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const value = entries
        ? await api.saveEvidence(sessionId, register.revision, entries)
        : await api.confirmEvidence(sessionId, confirmationId, register.revision, method.trim());
      setRegister(value); setDraft(empty()); setEditing(false); setConfirmationId(""); setMethod("");
      await onRefresh();
      setMessage("Evidence saved. Rerun analysis to include the current register.");
    } catch (e) { setError(e instanceof Error ? e.message : "Evidence save failed. Reload before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function reload() {
    if ((draft.statement || confirmationId) && !window.confirm("Discard the current entry form and reload evidence?")) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      setRegister(await api.evidence(sessionId)); setDraft(empty()); setEditing(false); setConfirmationId(""); setMethod("");
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reload evidence."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="space-y-6">
    <header className="page-header"><h1>Evidence &amp; assumptions</h1>
      <p className="mt-2">Record facts, sources, assumptions and questions before assessment or review.</p></header>
    <p className="notice">References are recorded as text; AgentSpark does not fetch or verify them. No file uploads in this phase.
      {" "}Do not enter credentials, personal data or confidential source contents. Links do not prove that a claim matches the interview.
      {" "}Update Diagnostic separately if a measured fact changes. Evidence uses the workflow's access, retention and deletion rules.</p>
    {!sessionId ? <Card><p>Save an intake first to create an evidence register.</p></Card> : <>
      <Button variant="ghost" disabled={busy} onClick={reload}>Reload evidence</Button>
      {busy && <Spinner label="Updating evidence..." />}
      {error && <p role="alert" className="notice text-rose-800">{error}</p>}
      {message && <p role="status" className="notice">{message}</p>}
      {register && <Card title={`Evidence register (${register.entries.length}/50)`}>
        {!register.entries.length && <p className="text-sm">No entries yet. Existing assessments remain usable without a register.</p>}
        <div className="space-y-5">{register.entries.map(entry => <section key={entry.id} className="border rounded-xl p-4">
          <EntryDetails entry={entry} />
          <div className="flex gap-2 flex-wrap mt-3">
            {register.permissions.write && <>
              <Button variant="ghost" disabled={busy} onClick={() => { setDraft(input(entry)); setEditing(true); setConfirmationId(""); }}>Edit entry</Button>
              <Button variant="danger" disabled={busy} onClick={() => {
                if (window.confirm("Remove this evidence entry? Archived decisions remain unchanged."))
                  void change(register.entries.filter(item => item.id !== entry.id).map(input));
              }}>Remove entry</Button>
            </>}
            {register.permissions.review && entry.kind === "supported_finding" && !entry.confirmation &&
              <Button disabled={busy} onClick={() => { setConfirmationId(entry.id); setMethod(""); }}>Confirm finding</Button>}
          </div>
        </section>)}</div>
      </Card>}
      {confirmationId && <Card title="Record reviewer confirmation">
        <p className="text-sm mb-3">Inspect the referenced source outside AgentSpark, then describe what you checked. Your authenticated identity and time will be recorded. This clears the current analysis and requires a rerun before approval.</p>
        <label className="block text-sm">Confirmation method
          <textarea aria-label="Confirmation method" className="form-control block mt-2" value={method} maxLength={1000} onChange={e => setMethod(e.target.value)} />
        </label>
        <div className="flex gap-3 mt-4"><Button disabled={busy || !method.trim()} onClick={() => void change()}>Save confirmation</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmationId("")}>Cancel confirmation</Button></div>
      </Card>}
      {register?.permissions.write && <Card title={editing ? "Edit evidence entry" : "Add evidence entry"}>
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault();
          void change([...register.entries.filter(entry => entry.id !== draft.id).map(input), draft]);
        }}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm">Entry type
              <select aria-label="Entry type" className="form-control block mt-2" value={draft.kind}
                onChange={e => setDraft({ ...draft, kind: e.target.value as EvidenceInput["kind"] })}>
                {Object.entries(KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
            <label className="block text-sm">Statement or question
              <textarea aria-label="Statement or question" className="form-control block mt-2" required maxLength={1000}
                value={draft.statement} onChange={e => setDraft({ ...draft, statement: e.target.value })} /></label>
            <label className="block text-sm">Source reference
              <input aria-label="Source reference" className="form-control block mt-2" maxLength={500}
                required={draft.kind === "supported_finding"} value={draft.source_reference}
                onChange={e => setDraft({ ...draft, source_reference: e.target.value })} /></label>
            <label className="block text-sm">Reporting period
              <input aria-label="Reporting period" className="form-control block mt-2" maxLength={100}
                value={draft.reporting_period} onChange={e => setDraft({ ...draft, reporting_period: e.target.value })} /></label>
            <label className="block text-sm">Related diagnostic inputs (optional, multiple)
              <select aria-label="Related diagnostic inputs" multiple className="form-control block mt-2" value={draft.related_facts}
                onChange={e => setDraft({ ...draft, related_facts: Array.from(e.target.selectedOptions, option => option.value) })}>
                {FACTS.map(fact => <option key={fact} value={fact}>{fact}</option>)}
              </select></label>
            <p className="text-xs text-slate-600">Editing content removes any previous confirmation. Changes clear current analysis and approval, not archived decisions.</p>
            <Button type="submit" disabled={!draft.statement.trim() || (!editing && register.entries.length >= 50)}>Save evidence entry</Button>
            {editing && <Button variant="ghost" onClick={() => { setDraft(empty()); setEditing(false); }}>Cancel edit</Button>}
          </fieldset>
        </form>
      </Card>}
    </>}
  </div>;
}

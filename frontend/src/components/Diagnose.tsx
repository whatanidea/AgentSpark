import { useEffect, useState } from "react";
import { api, type DemoScenario, type InterviewProgress, type InterviewRole } from "../api";
import { Card, Button } from "./ui";

type Msg = { role: "user" | "assistant"; content: string; blocked?: boolean };
type Props = {
  sessionId: string; context?: Record<string, string>; initialHistory?: Msg[]; demoMode: boolean;
  hasAnalysis: boolean; onRefresh: () => Promise<void>; onBusyChange: (busy: boolean) => void; goNext: () => void;
};
const SUGGESTION = "Fictional invoice example: We process 500 invoices/day across Finance and Legal. " +
  "There are 6 decision points, we use SAP, Email and DocuSign, 25 exceptions/week need manual review, " +
  "and compliance sensitivity is High.";

export default function Diagnose({ sessionId, context, initialHistory = [], demoMode, hasAnalysis,
  onRefresh, onBusyChange, goNext }: Props) {
  const [history, setHistory] = useState<Msg[]>(initialHistory);
  const [progress, setProgress] = useState<InterviewProgress | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showOtherRoles, setShowOtherRoles] = useState(false);

  function accept(value: InterviewProgress) {
    setProgress(value);
    setAnswers({ ...value.answers, ...Object.fromEntries(value.unconfirmed_fields.map(id => [id, "unconfirmed"])) });
    setDirty(false);
  }
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setBusy(true); onBusyChange(true);
    api.interview(sessionId).then(async value => {
      if (cancelled) return;
      const source = value.document;
      if (source?.available && value.permissions.write && !hasAnalysis && value.missing_fields.some(id =>
        !source.checks[id] && !source.excluded_fields.includes(id) && !value.unconfirmed_fields.includes(id))) {
        value = await api.lookupDocument(sessionId, value.version);
      }
      if (!cancelled) accept(value);
    })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load interview."); })
      .finally(() => { if (!cancelled) { setBusy(false); onBusyChange(false); } });
    return () => { cancelled = true; onBusyChange(false); };
  }, [sessionId, onBusyChange]);

  async function send(value = text, scenario?: DemoScenario) {
    const input = value.trim();
    if (!input || busy || dirty || !progress?.can_chat || (value === text && draftVersion !== progress.version)) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    let saved = false;
    try {
      const response = await api.chat(sessionId, input, progress.version, progress.question_ids, scenario);
      if (response.status === "blocked") {
        setHistory(current => [...current, { role: "assistant", content: response.response, blocked: true }]);
      } else {
        setHistory(current => [...current, { role: "user", content: response.message },
          { role: "assistant", content: response.response }]);
        accept(response.interview);
        setText("");
        setDraftVersion(null);
        saved = true;
        await onRefresh();
      }
    } catch (e) {
      setError(saved ? "Your answers were saved, but the workspace could not refresh. Reload the interview before continuing."
        : e instanceof Error ? e.message : "Interview request failed. Your reply is retained; reload before retrying.");
    }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function reload() {
    if (dirty && !window.confirm("Discard unsaved checklist changes and reload?")) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      accept(await api.interview(sessionId));
      const snapshot = await api.session(sessionId);
      setHistory(snapshot.chat_history);
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reload interview."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function save() {
    if (!progress || !dirty) return;
    if (hasAnalysis && !window.confirm("Changing interview answers clears the current analysis and approval. Archived decisions remain unchanged. Continue?")) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      accept(await api.saveInterview(sessionId, progress.version, answers));
      await onRefresh();
      setMessage("Answers saved. Readiness findings remain unverified drafts. Run analysis to refresh the report and PDF.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save answers. Reload before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function changeRole(role: InterviewRole) {
    if (!progress || busy || dirty) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      accept(await api.saveInterview(sessionId, progress.version, {}, role));
      setShowOtherRoles(false);
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change interview role. Reload before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function findAnswer(fieldId: string) {
    if (!progress || busy || dirty) return;
    if (hasAnalysis && !window.confirm("Applying document answers clears the current analysis and approval. Continue?")) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const next = await api.lookupDocument(sessionId, progress.version, [fieldId]);
      accept(next);
      const status = next.document?.checks[fieldId];
      setMessage(status === "found" ? "Answer found and applied from the uploaded document. Source references are shown below."
        : status === "conflict" ? "Conflicting answers were found. Review the source excerpts and resolve this in the checklist."
        : status === "needs_confirmation" ? "Related document context was found, but an answer could not be verified. Your input is needed."
        : "This information was not found in the document. Please provide the answer or mark it Unconfirmed.");
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Document lookup failed. No answers were saved."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function lookupAction(fieldId: string) {
    return progress?.document?.available && <Button variant="ghost"
      disabled={busy || dirty || !progress.permissions.write} onClick={() => void findAnswer(fieldId)}>
      Find answer in uploaded document
    </Button>;
  }
  const visibleFields = progress?.fields.filter(field =>
    (showOtherRoles || progress.role === "all" || field.assigned_role === progress.role)
    && (showAll || progress.missing_fields.includes(field.id))) || [];
  const groups = [...new Set(visibleFields.map(field => field.group))];
  return <div className="space-y-6">
    <header className="page-header">
      <div className="eyebrow mb-2">Step 02 / Discover the workflow</div>
      <h1>Diagnostic Interview</h1>
      <p className="mt-2">Up to 10 grouped interview rounds cover suitability, deployment constraints and draft readiness.
        Already captured answers are skipped. No evidence or readiness is verified automatically.</p>
    </header>
    {context && <Card title="Context from Intake">
      <p>{[context.business_domain, context.team_size, context.existing_systems].filter(Boolean).join(" / ")}</p>
      <p>Target cloud: {context.target_cloud} / Compliance: {context.compliance_requirements || "Not specified"}</p>
    </Card>}
    {!sessionId && <p className="notice">Save Enterprise Intake before starting the interview.</p>}
    {error && <p role="alert" className="notice text-rose-700">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {progress && <>
      <Card title="Your contribution">
        <label className="text-sm font-semibold">Interview role
          <select aria-label="Interview role" className="form-control mt-2" value={progress.role}
            disabled={busy || dirty || !progress.permissions.write}
            onChange={event => void changeRole(event.target.value as InterviewRole)}>
            {Object.entries(progress.roles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
        </label>
        <p className="text-sm mt-2">{progress.role_missing_fields.length} questions outstanding for this role.
          {" "}{progress.deferred_fields.length} unresolved questions are assigned to other roles.</p>
        <p className="text-xs text-zinc-500">Roles route questions, not access permissions. Mark facts Unconfirmed in the checklist
          when you cannot establish them; this never confirms readiness or invents a score.</p>
      </Card>
      <Card title={`Interview rounds: ${progress.rounds_used} / ${progress.max_rounds}`}>
        <progress aria-label="Interview rounds used" value={progress.rounds_used} max={progress.max_rounds} className="w-full" />
        <p>{progress.missing_facts.length} required workflow facts and {progress.missing_fields.length - progress.missing_facts.length} readiness/deployment/pilot answers outstanding.</p>
        {progress.limit_reached ? <p className="notice" role="status">
          The 10-round interview limit is reached. Automatic questions have stopped.
          Complete remaining answers in the editable checklist below; unknowns will not be invented.
        </p> : progress.can_chat ? <ol className="list-decimal pl-5 mt-3">
          {progress.questions.map(question => {
            const field = progress.fields.find(item => item.question === question);
            return <li key={question} className="mb-3">
              <p>{question}</p>
              {field && lookupAction(field.id)}
              {field && progress.document?.checks[field.id] === "not_found" &&
                <p className="text-xs text-zinc-500">Not found in the document. Your input is needed.</p>}
              {field && progress.document?.checks[field.id] === "needs_confirmation" &&
                <p className="text-xs text-amber-800">Related context could not establish a reliable answer. Please confirm it.</p>}
            </li>;
          })}
        </ol> : <p>Your role contribution is complete. Unconfirmed facts and other roles' questions remain unresolved.
          Review the checklist or switch roles before the full assessment.</p>}
        <div className="flex flex-wrap gap-3 mt-3">
          <Button variant="ghost" onClick={() => setShowChecklist(value => !value)} disabled={busy}>
            Review answers / complete checklist
          </Button>
          <Button variant="ghost" onClick={reload} disabled={busy}>Reload interview</Button>
        </div>
      </Card>
      {progress.document && (progress.document.available || progress.document.answers.length > 0) &&
        <Card title="Document-backed answers">
          <p className="text-sm">{progress.document.available
            ? `Checking ${progress.document.filename} before asking you. Redacted text remains private until assessment expiry or deletion.`
            : "This older upload has source excerpts only. Re-upload it in Enterprise Intake to enable question-level lookup."}</p>
          <p className="text-xs text-zinc-500 mt-2">Answers are document-derived claims, not verified operational evidence.
            Unknowns and conflicting statements still need human input.</p>
          <details className="mt-3">
            <summary>{progress.document.answers.length} captured answers with source references</summary>
            <div className="space-y-3 mt-3">
              {progress.document.answers.map(field => <article key={field.field_id} className="border rounded-lg p-3 break-words">
                <p className="font-semibold">{progress.fields.find(item => item.id === field.field_id)?.label || field.field_id}: {field.value}</p>
                <p className="text-xs text-zinc-500">{field.source.filename} / {field.location}
                  {field.capture === "document_lookup" ? " / Automatically captured from approved document" : " / Reviewed context"}</p>
                <blockquote className="text-sm mt-1 whitespace-pre-wrap">{field.quote}</blockquote>
                {field.supporting_quotes?.map((quote, index) =>
                  <blockquote key={index} className="text-sm mt-2 whitespace-pre-wrap">{quote.location}: {quote.quote}</blockquote>)}
              </article>)}
            </div>
          </details>
          {progress.document.conflicts.filter(field => progress.missing_fields.includes(field.field_id)).map((field, index) =>
            <blockquote key={index} className="notice notice-warning block mt-3 whitespace-pre-wrap break-words">
              {progress.fields.find(item => item.id === field.field_id)?.label}: {field.value} — {field.location}: {field.quote}
            </blockquote>)}
        </Card>}
      <Card title="Your conversation" description="Answer the grouped questions together. Every message is screened before extraction.">
        {text && draftVersion !== progress.version && <p role="status" className="notice">
          Your draft is retained. Review the current questions and edit the reply before sending it again.
        </p>}
        <div role="log" aria-live="polite" aria-label="Diagnostic conversation" className="space-y-5 max-h-[46vh] overflow-y-auto pr-1">
          {!history.some(item => item.role === "user") && <button className="text-brand-700 underline"
            onClick={() => void send(SUGGESTION, demoMode ? "invoice" : undefined)}
            disabled={busy || dirty || !progress.can_chat}>
            Use invoice sample (selects fictional fixture in demo) →
          </button>}
          {history.map((item, index) => <div key={index} className={`rounded p-4 text-sm whitespace-pre-wrap break-words ${
            item.blocked ? "bg-rose-50 text-rose-800" : item.role === "user" ? "bg-brand-50" : "bg-zinc-50"}`}>
            <p className="font-semibold">{item.role === "user" ? "You" : item.blocked ? "Security guardrail" : "AgentSpark"}</p>
            {item.content}
          </div>)}
          {busy && <p>Loading or saving interview...</p>}
        </div>
        <div className="flex gap-3 mt-5">
          <textarea aria-label="Describe your workflow" rows={3} maxLength={8000}
            className="form-control flex-1 min-w-0 resize-y" value={text}
            onChange={event => { setText(event.target.value); setDraftVersion(progress.version); }} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); void send();
              }
            }} placeholder="Answer the grouped questions..." disabled={busy || dirty || !progress.can_chat} />
          <Button onClick={() => void send()}
            disabled={busy || dirty || !progress.can_chat || !text.trim() || draftVersion !== progress.version}>Send</Button>
        </div>
      </Card>
      {(showChecklist || progress.limit_reached || !progress.can_chat) && <Card title="Editable interview checklist">
        <p className="notice">Only unanswered fields are shown by default. Counts must be whole numbers.
          Separate department/system names with commas; enter none for an explicitly empty list.
          Blank answers remain unresolved. Readiness text is saved as Needs validation, not verified evidence.
          Checklist edits take precedence over free-text extraction; correct those values here.
          Saving changed answers clears the current analysis and approval.</p>
        {demoMode && <p className="notice">Demo chat uses a fictional fixture; enter your own draft readiness in this checklist.</p>}
        <label className="flex gap-2 mt-3"><input type="checkbox" checked={showAll}
          onChange={event => setShowAll(event.target.checked)} />Show captured answers too</label>
        <label className="flex gap-2 mt-3"><input type="checkbox" checked={showOtherRoles}
          onChange={event => setShowOtherRoles(event.target.checked)} />Show questions assigned to other roles</label>
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy || !progress.permissions.write} className="space-y-4 mt-4">
            {groups.map(group => <details key={group} open>
              <summary className="font-semibold">{group}</summary>
              <div className="grid gap-4 md:grid-cols-2 mt-3">
                {visibleFields.filter(field => field.group === group).map(field => <div key={field.id} className="text-sm"><label>
                  <span className="font-semibold">{field.label}</span>
                  <span className="block text-zinc-500">{field.question}</span>
                  {field.kind === "select" ? <select className="form-control mt-1" value={answers[field.id] || ""}
                    onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.value })); setDirty(true); }}>
                    <option value="">Not supplied</option>
                    <option value="unconfirmed">Unconfirmed</option>
                    {field.options.map(option => <option key={option}>{option}</option>)}
                  </select> : field.kind === "number" ?
                    <input className="form-control mt-1" type="number" min={0} step={1}
                      disabled={answers[field.id] === "unconfirmed"} value={answers[field.id] === "unconfirmed" ? "" : answers[field.id] || ""}
                      onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.value })); setDirty(true); }} /> :
                    <textarea className="form-control mt-1" maxLength={field.max_length} value={answers[field.id] || ""}
                      onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.value })); setDirty(true); }} />}
                </label>
                  {field.kind !== "select" && <label className="flex gap-2 mt-2">
                    <input type="checkbox" aria-label={`${field.label} unconfirmed`} checked={answers[field.id] === "unconfirmed"}
                      onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.checked ? "unconfirmed" : "" })); setDirty(true); }} />
                    Unconfirmed - ask the assigned owner to validate
                  </label>}
                  <p className="text-xs text-zinc-500 mt-1">Assigned to {progress.roles[field.assigned_role]}</p>
                  {progress.missing_fields.includes(field.id) && lookupAction(field.id)}
                </div>)}
              </div>
            </details>)}
            {!visibleFields.length && <p>No unanswered fields. Enable Show captured answers too to review or correct them.</p>}
            <Button type="submit" disabled={!dirty}>Save interview answers</Button>
            {dirty && <p className="text-amber-800">Unsaved changes. Save or reload before continuing the interview or analysis.</p>}
          </fieldset>
        </form>
      </Card>}
      <Button variant="ghost" onClick={goNext} disabled={busy || dirty || progress.missing_facts.length > 0}>
        Run Analysis →
      </Button>
      {progress.missing_facts.length > 0 && <p className="text-sm">Score, ROI and blueprint still require the missing workflow facts.
        Readiness gaps remain explicit and do not fabricate suitability inputs.</p>}
    </>}
  </div>;
}

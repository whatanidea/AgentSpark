import { useEffect, useState } from "react";
import { api, type DemoScenario, type InterviewProgress } from "../api";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showAll, setShowAll] = useState(false);

  function accept(value: InterviewProgress) {
    setProgress(value); setAnswers(value.answers); setDirty(false);
  }
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setBusy(true); onBusyChange(true);
    api.interview(sessionId).then(value => { if (!cancelled) accept(value); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load interview."); })
      .finally(() => { if (!cancelled) { setBusy(false); onBusyChange(false); } });
    return () => { cancelled = true; onBusyChange(false); };
  }, [sessionId, onBusyChange]);

  async function send(value = text, scenario?: DemoScenario) {
    const input = value.trim();
    if (!input || busy || dirty || !progress?.can_chat) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const response = await api.chat(sessionId, input, scenario);
      if (response.status === "blocked") {
        setHistory(current => [...current, { role: "assistant", content: response.response, blocked: true }]);
      } else {
        setHistory(current => [...current, { role: "user", content: response.message },
          { role: "assistant", content: response.response }]);
        accept(response.interview);
        setText("");
        await onRefresh();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Interview request failed. Reload before retrying."); }
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
  const visibleFields = progress?.fields.filter(field => showAll || progress.missing_fields.includes(field.id)) || [];
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
      <Card title={`Interview rounds: ${progress.rounds_used} / ${progress.max_rounds}`}>
        <progress aria-label="Interview rounds used" value={progress.rounds_used} max={progress.max_rounds} className="w-full" />
        <p>{progress.missing_facts.length} required workflow facts and {progress.missing_fields.length - progress.missing_facts.length} readiness/deployment/pilot answers outstanding.</p>
        {progress.limit_reached ? <p className="notice" role="status">
          The 10-round interview limit is reached. Automatic questions have stopped.
          Complete remaining answers in the editable checklist below; unknowns will not be invented.
        </p> : progress.can_chat ? <ol className="list-decimal pl-5 mt-3">
          {progress.questions.map(question => <li key={question}>{question}</li>)}
        </ol> : <p>Interview capture complete. Review the checklist, then run analysis.</p>}
        <div className="flex flex-wrap gap-3 mt-3">
          <Button variant="ghost" onClick={() => setShowChecklist(value => !value)} disabled={busy}>
            Review answers / complete checklist
          </Button>
          <Button variant="ghost" onClick={reload} disabled={busy}>Reload interview</Button>
        </div>
      </Card>
      <Card title="Your conversation" description="Answer the grouped questions together. Every message is screened before extraction.">
        <div role="log" aria-live="polite" aria-label="Diagnostic conversation" className="space-y-5 max-h-[46vh] overflow-y-auto pr-1">
          {!history.some(item => item.role === "user") && <button className="text-teal-700 underline"
            onClick={() => void send(SUGGESTION, demoMode ? "invoice" : undefined)}
            disabled={busy || dirty || !progress.can_chat}>
            Use invoice sample (selects fictional fixture in demo) →
          </button>}
          {history.map((item, index) => <div key={index} className={`rounded-xl p-4 text-sm whitespace-pre-wrap break-words ${
            item.blocked ? "bg-rose-50 text-rose-800" : item.role === "user" ? "bg-teal-50" : "bg-slate-50"}`}>
            <p className="font-semibold">{item.role === "user" ? "You" : item.blocked ? "Security guardrail" : "AgentSpark"}</p>
            {item.content}
          </div>)}
          {busy && <p>Loading or saving interview...</p>}
        </div>
        <div className="flex gap-3 mt-5">
          <input aria-label="Describe your workflow" maxLength={8000} className="form-control flex-1" value={text}
            onChange={event => setText(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) void send();
            }} placeholder="Answer the grouped questions..." disabled={busy || dirty || !progress.can_chat} />
          <Button onClick={() => void send()} disabled={busy || dirty || !progress.can_chat || !text.trim()}>Send</Button>
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
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy || !progress.permissions.write} className="space-y-4 mt-4">
            {groups.map(group => <details key={group} open>
              <summary className="font-semibold">{group}</summary>
              <div className="grid gap-4 md:grid-cols-2 mt-3">
                {visibleFields.filter(field => field.group === group).map(field => <label key={field.id} className="text-sm">
                  <span className="font-semibold">{field.label}</span>
                  <span className="block text-slate-500">{field.question}</span>
                  {field.kind === "select" ? <select className="form-control mt-1" value={answers[field.id] || ""}
                    onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.value })); setDirty(true); }}>
                    <option value="">Not supplied</option>
                    {field.options.map(option => <option key={option}>{option}</option>)}
                  </select> : field.kind === "number" ?
                    <input className="form-control mt-1" type="number" min={0} step={1} value={answers[field.id] || ""}
                      onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.value })); setDirty(true); }} /> :
                    <textarea className="form-control mt-1" maxLength={field.max_length} value={answers[field.id] || ""}
                      onChange={event => { setAnswers(current => ({ ...current, [field.id]: event.target.value })); setDirty(true); }} />}
                </label>)}
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

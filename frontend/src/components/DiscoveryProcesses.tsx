import { useEffect, useLayoutEffect, useState } from "react";
import { api, uid, type DiscoveryAlternative, type DiscoveryAlternativeKind, type DiscoveryBaseline,
  type DiscoveryProcess, type DiscoveryRecord, type DiscoverySourceReviewInput, type DiscoveryTaskAssignment } from "../api";
import { Button, Card } from "./ui";

const roles = { business_operator: "Business operator", process_owner: "Process owner", technical_owner: "Technical owner" } as const;
const alternatives: Record<DiscoveryAlternativeKind, string> = {
  unchanged: "Leave unchanged", process_improvement: "Process improvement",
  deterministic_automation: "Deterministic automation", ai_assistance: "AI assistance", hybrid: "Hybrid",
};
type Editor =
  | { kind: "process"; value: DiscoveryProcess }
  | { kind: "request"; value: DiscoveryTaskAssignment }
  | { kind: "contribution"; id: string; answers: Record<string, string>; evidence: DiscoveryBaseline[] }
  | { kind: "review"; value: DiscoverySourceReviewInput }
  | { kind: "alternatives"; id: string; value: DiscoveryAlternative[]; preferred: DiscoveryAlternativeKind | "" };
const blankProcess = (): DiscoveryProcess => ({
  id: uid(), title: "", process_owner: "", goal: "", scope: "", systems: "", volume: "", baseline_pain: "",
  steps: [{ id: uid(), title: "", work: "", systems: "" }],
});
const processFields = [
  ["title", "Process title", 200], ["process_owner", "Process owner", 200], ["goal", "Process goal", 1000],
  ["scope", "Bounded process scope", 1000], ["systems", "Process systems", 500], ["volume", "Process volume / period", 500],
  ["baseline_pain", "Baseline pain / effort / delay", 1000],
] as const;

export default function DiscoveryProcesses({ record, blocked, onChange, onBusyChange, onDirtyChange }: {
  record: DiscoveryRecord; blocked: boolean; onChange: (value: DiscoveryRecord) => void;
  onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [members, setMembers] = useState<{ identity_id: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const processes = record.engagement.processes || [];
  const tasks = record.tasks || [];
  const dirty = editor !== null;
  const busy = blocked || working;
  const readOnly = busy || !record.permissions.write;
  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);

  async function save(action: () => Promise<DiscoveryRecord>) {
    setWorking(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const result = await action();
      setEditor(null); onChange(result); setMessage("Process discovery saved. Facts are not automatically verified.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save process discovery. Your draft is retained.");
    } finally { setWorking(false); onBusyChange(false); }
  }
  async function loadMembers(more = false) {
    setWorking(true); onBusyChange(true); setError("");
    try {
      const page = await api.eligibleParticipants(record.id, more ? cursor || "" : "");
      setMembers(current => more ? [...current, ...page.items].filter((item, index, list) =>
        list.findIndex(other => item.identity_id === other.identity_id) === index) : page.items);
      setCursor(page.next_cursor);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load active team members."); }
    finally { setWorking(false); onBusyChange(false); }
  }
  function begin(value: Editor) { setError(""); setMessage(""); setEditor(value); }
  const activeTask = editor?.kind === "contribution" ? tasks.find(item => item.id === editor.id) : undefined;
  const requestProcess = editor?.kind === "request" ? processes.find(item => item.id === editor.value.process_id) : undefined;

  return <section aria-label="Process discovery" className="space-y-5 min-w-0 break-words">
    <Card title="Process cards" description="Bound the work before choosing technology. Scope and baselines are self-reported unless explicitly reviewed.">
      <p className="text-xs">Limits: 10 processes, 10 steps each, 50 requests and 50 reviews. Use unconfirmed for unknowns.
        Saved cards cannot be deleted; referenced steps cannot be removed. Requests cannot be reassigned.</p>
      {error && <p role="alert" className="notice text-rose-700">{error} Your draft remains available.</p>}
      {message && <p role="status" className="notice">{message}</p>}
      {processes.map(process => <article key={process.id} className="mt-3 border rounded-lg p-3">
        <h3 className="font-semibold">{process.title}</h3>
        <p>Owner: {process.process_owner}. Goal: {process.goal}</p><p>Scope: {process.scope}</p>
        <p>Systems: {process.systems}. Volume: {process.volume}</p><p>Baseline: {process.baseline_pain}</p>
        <ol>{process.steps.map(step => <li key={step.id}>{step.title}: {step.work} / {step.systems}</li>)}</ol>
        <Button variant="ghost" disabled={readOnly || dirty} onClick={() => begin({ kind: "process", value: structuredClone(process) })}>
          Edit process {process.title}
        </Button>
      </article>)}
      <Button disabled={readOnly || dirty || processes.length >= 10} onClick={() => begin({ kind: "process", value: blankProcess() })}>
        Add process card
      </Button>
      {editor?.kind === "process" && <form aria-label="Process card editor" className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault(); void save(() => api.saveDiscoveryProcess(record.id, record.version, editor.value));
      }}>
        <fieldset disabled={readOnly} className="grid md:grid-cols-2 gap-3 min-w-0">
          {processFields.map(([key, label, max]) => <label key={key}>{label}
            <textarea className="form-control" required maxLength={max} value={editor.value[key]} onChange={event =>
              setEditor({ ...editor, value: { ...editor.value, [key]: event.target.value } })} />
          </label>)}
          {editor.value.steps.map((step, index) => <fieldset key={step.id} className="space-y-2 min-w-0">
            <legend>Step {index + 1}</legend>
            {(["title", "work", "systems"] as const).map(key => <label key={key}>Step {index + 1} {key}
              <textarea className="form-control" required maxLength={key === "title" ? 200 : key === "systems" ? 500 : 1000}
                value={step[key]} onChange={event => setEditor({ ...editor, value: { ...editor.value,
                  steps: editor.value.steps.map(item => item.id === step.id ? { ...item, [key]: event.target.value } : item) } })} />
            </label>)}
          </fieldset>)}
        </fieldset>
        <Button variant="ghost" disabled={readOnly || editor.value.steps.length >= 10} onClick={() => setEditor({
          ...editor, value: { ...editor.value, steps: [...editor.value.steps, { id: uid(), title: "", work: "", systems: "" }] },
        })}>Add process step</Button>
        <Button type="submit" disabled={readOnly}>Save process card</Button>
      </form>}
    </Card>
    <Card title="Targeted contribution requests" description="Assigned active team members describe a specific step. Draft responses do not enter synthesis.">
      <Button disabled={readOnly || dirty || !record.participation.can_assign || !processes.length || tasks.length >= 50}
        onClick={() => begin({ kind: "request", value: {
          process_id: "", step_id: "", assignee: "", role: "business_operator", requested_information: "", due_on: "",
        } })}>Request step contribution</Button>
      {!record.participation.can_assign && <p>Requests require an organization/team workspace and contributor access.</p>}
      <ul className="space-y-3 mt-3">{tasks.map(task => {
        const process = processes.find(item => item.id === task.process_id);
        const step = process?.steps.find(item => item.id === task.step_id);
        return <li key={task.id} className="border rounded-lg p-3">
          <h3>{process?.title || "Unavailable process"} / {step?.title || "Unavailable step"}</h3>
          <p>{roles[task.role]} / {task.assignee} / Due {task.due_on} / {task.status.replace(/_/g, "-")}</p>
          <p>Requested information/evidence: {task.requested_information}</p>
          {task.assignee === record.participation.identity_id && <Button variant="ghost" disabled={busy || dirty}
            onClick={() => begin({ kind: "contribution", id: task.id, answers: { ...task.answers },
              evidence: structuredClone(task.evidence) })}>Respond to step request</Button>}
          <details><summary>Saved step contribution and evidence</summary>
            {Object.entries(task.answers).map(([key, answer]) => <p key={key}>{key}: {answer}</p>)}
            {task.evidence.map((item, index) => <p key={index}>{item.statement} / {item.basis} / {item.source_reference}</p>)}
          </details>
        </li>;
      })}</ul>
      {editor?.kind === "request" && <form aria-label="Contribution request editor" className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault(); void save(() => api.createDiscoveryTask(record.id, record.version, editor.value));
      }}>
        <fieldset disabled={readOnly} className="space-y-3 min-w-0">
          <label>Request process<select className="form-control" required value={editor.value.process_id} onChange={event =>
            setEditor({ ...editor, value: { ...editor.value, process_id: event.target.value, step_id: "" } })}>
            <option value="">Choose saved process</option>{processes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <label>Request step<select className="form-control" required value={editor.value.step_id} onChange={event =>
            setEditor({ ...editor, value: { ...editor.value, step_id: event.target.value } })}>
            <option value="">Choose process step</option>{requestProcess?.steps.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <Button variant="ghost" disabled={busy} onClick={() => void loadMembers()}>Load request assignees</Button>
          <label>Request assignee<select className="form-control" required value={editor.value.assignee} onChange={event =>
            setEditor({ ...editor, value: { ...editor.value, assignee: event.target.value } })}>
            <option value="">Choose active authenticated team member</option>{members.map(item =>
              <option key={item.identity_id} value={item.identity_id}>{item.identity_id}</option>)}
          </select></label>
          {cursor && <Button variant="ghost" disabled={busy} onClick={() => void loadMembers(true)}>More request assignees</Button>}
          <label>Requested step role<select className="form-control" value={editor.value.role} onChange={event => {
            const role = event.target.value;
            if (role === "business_operator" || role === "process_owner" || role === "technical_owner")
              setEditor({ ...editor, value: { ...editor.value, role } });
          }}>{Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Requested information / evidence<textarea className="form-control" required maxLength={1000}
            value={editor.value.requested_information} onChange={event => setEditor({ ...editor,
              value: { ...editor.value, requested_information: event.target.value } })} /></label>
          <label>Request due date<input className="form-control" type="date" required value={editor.value.due_on}
            onChange={event => setEditor({ ...editor, value: { ...editor.value, due_on: event.target.value } })} /></label>
        </fieldset>
        <Button type="submit" disabled={readOnly}>Save contribution request</Button>
      </form>}
      {editor?.kind === "contribution" && activeTask && <form aria-label="Step response editor" className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault(); void save(() => api.saveStepContribution(record.id, editor.id, record.version, editor.answers, editor.evidence, true));
      }}>
        <h3>Your {roles[activeTask.role]} step contribution</h3>
        <fieldset disabled={busy} className="space-y-3 min-w-0">
          {Object.entries(record.participation.step_questions?.[activeTask.role] || {}).map(([key, question]) => <label key={key}>{question}
            <textarea className="form-control" required maxLength={1000} value={editor.answers[key] || ""}
              onChange={event => setEditor({ ...editor, answers: { ...editor.answers, [key]: event.target.value } })} />
          </label>)}
          {editor.evidence.map((item, index) => <fieldset key={index} className="space-y-2 min-w-0">
            <legend>Baseline evidence {index + 1}</legend>
            <label>Baseline statement {index + 1}<textarea className="form-control" required maxLength={1000} value={item.statement}
              onChange={event => setEditor({ ...editor, evidence: editor.evidence.map((value, i) =>
                i === index ? { ...value, statement: event.target.value } : value) })} /></label>
            <label>Evidence source reference {index + 1}<input className="form-control" required maxLength={500} value={item.source_reference}
              onChange={event => setEditor({ ...editor, evidence: editor.evidence.map((value, i) =>
                i === index ? { ...value, source_reference: event.target.value } : value) })} /></label>
            <label>Evidence basis {index + 1}<select className="form-control" value={item.basis} onChange={event => {
              const basis = event.target.value;
              if (basis === "self_reported" || basis === "measured") setEditor({ ...editor,
                evidence: editor.evidence.map((value, i) => i === index ? { ...value, basis } : value) });
            }}><option value="self_reported">Self-reported estimate</option><option value="measured">Submitted measurement (not verified)</option></select></label>
          </fieldset>)}
        </fieldset>
        <Button variant="ghost" disabled={busy || editor.evidence.length >= 5} onClick={() => setEditor({
          ...editor, evidence: [...editor.evidence, { statement: "", source_reference: "", basis: "self_reported" }],
        })}>Add baseline evidence</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void save(() =>
          api.saveStepContribution(record.id, editor.id, record.version, editor.answers, editor.evidence, false))}>Save step response draft</Button>
        <Button type="submit" disabled={busy || !record.participation.step_questions}>Submit step contribution</Button>
      </form>}
    </Card>
    <Card title="Source-linked baseline review" description="Measurements are submitted claims, not automatically verified. Only workspace reviewers can check facts or resolve disagreements.">
      <details><summary>Current process sources</summary>
        {(record.sources || []).map(source => <article key={source.id} className="mt-3">
          <strong>{source.id}</strong><p>{source.label}</p><p className="whitespace-pre-wrap">{source.statement}</p>
          <p>Reference: {source.source_reference || "Stakeholder note"}</p>
          <p>Basis: {source.basis || "self_reported"} / Review: {source.review_status || "not_reviewed"}</p>
          {source.review_rationale && <p>Reviewer rationale: {source.review_rationale}</p>}
        </article>)}
      </details>
      <Button disabled={busy || dirty || !record.permissions.review || !(record.sources || []).length}
        onClick={() => begin({ kind: "review", value: { source_ids: [], status: "clarification_needed", rationale: "" } })}>
        Review sources or resolve disagreement
      </Button>
      {!record.permissions.review && <p>Reviewer access is required. Team engagement creators cannot review their own engagement.</p>}
      {(record.source_reviews || []).map(review => <p key={review.id} className="text-xs mt-2">
        {review.status.replace(/_/g, "-")}: {review.rationale} / {review.reviewed_by} / {review.source_ids.join(", ")}
      </p>)}
      {editor?.kind === "review" && <form aria-label="Source review editor" className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault(); void save(() => api.reviewDiscoverySources(record.id, record.version, editor.value));
      }}>
        <fieldset disabled={busy || !record.permissions.review} className="space-y-3 min-w-0">
          <legend>Select up to 20 current sources (two or more for disagreement)</legend>
          {(record.sources || []).map(source => <label key={source.id} className="block">
            <input type="checkbox" checked={editor.value.source_ids.includes(source.id)}
              disabled={!editor.value.source_ids.includes(source.id) && editor.value.source_ids.length >= 20}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, source_ids: event.target.checked ?
                [...editor.value.source_ids, source.id] : editor.value.source_ids.filter(id => id !== source.id) } })} />
            {source.id} / {source.label}
          </label>)}
          <label>Source review outcome<select className="form-control" value={editor.value.status} onChange={event => {
            const status = event.target.value;
            if (status === "clarification_needed" || status === "disagreement" || status === "resolved" || status === "reviewer_checked")
              setEditor({ ...editor, value: { ...editor.value, status } });
          }}><option value="clarification_needed">Clarification needed</option><option value="disagreement">Disagreement</option>
            <option value="resolved">Resolved with explicit rationale (not verification)</option>
            <option value="reviewer_checked">Reviewer checked against cited source (human judgment)</option>
          </select></label>
          <label>Source review rationale<textarea className="form-control" required maxLength={1000} value={editor.value.rationale}
            onChange={event => setEditor({ ...editor, value: { ...editor.value, rationale: event.target.value } })} /></label>
        </fieldset>
        <Button type="submit" disabled={busy || !record.permissions.review || !editor.value.source_ids.length}>Save source review</Button>
      </form>}
    </Card>
    <Card title="Compare delivery alternatives" description="Write a rationale for every option. No AI default, automated preference or guaranteed savings.">
      {record.engagement.opportunities.map(opportunity => <article key={opportunity.id} className="mt-3">
        <h3>{opportunity.title}</h3>
        <p>Preferred: {opportunity.preferred_alternative ? alternatives[opportunity.preferred_alternative] : "Not chosen"}</p>
        {(opportunity.alternatives || []).map(item => <p key={item.kind}>{alternatives[item.kind]}: {item.rationale}</p>)}
        <Button variant="ghost" disabled={readOnly || dirty} onClick={() => begin({ kind: "alternatives", id: opportunity.id,
          value: (Object.keys(alternatives) as DiscoveryAlternativeKind[]).map(kind => ({
            kind, rationale: opportunity.alternatives?.find(item => item.kind === kind)?.rationale || "",
          })), preferred: opportunity.preferred_alternative || "" })}>Compare alternatives for {opportunity.title}</Button>
      </article>)}
      {!record.engagement.opportunities.length && <p>Add an opportunity for review to compare its alternatives.</p>}
      {editor?.kind === "alternatives" && <form aria-label="Alternatives comparison editor" className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault();
        if (editor.preferred) void save(() => api.compareDiscoveryAlternatives(record.id, editor.id, record.version,
          editor.value, editor.preferred as DiscoveryAlternativeKind));
      }}>
        <fieldset disabled={readOnly} className="space-y-3 min-w-0">
          {editor.value.map(item => <label key={item.kind}>{alternatives[item.kind]} rationale
            <textarea className="form-control" required maxLength={1000} value={item.rationale} onChange={event => setEditor({
              ...editor, value: editor.value.map(value => value.kind === item.kind ? { ...value, rationale: event.target.value } : value),
            })} /></label>)}
          <label>Preferred delivery alternative<select className="form-control" required value={editor.preferred} onChange={event => {
            const preferred = event.target.value;
            if (preferred === "" || Object.prototype.hasOwnProperty.call(alternatives, preferred))
              setEditor({ ...editor, preferred: preferred as DiscoveryAlternativeKind | "" });
          }}><option value="">Choose explicitly after comparing</option>{Object.entries(alternatives).map(([key, label]) =>
            <option key={key} value={key}>{label}</option>)}</select></label>
        </fieldset>
        <Button type="submit" disabled={readOnly || !editor.preferred}>Save alternatives comparison</Button>
      </form>}
    </Card>
    {dirty && <div role="status" className="notice">
      <p>Unsaved process discovery editor. Save or explicitly discard before other discovery actions.</p>
      <Button variant="ghost" disabled={busy} onClick={() => {
        if (window.confirm("Discard this unsaved process discovery draft?")) setEditor(null);
      }}>Discard process discovery draft</Button>
    </div>}
  </section>;
}

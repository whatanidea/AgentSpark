import { useEffect, useState } from "react";
import { api, uid, type DiscoveryEngagement, type DiscoveryRecord, type HomeItem } from "../api";
import { Button, Card } from "./ui";
import DiscoveryWorkflow from "./DiscoveryWorkflow";

const empty = (): DiscoveryEngagement => ({
  title: "", objective: "", business_units: "", sponsor: "", engagement_owner: "",
  required_topics: "", excluded_topics: "", starts_on: "", ends_on: "", status: "planned",
  contributions: [], opportunities: [], assessment_ids: [],
});
const textFields = [
  ["title", "Engagement title", 200], ["objective", "Business objective", 2000],
  ["business_units", "Business units in scope", 1000], ["sponsor", "Sponsor", 200],
  ["engagement_owner", "Engagement owner", 200], ["required_topics", "Required topics", 2000],
  ["excluded_topics", "Excluded topics", 2000],
] as const;
const roles = { business_operator: "Business operator", process_owner: "Process owner", technical_owner: "Technical owner" } as const;

export default function Discovery({ canCreate, onOpen, onBusyChange, onManageAccess, onUnsavedChange }: {
  canCreate: boolean; onOpen: (session: string) => Promise<void>; onBusyChange: (busy: boolean) => void;
  onManageAccess: () => void; onUnsavedChange: (dirty: boolean) => void;
}) {
  const [items, setItems] = useState<HomeItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<HomeItem[]>([]);
  const [assessmentCursor, setAssessmentCursor] = useState<string | null>(null);
  const [record, setRecord] = useState<DiscoveryRecord | null>(null);
  const [draft, setDraft] = useState<DiscoveryEngagement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const formDirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(record?.engagement || empty());
  const dirty = formDirty || workflowDirty;
  const canWrite = record ? record.permissions.write : canCreate;

  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => { onUnsavedChange(dirty); return () => onUnsavedChange(false); }, [dirty, onUnsavedChange]);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    Promise.all([api.engagements(), api.home()]).then(([engagements, workflows]) => {
      if (alive) {
        setItems(engagements.items); setCursor(engagements.next_cursor);
        setAssessments(workflows.items); setAssessmentCursor(workflows.next_cursor);
      }
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load discovery."); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  function discard() { return !dirty || window.confirm("Discard unsaved discovery changes?"); }
  async function open(id: string) {
    if (!discard()) return;
    setBusy(true); setError(""); setMessage("");
    try { const result = await api.engagement(id); setRecord(result); setDraft(result.engagement); setDeleting(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open engagement."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft || !canWrite) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = record ? await api.saveEngagement(record.id, record.version, draft) : await api.createEngagement(draft);
      setRecord(result); setDraft(result.engagement);
      setMessage("Discovery saved. Notes and candidate opportunities remain unverified; linked assessments are unchanged.");
      const page = await api.engagements(); setItems(page.items); setCursor(page.next_cursor);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save discovery. Reload before retrying."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!record) return;
    setBusy(true); setError("");
    try {
      await api.deleteEngagement(record.id, record.version);
      setRecord(null); setDraft(null); setDeleting(false);
      const page = await api.engagements(); setItems(page.items); setCursor(page.next_cursor);
      setMessage("Engagement deleted. Linked assessments were not deleted.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete engagement. Reload before retrying."); }
    finally { setBusy(false); }
  }
  async function more(kind: "engagements" | "assessments") {
    setBusy(true); setError("");
    try {
      if (kind === "engagements" && cursor) {
        const page = await api.engagements(cursor); setItems(current => [...current, ...page.items]); setCursor(page.next_cursor);
      } else if (kind === "assessments" && assessmentCursor) {
        const page = await api.home("all", assessmentCursor); setAssessments(current => [...current, ...page.items]);
        setAssessmentCursor(page.next_cursor);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load more records."); }
    finally { setBusy(false); }
  }
  function update<K extends keyof DiscoveryEngagement>(key: K, value: DiscoveryEngagement[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current);
  }
  return <div className="space-y-6">
    <header className="page-header flex flex-wrap justify-between gap-4">
      <div><h1>Discovery engagements</h1><p className="mt-2">Start with a business objective, organize discovery notes,
        and record candidate opportunities before choosing a workflow to assess.</p></div>
      <Button disabled={busy || !canCreate} onClick={() => {
        if (discard()) { setRecord(null); setDraft(empty()); setDeleting(false); setError(""); setMessage(""); }
      }}>New discovery engagement</Button>
    </header>
    <p className="notice">Discovery notes are visible to readers of this workspace, not anonymous.
      New engagements retain data for 30 days with explicit renewal. Required/excluded topics record scope; they do not automatically modify linked interviews.</p>
    {error && <p role="alert" className="notice text-rose-700">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    <Card title="Saved engagements">
      {!items.length && !busy && <p>No discovery engagements in this workspace.</p>}
      <ul className="space-y-2">{items.map(item => <li key={item.session_id}>
        <Button variant="ghost" disabled={busy} onClick={() => void open(item.session_id)}>{item.title}</Button>
        <span className="text-xs ml-2">Expires {new Date(item.expires_at).toLocaleString()}</span>
      </li>)}</ul>
      {cursor && <Button variant="ghost" disabled={busy} onClick={() => void more("engagements")}>More engagements</Button>}
    </Card>
    {draft && <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-5">
      <fieldset disabled={workflowDirty} className="space-y-5 min-w-0">
      <Card title={record ? "Engagement brief" : "Create engagement"}>
        {record && <p className="text-sm mb-3">Saved progress: {record.progress.contributions} notes /
          {" "}{record.progress.opportunities} opportunities / {record.progress.assessments} available assessments.
          Expires {new Date(record.expires_at).toLocaleString()}.</p>}
        <fieldset disabled={busy || !canWrite} className="grid md:grid-cols-2 gap-4">
          {textFields.map(([key, label, max]) => <label key={key} className="text-sm font-semibold">{label}
            <textarea className="form-control mt-1" value={draft[key]} maxLength={max}
              required={!["required_topics", "excluded_topics"].includes(key)}
              onChange={event => update(key, event.target.value)} />
          </label>)}
          <label>Status<select className="form-control" value={draft.status}
            onChange={event => { const value = event.target.value;
              if (value === "planned" || value === "active" || value === "completed") update("status", value); }}>
            <option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option>
          </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label>Discovery start<input type="date" className="form-control" value={draft.starts_on}
              onChange={event => update("starts_on", event.target.value)} /></label>
            <label>Discovery end<input type="date" className="form-control" min={draft.starts_on} value={draft.ends_on}
              onChange={event => update("ends_on", event.target.value)} /></label>
          </div>
        </fieldset>
      </Card>
      <Card title="Manually recorded contributions" description="Role-labelled notes, not participant attestations or verified evidence.">
        <fieldset disabled={busy || !canWrite} className="space-y-4">
          {draft.contributions.map((note, index) => <div key={note.id} className="border rounded p-3 space-y-2">
            <label>Contribution role<select className="form-control" value={note.role} onChange={event => {
              const role = event.target.value;
              if (role === "business_operator" || role === "process_owner" || role === "technical_owner")
                update("contributions", draft.contributions.map((item, position) => position === index ? { ...item, role } : item));
            }}>{Object.entries(roles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
            <label>Contribution statement<textarea className="form-control" required maxLength={2000} value={note.statement}
              onChange={event => update("contributions", draft.contributions.map((item, position) =>
                position === index ? { ...item, statement: event.target.value } : item))} /></label>
            <Button variant="ghost" onClick={() => update("contributions", draft.contributions.filter(item => item.id !== note.id))}>Remove note</Button>
          </div>)}
          <Button variant="ghost" disabled={draft.contributions.length >= 20} onClick={() =>
            update("contributions", [...draft.contributions, { id: uid(), role: "business_operator", statement: "" }])}>Add contribution note</Button>
        </fieldset>
      </Card>
      <Card title="Candidate opportunities" description="Human-recorded hypotheses; no automatic ranking or benefit claims.">
        <fieldset disabled={busy || !canWrite} className="space-y-4">
          {draft.opportunities.map((opportunity, index) => <div key={opportunity.id} className="border rounded p-3 space-y-2">
            <label>Opportunity title<input className="form-control" required maxLength={200} value={opportunity.title}
              onChange={event => update("opportunities", draft.opportunities.map((item, position) =>
                position === index ? { ...item, title: event.target.value } : item))} /></label>
            <label>Opportunity problem<textarea className="form-control" required maxLength={2000} value={opportunity.problem}
              onChange={event => update("opportunities", draft.opportunities.map((item, position) =>
                position === index ? { ...item, problem: event.target.value } : item))} /></label>
            <label>Opportunity status<select className="form-control" value={opportunity.status} onChange={event => {
              const status = event.target.value;
              if (status === "proposed" || status === "selected" || status === "parked")
                update("opportunities", draft.opportunities.map((item, position) => position === index ? { ...item, status } : item));
            }}><option value="proposed">Proposed</option><option value="selected">Selected for assessment</option><option value="parked">Parked</option></select></label>
            <Button variant="ghost" onClick={() => update("opportunities", draft.opportunities.filter(item => item.id !== opportunity.id))}>Remove opportunity</Button>
          </div>)}
          <Button variant="ghost" disabled={draft.opportunities.length >= 20} onClick={() =>
            update("opportunities", [...draft.opportunities, { id: uid(), title: "", problem: "", status: "proposed", source_ids: [], ratings: null }])}>Add candidate opportunity</Button>
        </fieldset>
      </Card>
      <Card title="Linked assessments" description="Links only; discovery notes are not copied into confirmed workflow facts.">
        <fieldset disabled={busy || !canWrite}>
          <label>Attach an existing assessment<select aria-label="Attach an existing assessment" className="form-control" value=""
            disabled={draft.assessment_ids.length >= 20} onChange={event => {
              if (event.target.value) update("assessment_ids", [...draft.assessment_ids, event.target.value]);
            }}><option value="">Choose a workflow</option>
            {assessments.filter((item, index, list) => !draft.assessment_ids.includes(item.session_id)
              && list.findIndex(other => other.session_id === item.session_id) === index)
              .map(item => <option key={item.session_id} value={item.session_id}>{item.title}</option>)}
          </select></label>
          {assessmentCursor && <Button variant="ghost" onClick={() => void more("assessments")}>More assessments</Button>}
          <ul className="mt-3 space-y-2">{draft.assessment_ids.map(id => <li key={id}>
            {record?.assessments.find(item => item.session_id === id)?.title || assessments.find(item => item.session_id === id)?.title || id}
            <Button variant="ghost" onClick={() => update("assessment_ids", draft.assessment_ids.filter(item => item !== id))}>Unlink</Button>
          </li>)}</ul>
        </fieldset>
        {record?.unavailable_assessments.length ? <p role="status" className="notice mt-3">
          {record.unavailable_assessments.length} linked assessments are expired, deleted or unavailable. Remove stale links as appropriate.</p> : null}
        {record?.assessments.map(item => <Button key={item.session_id} variant="ghost" disabled={busy || dirty}
          onClick={() => void onOpen(item.session_id).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not open assessment."))}>
          Open {item.title}
        </Button>)}
      </Card>
      </fieldset>
      {dirty && <p role="status" className="notice">Unsaved discovery changes.</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || workflowDirty || !canWrite || (!formDirty && !!record)}>Save discovery engagement</Button>
        {record && <Button variant="ghost" disabled={busy} onClick={() => void open(record.id)}>Reload engagement</Button>}
        {record?.permissions.delete && <Button variant="danger" disabled={busy} onClick={() => setDeleting(true)}>Delete engagement</Button>}
      </div>
    </form>}
    {record && <DiscoveryWorkflow key={record.id} record={record} blocked={busy || formDirty}
      onChange={result => { setRecord(result); setDraft(result.engagement); }} onBusyChange={setBusy}
      onDirtyChange={setWorkflowDirty} onOpen={onOpen} onManageAccess={onManageAccess} />}
    {deleting && record && <section role="alertdialog" aria-label="Confirm engagement deletion" className="notice">
      <p>Delete this engagement and its notes? Linked assessments will remain unchanged.</p>
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>Confirm engagement deletion</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>Cancel</Button>
    </section>}
  </div>;
}

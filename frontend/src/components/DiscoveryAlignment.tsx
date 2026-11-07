import { useEffect, useLayoutEffect, useState } from "react";
import { api, type DiscoveryRecord, type AlignmentNominationInput, type AlignmentFunction, type AlignmentOwnerRole,
  type AlignmentDecisionInput, type AlignmentPositionInput, type AlignmentOutcomeInput } from "../api";
import { Button, Card } from "./ui";
import AlignmentBrief, { alignmentFunctions, alignmentOwnerRoles, alignmentPositions } from "./AlignmentBrief";

type Editor =
  | { kind: "stakeholder"; value: AlignmentNominationInput & { function: AlignmentFunction } }
  | { kind: "owner"; value: AlignmentNominationInput & { role: AlignmentOwnerRole } }
  | { kind: "decision"; value: AlignmentDecisionInput }
  | { kind: "position"; id: string; value: AlignmentPositionInput }
  | { kind: "outcome"; id: string; value: AlignmentOutcomeInput };
const isFunction = (value: string): value is AlignmentFunction => Object.keys(alignmentFunctions).includes(value);
const isOwnerRole = (value: string): value is AlignmentOwnerRole => Object.keys(alignmentOwnerRoles).includes(value);
const isPosition = (value: string): value is AlignmentPositionInput["position"] => Object.keys(alignmentPositions).includes(value);

export default function DiscoveryAlignment({ record, blocked, onChange, onBusyChange, onDirtyChange }: {
  record: DiscoveryRecord; blocked: boolean; onChange: (value: DiscoveryRecord) => void;
  onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [members, setMembers] = useState<{ identity_id: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const snapshot = record.alignment;
  const busy = blocked || working;
  const writer = record.participation.can_assign;
  const mine = record.participation.identity_id;

  useLayoutEffect(() => { onDirtyChange(editor !== null); return () => onDirtyChange(false); }, [editor, onDirtyChange]);
  useEffect(() => { setEditor(null); }, [record.id, record.version]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (editor) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [editor]);

  async function run(action: () => Promise<DiscoveryRecord>) {
    setWorking(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const result = await action();
      setEditor(null); onChange(result); setMessage("Alignment saved. Human statements do not authorize implementation.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save alignment. Draft retained; reload after discarding if the record changed.");
    } finally { setWorking(false); onBusyChange(false); }
  }
  async function loadMembers(more = false) {
    setWorking(true); onBusyChange(true); setError("");
    try {
      const result = await api.eligibleParticipants(record.id, more ? cursor || "" : "");
      setMembers(previous => more ? [...previous, ...result.items].filter((item, index, values) =>
        values.findIndex(other => other.identity_id === item.identity_id) === index) : result.items);
      setCursor(result.next_cursor);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load eligible team members."); }
    finally { setWorking(false); onBusyChange(false); }
  }
  function nominate(kind: "stakeholder" | "owner" | "decision", replaces = "") {
    const person = { identity_id: "", label: "" };
    if (kind === "stakeholder") setEditor({ kind, value: { ...person, function: "business" } });
    else if (kind === "owner") setEditor({ kind, value: { ...person, role: "business_owner" } });
    else setEditor({ kind, value: { ...person, question: "", authority_basis: "", next_action: "", due_on: "",
      source_ids: [], replaces_id: replaces || null } });
    setError(""); setMessage("");
  }
  function save() {
    if (!editor) return;
    if (editor.kind === "stakeholder") return run(() => api.nominateAlignmentStakeholder(record.id, record.version, editor.value));
    if (editor.kind === "owner") return run(() => api.nominateAlignmentOwner(record.id, record.version, editor.value));
    if (editor.kind === "decision") return run(() => api.nominateAlignmentDecision(record.id, record.version, editor.value));
    if (editor.kind === "position") return run(() => api.recordAlignmentPosition(record.id, editor.id, record.version, editor.value));
    return run(() => api.recordAlignmentOutcome(record.id, editor.id, record.version, editor.value));
  }
  function nominationField(key: "identity_id" | "label", value: string) {
    setEditor(current => {
      if (current?.kind === "stakeholder") return { ...current, value: { ...current.value, [key]: value } };
      if (current?.kind === "owner") return { ...current, value: { ...current.value, [key]: value } };
      if (current?.kind === "decision") return { ...current, value: { ...current.value, [key]: value } };
      return current;
    });
  }
  function references(value: string[]) {
    return <fieldset className="space-y-2"><legend className="font-semibold text-sm">Referenced evidence</legend>
      <p className="text-xs">References are submitted claims. Use Evidence for independent source review or disagreement resolution.</p>
      {(record.sources || []).map(source => <label key={source.id} className="flex gap-2 text-sm">
        <input type="checkbox" checked={value.includes(source.id)} disabled={!value.includes(source.id) && value.length >= 20}
          onChange={event => {
            const source_ids = event.target.checked ? [...value, source.id] : value.filter(id => id !== source.id);
            if (editor?.kind === "position") setEditor({ ...editor, value: { ...editor.value, source_ids } });
            if (editor?.kind === "decision") setEditor({ ...editor, value: { ...editor.value, source_ids } });
          }} />{source.label}
      </label>)}
      {!record.sources?.length && <p className="text-sm">No saved source references yet.</p>}
    </fieldset>;
  }
  return <section id="discovery-alignment" tabIndex={-1} aria-label="Stakeholder alignment and decisions" className="scroll-mt-6">
    <Card title="Stakeholder alignment & decisions" description="Make outcomes, disagreements and responsibility explicit before choosing technology.">
      {error && <p role="alert" className="notice text-rose-700 mb-3">{error}</p>}
      {message && <p role="status" className="notice mb-3">{message}</p>}
      {!snapshot ? <>
        <p className="text-sm">Alignment has not been started. No consensus or accepted ownership is assumed.</p>
        <Button disabled={busy || !writer} onClick={() => void run(() => api.startAlignment(record.id, record.version))}>Start stakeholder alignment</Button>
        {!writer && <p className="text-sm mt-2">Use an organization/team workspace with contributor access to start and nominate members.</p>}
      </> : <>
        <AlignmentBrief snapshot={snapshot} />
        <div className="flex flex-wrap gap-2 my-4">
          <Button disabled={busy || !!editor || !writer || snapshot.record.stakeholders.length >= 20} onClick={() => nominate("stakeholder")}>Nominate stakeholder</Button>
          <Button disabled={busy || !!editor || !writer || snapshot.record.owners.length >= 20} onClick={() => nominate("owner")}>Nominate accountable owner</Button>
          <Button disabled={busy || !!editor || !writer || snapshot.record.decisions.length >= 20} onClick={() => nominate("decision")}>Record decision needed</Button>
        </div>
        <div className="space-y-2">
          {snapshot.record.stakeholders.filter(item => !item.withdrawn).map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{alignmentFunctions[item.function]}: {item.label || item.identity_id}</span>
            {item.identity_id === mine && !snapshot.inactive_assignments.includes(item.id) &&
              <Button variant="ghost" disabled={busy || !!editor || item.positions.length >= 10} onClick={() => setEditor({
                kind: "position", id: item.id, value: { position: "more_evidence", rationale: "", conditions: "", source_ids: [] },
              })}>Record {alignmentFunctions[item.function]} position</Button>}
            {writer && <Button variant="ghost" disabled={busy || !!editor} onClick={() => void run(() =>
              api.withdrawAlignmentNomination(record.id, "stakeholders", item.id, record.version))}>Withdraw {alignmentFunctions[item.function]} nomination</Button>}
          </div>)}
          {snapshot.record.owners.filter(item => item.identity_id === mine && !item.withdrawn &&
            !snapshot.inactive_assignments.includes(item.id)).map(item => <div key={item.id}>
              <Button variant="ghost" disabled={busy || !!editor || snapshot.accepted_owners.includes(item.id) || item.acceptances.length >= 10}
                onClick={() => void run(() => api.acceptAlignmentResponsibility(record.id, "owners", item.id, record.version))}>
                Accept {alignmentOwnerRoles[item.role]} responsibility
              </Button>
            </div>)}
          {snapshot.record.decisions.filter(item => !snapshot.superseded_decisions.includes(item.id)).map(item => <div key={item.id} className="border rounded p-3">
            <p className="text-sm font-semibold">{item.question}</p>
            {item.identity_id === mine && !snapshot.inactive_assignments.includes(item.id) && <>
              <Button variant="ghost" disabled={busy || !!editor || snapshot.accepted_decisions.includes(item.id) || item.acceptances.length >= 10}
                onClick={() => void run(() => api.acceptAlignmentResponsibility(record.id, "decisions", item.id, record.version))}>Accept decision responsibility</Button>
              <Button variant="ghost" disabled={busy || !!editor || !snapshot.accepted_decisions.includes(item.id) || item.outcomes.length >= 10}
                onClick={() => setEditor({ kind: "outcome", id: item.id, value: { outcome: "", rationale: "", next_action: "" } })}>Record owner decision</Button>
            </>}
            {writer && <Button variant="ghost" disabled={busy || !!editor || snapshot.record.decisions.length >= 20}
              onClick={() => nominate("decision", item.id)}>Replace or reassign decision</Button>}
          </div>)}
        </div>
      </>}
      {editor && <form className="mt-5 rounded border border-brand-300 p-4 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <p role="status" className="notice">Unsaved alignment draft. Save or discard before other discovery actions.</p>
        <fieldset disabled={busy} className="space-y-4 min-w-0">
          {(editor.kind === "stakeholder" || editor.kind === "owner" || editor.kind === "decision") && <>
            <Button variant="ghost" onClick={() => void loadMembers()}>Load alignment team members</Button>
            {cursor && <Button variant="ghost" onClick={() => void loadMembers(true)}>Load more alignment members</Button>}
            <label className="block">Assigned person<select required className="form-control" value={editor.value.identity_id}
              onChange={event => nominationField("identity_id", event.target.value)}>
              <option value="">Choose an eligible team member</option>
              {members.map(member => <option key={member.identity_id} value={member.identity_id}>{member.identity_id}</option>)}
            </select></label>
            <label className="block">Recorded person label<input className="form-control" maxLength={200} value={editor.value.label}
              onChange={event => nominationField("label", event.target.value)} /></label>
            <p className="text-xs">This label is a facilitator note; acceptance is bound to the actual signed-in identity.</p>
          </>}
          {editor.kind === "stakeholder" && <label className="block">Business perspective<select className="form-control"
            value={editor.value.function} onChange={event => { if (isFunction(event.target.value))
              setEditor({ ...editor, value: { ...editor.value, function: event.target.value } }); }}>
            {Object.entries(alignmentFunctions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>}
          {editor.kind === "owner" && <label className="block">Accountable responsibility<select className="form-control"
            value={editor.value.role} onChange={event => { if (isOwnerRole(event.target.value))
              setEditor({ ...editor, value: { ...editor.value, role: event.target.value } }); }}>
            {Object.entries(alignmentOwnerRoles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>}
          {editor.kind === "decision" && <>
            <label className="block">Decision needed<textarea required className="form-control" maxLength={1000} value={editor.value.question}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, question: event.target.value } })} /></label>
            <label className="block">Basis for decision responsibility<textarea required className="form-control" maxLength={1000}
              value={editor.value.authority_basis} onChange={event => setEditor({ ...editor, value: { ...editor.value, authority_basis: event.target.value } })} /></label>
            <p className="text-xs">Record the delegation or agreed discovery remit. This does not grant corporate or application approval rights.</p>
            <label className="block">Decision next action<textarea required className="form-control" maxLength={1000} value={editor.value.next_action}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, next_action: event.target.value } })} /></label>
            <label className="block">Optional decision due date<input type="date" className="form-control" value={editor.value.due_on}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, due_on: event.target.value } })} /></label>
            {references(editor.value.source_ids)}
          </>}
          {editor.kind === "position" && <>
            <label className="block">My stakeholder position<select className="form-control" value={editor.value.position}
              onChange={event => { if (isPosition(event.target.value)) setEditor({ ...editor, value: { ...editor.value, position: event.target.value } }); }}>
              {Object.entries(alignmentPositions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label className="block">Position rationale<textarea required className="form-control" maxLength={1000} value={editor.value.rationale}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, rationale: event.target.value } })} /></label>
            <label className="block">Conditions / objections to address<textarea required={editor.value.position === "conditional"}
              className="form-control" maxLength={1000} value={editor.value.conditions}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, conditions: event.target.value } })} /></label>
            {references(editor.value.source_ids)}
          </>}
          {editor.kind === "outcome" && <>
            <label className="block">Owner decision outcome<textarea required className="form-control" maxLength={1000} value={editor.value.outcome}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, outcome: event.target.value } })} /></label>
            <label className="block">Decision rationale<textarea required className="form-control" maxLength={1000} value={editor.value.rationale}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, rationale: event.target.value } })} /></label>
            <label className="block">Agreed next action<textarea required className="form-control" maxLength={1000} value={editor.value.next_action}
              onChange={event => setEditor({ ...editor, value: { ...editor.value, next_action: event.target.value } })} /></label>
          </>}
          <Button type="submit">Save alignment record</Button>
          <Button variant="ghost" onClick={() => setEditor(null)}>Discard alignment draft</Button>
        </fieldset>
      </form>}
    </Card>
  </section>;
}

import { useEffect, useLayoutEffect, useState } from "react";
import { api, type CloudProvider, type DiscoveryParticipant, type DiscoveryRatings, type DiscoveryRecord,
  type InferenceModel, type ModelCatalog } from "../api";
import { Button, Card } from "./ui";
import DiscoveryProcesses from "./DiscoveryProcesses";

const roles = { business_operator: "Business operator", process_owner: "Process owner", technical_owner: "Technical owner" } as const;
const ratingLabels = { value: "Business value", feasibility: "Feasibility", evidence_confidence: "Evidence confidence",
  risk: "Risk (1 low, 5 high)", effort: "Delivery effort (1 low, 5 high)" } as const;
const ratingKeys = ["value", "feasibility", "evidence_confidence", "risk", "effort"] as const;
const emptyRatings = (): DiscoveryRatings => ({
  value: null, feasibility: null, evidence_confidence: null, risk: null, effort: null, rationale: "",
});

export default function DiscoveryWorkflow({ record, blocked, onChange, onBusyChange, onOpen, onManageAccess, onDirtyChange }: {
  record: DiscoveryRecord; blocked: boolean; onChange: (record: DiscoveryRecord) => void;
  onBusyChange: (busy: boolean) => void; onOpen: (id: string) => Promise<void>; onManageAccess: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [models, setModels] = useState<ModelCatalog | null>(null);
  const [model, setModel] = useState<InferenceModel["id"] | "">("");
  const [members, setMembers] = useState<{ identity_id: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [identity, setIdentity] = useState("");
  const [role, setRole] = useState<DiscoveryParticipant["role"]>("business_operator");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [opportunityId, setOpportunityId] = useState("");
  const [ratings, setRatings] = useState(emptyRatings);
  const [cloud, setCloud] = useState<CloudProvider | "">("");
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [processDirty, setProcessDirty] = useState(false);
  const mine = record.participation.participants.find(item => item.identity_id === record.participation.identity_id);
  const selected = record.engagement.opportunities.find(item => item.id === opportunityId);
  const contributionDirty = JSON.stringify(answers) !== JSON.stringify(mine?.answers || {});
  const ratingsDirty = JSON.stringify(ratings) !== JSON.stringify(selected?.ratings || emptyRatings());
  const busy = blocked || working;
  useLayoutEffect(() => {
    onDirtyChange(contributionDirty || ratingsDirty || processDirty);
    return () => onDirtyChange(false);
  }, [contributionDirty, ratingsDirty, processDirty, onDirtyChange]);

  useEffect(() => {
    let alive = true;
    api.models().then(result => {
      if (alive) { setModels(result); setModel(result.items.find(item => item.available)?.id || ""); }
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Could not load approved models."); });
    return () => { alive = false; };
  }, [record.id]);
  useEffect(() => { setAnswers(mine?.answers || {}); }, [record.version, mine?.identity_id]);
  useEffect(() => {
    setRatings(selected?.ratings || emptyRatings()); setReviewed(false);
  }, [record.version, opportunityId]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (contributionDirty || ratingsDirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [contributionDirty, ratingsDirty]);

  async function run(action: () => Promise<void>) {
    setWorking(true); onBusyChange(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "Discovery operation failed. Reload before retrying."); }
    finally { setWorking(false); onBusyChange(false); }
  }
  async function loadMembers(more = false) {
    const page = await api.eligibleParticipants(record.id, more ? cursor || "" : "");
    setMembers(current => more ? [...current, ...page.items].filter((item, index, list) =>
      list.findIndex(other => other.identity_id === item.identity_id) === index) : page.items);
    setCursor(page.next_cursor);
  }
  async function renew() {
    if (!window.confirm("Start a new 30-day retention window for this engagement? Copied assessment snapshots keep their own retention.")) return;
    await run(async () => { onChange(await api.renewEngagement(record.id, record.version)); setMessage("Engagement explicitly renewed for 30 days."); });
  }
  async function saveContribution(submit: boolean) {
    await run(async () => {
      onChange(await api.saveContribution(record.id, record.version, answers, submit));
      setMessage(submit ? "Contribution submitted as an unverified stakeholder statement." : "Your contribution draft is saved.");
    });
  }
  async function handoff() {
    if (!model || !cloud || !selected || !reviewed) return;
    await run(async () => {
      const result = await api.handoffOpportunity(record.id, selected.id, record.version, model, cloud, reviewed);
      onChange(result.engagement); await onOpen(result.session_id);
    });
  }
  const dirty = contributionDirty || ratingsDirty || processDirty;
  return <section className="space-y-5 break-words min-w-0" aria-label="Discovery selling workflow">
    {error && <p role="alert" className="notice text-rose-700">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    <DiscoveryProcesses record={record} blocked={busy || contributionDirty || ratingsDirty}
      onChange={onChange} onBusyChange={onBusyChange} onDirtyChange={setProcessDirty} />
    <fieldset disabled={processDirty} className="space-y-5 min-w-0">
    <Card title="Engagement retention">
      <p>{record.retention.policy}</p>
      <p className="text-xs mt-2">Expires {new Date(record.expires_at).toLocaleString()}.
        Copies in assessments and decision archives follow their own retention.</p>
      <Button variant="ghost" disabled={busy || dirty || !record.permissions.write} onClick={() => void renew()}>Renew engagement for 30 days</Button>
    </Card>
    <Card title="Stakeholder participation" description="Assign signed-in team members. Each person submits their own role contribution; statements remain unverified and workspace-visible.">
      <Button variant="ghost" disabled={busy || dirty} onClick={onManageAccess}>Manage team invitations</Button>
      {!record.participation.can_assign && <p className="text-sm mt-2">Assignment requires contributor access in an organization/team workspace.</p>}
      {record.participation.can_assign && <form className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault();
        const previous = record.participation.participants.find(item => item.identity_id === identity);
        if (previous && previous.role !== role && !window.confirm("Changing this role clears the participant's existing answers. Continue?")) return;
        void run(async () => { onChange(await api.assignParticipant(record.id, identity, record.version, role)); setMessage("Participant role assigned."); });
      }}>
        <Button variant="ghost" disabled={busy || dirty} onClick={() => void run(() => loadMembers())}>Load eligible team members</Button>
        <label>Participant identity<select className="form-control" required value={identity} disabled={busy || dirty}
          onChange={event => setIdentity(event.target.value)}>
          <option value="">Choose an active team member</option>
          {members.map(item => <option key={item.identity_id}>{item.identity_id}</option>)}
        </select></label>
        {cursor && <Button variant="ghost" disabled={busy || dirty} onClick={() => void run(() => loadMembers(true))}>More eligible members</Button>}
        <label>Assigned interview role<select className="form-control" value={role} disabled={busy || dirty} onChange={event => {
          const value = event.target.value;
          if (value === "business_operator" || value === "process_owner" || value === "technical_owner") setRole(value);
        }}>{Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <Button type="submit" disabled={busy || dirty || !identity}>Assign participant</Button>
      </form>}
      <ul className="space-y-2 mt-3">{record.participation.participants.map(participant => <li key={participant.identity_id} className="break-words">
        {participant.identity_id} / {roles[participant.role]} / {participant.status === "invited" ? "Awaiting contribution" : participant.status}
        {record.participation.can_assign && <Button variant="ghost" disabled={busy || dirty} onClick={() => {
          if (window.confirm("Remove this participant and their current answers? Saved synthesis snapshots remain historical.")) {
            void run(async () => { onChange(await api.removeParticipant(record.id, participant.identity_id, record.version)); });
          }
        }}>Remove {participant.identity_id}</Button>}
        {participant.status === "submitted" && <details><summary>Submitted contribution</summary>
          {Object.entries(participant.answers).map(([key, answer]) => <p key={key} className="whitespace-pre-wrap">{key}: {answer}</p>)}
        </details>}
      </li>)}</ul>
      {mine && <form className="space-y-3 mt-4" onSubmit={event => { event.preventDefault(); void saveContribution(true); }}>
        <h3 className="font-semibold">Your {roles[mine.role]} contribution</h3>
        {Object.entries(record.participation.questions[mine.role]).map(([key, question]) => <label key={key} className="block text-sm">{question}
          <textarea aria-label={question} className="form-control mt-1" maxLength={1000} disabled={busy || ratingsDirty || !record.participation.can_submit} value={answers[key] || ""}
            onChange={event => setAnswers(current => ({ ...current, [key]: event.target.value }))} />
        </label>)}
        <Button variant="ghost" disabled={busy || !record.participation.can_submit || !contributionDirty} onClick={() => void saveContribution(false)}>Save contribution draft</Button>
        <Button type="submit" disabled={busy || !record.participation.can_submit || (!contributionDirty && mine.status === "submitted")}>Submit contribution</Button>
        {!record.participation.can_submit && <p className="notice">Membership changed. Ask a contributor to assign your role again before submitting.</p>}
        {contributionDirty && <p className="notice">Unsaved contribution. Save it before other discovery actions.</p>}
      </form>}
    </Card>
    <Card title="Discovery synthesis" description="Themes, candidate opportunities, disagreements and gaps cite saved source statements. Generated hypotheses need human review.">
      <label>Approved discovery model<select className="form-control" value={model} disabled={busy || dirty} onChange={event => {
        const item = models?.items.find(candidate => candidate.id === event.target.value && candidate.available);
        if (item) setModel(item.id);
      }}><option value="">Choose an enabled model</option>
        {models?.items.map(item => <option key={item.id} value={item.id} disabled={!item.available}
          title={!item.available && item.id === "foundry-claude-haiku" ? "Coming soon" : item.reason}>
          {item.label}{item.available ? "" : item.id === "foundry-claude-haiku" ? " - Coming soon" : " - unavailable"}
        </option>)}
      </select></label>
      {models?.items.filter(item => !item.available).map(item => item.id === "foundry-claude-haiku" ?
        <div key={item.id} role="group" aria-label={`${item.label} - Coming soon`} aria-disabled="true"
          aria-describedby="discovery-claude-coming-soon" tabIndex={0}
          className="group relative mt-3 inline-flex cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <span>{item.label} - Coming soon</span>
          <span id="discovery-claude-coming-soon" role="tooltip"
            className="invisible absolute bottom-full left-0 z-10 mb-2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg group-hover:visible group-focus:visible">
            Coming soon. Continue with Azure OpenAI.
          </span>
        </div> : <p key={item.id} className="text-xs mt-2">{item.label}: {item.reason}</p>)}
      <Button disabled={busy || dirty || !record.permissions.write || !model} onClick={() => {
        if (model) void run(async () => {
          onChange(await api.synthesizeDiscovery(record.id, record.version, model));
          setMessage("Source-linked hypotheses generated. Review them before prioritizing or handing off.");
        });
      }}>Generate discovery synthesis</Button>
      {record.synthesis && <>
        <p className="text-xs mt-2">{record.synthesis.rules_version} / {record.synthesis.model.provider} / {record.synthesis.model.model}</p>
        {!record.synthesis_current && <p role="status" className="notice">Sources changed. This snapshot is stale; regenerate before accepting candidates or handing them off.</p>}
        {(["themes", "conflicts"] as const).map(kind => <div key={kind} className="mt-3">
          <h3 className="font-semibold">{kind === "themes" ? "Recurring themes" : "Reported disagreements"}</h3>
          {record.synthesis?.content[kind].map((finding, index) => <p key={index}>{finding.title}: {finding.statement} [{finding.source_ids.join(", ")}]</p>)}
          {!record.synthesis?.content[kind].length && <p>None identified; this does not establish agreement.</p>}
        </div>)}
        <h3 className="font-semibold mt-3">Generated opportunity hypotheses</h3>
        {record.synthesis.content.opportunities.map(finding => <div key={finding.id || finding.title} className="mt-3">
          <p>{finding.title}: {finding.statement} [{finding.source_ids.join(", ")}]</p>
          <Button variant="ghost" disabled={busy || dirty || !record.permissions.write || !record.synthesis_current ||
            record.engagement.opportunities.some(item => item.id === finding.id)} onClick={() => {
            const id = finding.id;
            if (id) void run(async () => { onChange(await api.acceptDiscoveryCandidate(record.id, id, record.version)); });
          }}>Add candidate for review</Button>
        </div>)}
        <h3 className="font-semibold mt-3">Unresolved questions</h3>
        <ul>{record.synthesis.content.open_questions.map(question => <li key={question}>{question}</li>)}</ul>
        <details className="mt-3"><summary>Source evidence and provenance</summary>
          {record.synthesis.sources.map(source => <div key={source.id} className="mt-2 break-words">
            <strong>{source.id} / {source.label}</strong><p className="whitespace-pre-wrap">{source.statement}</p>
          </div>)}
        </details>
      </>}
    </Card>
    <Card title="Opportunity prioritization" description="Explicit 1-5 assessor ratings; unknown values never become zero or optimistic defaults.">
      <p className="text-sm">{record.prioritization.rules_version}: {Object.entries(record.prioritization.weights).map(([key, weight]) => `${key} ${weight}%`).join(" / ")}</p>
      <p className="text-xs mt-2">{record.prioritization.limitations}</p>
      <ol className="space-y-2 mt-3">{record.prioritization.items.map(item => <li key={item.opportunity_id}>
        <strong>{item.title}</strong>: {item.score === null ? "Not ranked" : `${item.score}/100`}
        {item.missing.length > 0 && <p className="text-xs">Outstanding: {item.missing.join(", ")}</p>}
        <p className="text-xs">Sources: {item.source_ids.join(", ") || "Manual hypothesis only; confidence above 1 needs source references."}</p>
      </li>)}</ol>
      <label className="block mt-3">Opportunity to review<select className="form-control" value={opportunityId}
        disabled={busy || dirty} onChange={event => setOpportunityId(event.target.value)}>
        <option value="">Choose an opportunity</option>
        {record.engagement.opportunities.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      {selected && <form className="space-y-3 mt-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          onChange(await api.saveDiscoveryRatings(record.id, selected.id, record.version, ratings));
          setMessage("Priority assumptions saved. Ratings do not verify the source statements.");
        });
      }}>
        <fieldset disabled={busy || contributionDirty || !record.permissions.write} className="grid md:grid-cols-2 gap-3 min-w-0">
          {ratingKeys.map(key => <label key={key}>{ratingLabels[key]}<select className="form-control" value={ratings[key] ?? ""}
            onChange={event => setRatings(current => ({ ...current, [key]: event.target.value ? Number(event.target.value) : null }))}>
            <option value="">Unconfirmed</option>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}
          </select></label>)}
          <label>Priority rating rationale<textarea aria-label="Priority rating rationale" className="form-control" value={ratings.rationale} maxLength={1000}
            onChange={event => setRatings(current => ({ ...current, rationale: event.target.value }))} /></label>
        </fieldset>
        <Button type="submit" disabled={busy || contributionDirty || !record.permissions.write || (!ratingsDirty &&
          !record.prioritization.items.find(item => item.opportunity_id === selected.id)?.missing.includes("current rating assumptions"))}>Save priority assumptions</Button>
        {ratingsDirty && <p className="notice">Unsaved priority assumptions.</p>}
      </form>}
    </Card>
    {selected && <Card title="Reviewed assessment handoff">
      <p>{selected.problem}</p><p className="text-xs mt-2">Sources and priority assumptions are copied as unverified provenance.
        Workflow facts, access, compliance and readiness still require separate confirmation.</p>
      {selected.status !== "selected" && <Button variant="ghost" disabled={busy || dirty || !record.permissions.write} onClick={() => void run(async () => {
        onChange(await api.saveEngagement(record.id, record.version, { ...record.engagement,
          opportunities: record.engagement.opportunities.map(item => item.id === selected.id ? { ...item, status: "selected" } : item) }));
      })}>Select opportunity for assessment</Button>}
      <label className="block mt-3">Assessment target cloud<select className="form-control" disabled={busy || dirty} value={cloud}
        onChange={event => { const value = event.target.value; if (value === "" || value === "azure" || value === "aws") setCloud(value); }}>
        <option value="">Choose an explicit target</option><option value="azure">Azure</option><option value="aws">AWS</option>
      </select></label>
      <label className="flex gap-2 mt-3"><input type="checkbox" checked={reviewed} disabled={busy || dirty}
        onChange={event => setReviewed(event.target.checked)} />I reviewed this hypothesis and its sources; this does not confirm facts or authorize execution.</label>
      <Button disabled={busy || dirty || !record.permissions.write || !reviewed || !cloud || !model || selected.status !== "selected" ||
        (selected.source_ids.length > 0 && !record.synthesis_current)}
        onClick={() => void handoff()}>Create or resume assessment handoff</Button>
      {record.handoffs.filter(item => item.origin.opportunity_id === selected.id).map(item => <div key={item.session_id} className="mt-3">
        <p>{item.status === "pending" ? "Pending handoff: reload and retry using the same target and model. No duplicate assessment is created."
          : "Completed handoff: provenance is frozen. A changed opportunity needs a new assessment opportunity."}</p>
        <p className="text-xs">Reserved target: {item.context.target_cloud} / {item.model.model}</p>
        <Button variant="ghost" disabled={busy || dirty} onClick={() => void run(() => onOpen(item.session_id))}>Open handed-off assessment</Button>
      </div>)}
    </Card>}
    </fieldset>
  </section>;
}

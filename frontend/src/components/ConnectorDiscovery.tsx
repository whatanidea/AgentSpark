import { useEffect, useLayoutEffect, useState } from "react";
import { discoveryBrief, type AdoDiscoveryBrief, type AdoIntegration } from "../azureDevOps";
import { Button, Card } from "./ui";

export const DISCOVERY_BRIEF_FIELDS = [
  ["title", "Engagement title", 200], ["objective", "Business objective", 2000],
  ["business_units", "Business units in scope", 1000], ["sponsor", "Sponsor", 200],
  ["engagement_owner", "Engagement owner", 200], ["required_topics", "Questions and required topics", 2000],
  ["excluded_topics", "Excluded topics", 2000], ["success_measures", "Success measures", 1000],
] as const;
const fields = DISCOVERY_BRIEF_FIELDS;
type Stage = "sources" | "brief" | "confirm";

export default function ConnectorDiscovery({ data, busy, onPrepare, onReview, onConfirm, onCancel, onConfigure, onDirtyChange }: {
  data: AdoIntegration; busy: boolean;
  onPrepare: (ids: number[]) => Promise<unknown>;
  onReview: (brief: AdoDiscoveryBrief) => Promise<boolean>;
  onConfirm: () => Promise<void>; onCancel: () => Promise<unknown>;
  onConfigure: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const preview = data.discovery_preview;
  const [stage, setStage] = useState<Stage>(preview ? "brief" : "sources");
  const [selected, setSelected] = useState<number[]>(preview?.item_ids || []);
  const [brief, setBrief] = useState<AdoDiscoveryBrief | null>(preview ? discoveryBrief(preview.engagement) : null);
  const [acknowledged, setAcknowledged] = useState(false);
  const briefDirty = !!preview && !!brief && JSON.stringify(brief) !== JSON.stringify(discoveryBrief(preview.engagement));
  const dirty = stage === "brief" ? briefDirty : stage === "sources" &&
    [...selected].sort().join() !== [...(preview?.item_ids || [])].sort().join();
  const blocked = busy || !data.permissions.write;

  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    setSelected(preview?.item_ids || []);
    setBrief(preview ? discoveryBrief(preview.engagement) : null);
    setAcknowledged(false);
    setStage(previous => preview ? previous === "sources" ? "brief" : previous : "sources");
  }, [preview?.id]);

  function backToSources() {
    if (briefDirty && !window.confirm("Discard unsaved discovery brief changes?")) return;
    if (preview) setBrief(discoveryBrief(preview.engagement));
    setStage("sources"); setAcknowledged(false);
  }

  return <section aria-label="Start discovery from connector" className="space-y-5">
    <ol aria-label="Discovery setup steps" className="flex flex-wrap gap-3 text-sm">
      {([["sources", "1. Select sources"], ["brief", "2. Review and edit"], ["confirm", "3. Start discovery"]] as const)
        .map(([id, label]) => <li key={id} aria-current={stage === id ? "step" : undefined}
          className={stage === id ? "font-semibold text-brand-700" : "text-zinc-500"}>{label}</li>)}
    </ol>
    {!data.connection ? <Card title="Choose a source first">
      <p>Ask an administrator to configure the local Azure DevOps simulator, then return here to select work items.</p>
      {data.permissions.manage && <Button className="mt-4" disabled={busy} onClick={onConfigure}>Configure simulator</Button>}
    </Card> : <>
      {stage === "sources" && <Card title="Select work items" description="Choose once. Continue imports these fictional items and prepares a brief; it does not create an engagement.">
        <p className="text-sm mb-4">Source: {data.projects.find(item => item.id === data.connection?.project)?.name}.
          Only the configured project and allowed item types are shown.</p>
        <fieldset disabled={blocked} className="space-y-3 min-w-0">
          {data.available_items.map(item => <label key={item.id} className="flex items-start gap-3 rounded border border-zinc-200 p-4 text-sm">
            <input type="checkbox" className="mt-1" checked={selected.includes(item.id)} onChange={event =>
              setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />
            <span className="min-w-0"><span className="block font-semibold">{item.id}: {item.title}</span>
              <span className="block mt-1">{item.item_type} / {item.state}</span>
              <span className="block mt-2">{item.description}</span></span>
          </label>)}
          <p>{selected.length} selected</p>
          <Button disabled={!selected.length} onClick={() => void onPrepare(selected)}>Continue to brief</Button>
          {preview && <Button variant="ghost" className="ml-3" onClick={() => {
            setSelected(preview.item_ids); setStage("brief");
          }}>Resume saved brief</Button>}
        </fieldset>
      </Card>}
      {stage === "brief" && preview && brief && <Card title="Review and edit your brief"
        description="Shape the investigation before creating it. Keep unknowns explicit; source evidence cannot be edited here.">
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          void onReview(brief).then(saved => { if (saved) { setStage("confirm"); setAcknowledged(false); } });
        }}>
          <fieldset disabled={blocked || !data.can_confirm_discovery} className="space-y-4 min-w-0">
            {fields.slice(0, 2).map(([key, label, max]) => <label key={key} className="block text-sm font-semibold">{label}
              <textarea className="form-control block mt-2 w-full" required maxLength={max} value={brief[key]}
                onChange={event => setBrief({ ...brief, [key]: event.target.value })} />
            </label>)}
            <details><summary className="cursor-pointer font-semibold">Scope, ownership and success measures</summary>
              <div className="space-y-4 mt-4">{fields.slice(2).map(([key, label, max]) => <label key={key} className="block text-sm">{label}
                <textarea className="form-control block mt-2 w-full"
                  required={["business_units", "sponsor", "engagement_owner"].includes(key)}
                  maxLength={max} value={brief[key]} onChange={event => setBrief({ ...brief, [key]: event.target.value })} />
              </label>)}</div>
            </details>
            <p className="text-sm">{preview.sources.length} selected source snapshots will be copied as synthetic, unverified evidence.
              No process steps, savings or AI opportunities are assumed.</p>
            <Button type="submit">Review before starting</Button>
          </fieldset>
        </form>
        <Button variant="ghost" className="mt-3" disabled={busy} onClick={backToSources}>Back to sources</Button>
        {briefDirty && <p className="text-sm mt-3">Unsaved discovery brief changes.</p>}
      </Card>}
      {stage === "confirm" && preview && <Card title="Start this discovery?" description="Review this saved brief, then explicitly authorize creation. No external work items will be created.">
        <dl className="space-y-3">{fields.map(([key, label]) => <div key={key}>
          <dt className="font-semibold">{label}</dt>
          <dd className="text-sm whitespace-pre-wrap break-words mt-1">{discoveryBrief(preview.engagement)[key] || "Not specified"}</dd>
        </div>)}</dl>
        <h3 className="font-semibold mt-5">Included sources</h3>
        <ul className="mt-2 space-y-2 text-sm">{preview.sources.map(source => <li key={source.id} className="break-words">{source.label}</li>)}</ul>
        <details className="mt-4 text-sm"><summary className="cursor-pointer">Technical evidence and provenance</summary>
          {preview.sources.map(source => <div key={source.id} className="mt-3">
            <p className="break-all">{source.source_reference}</p>
            <p className="whitespace-pre-wrap break-all">{source.statement}</p>
          </div>)}
        </details>
        <p className="text-xs mt-4">Review valid until {new Date(preview.expires_at).toLocaleString()}.
          Creation opens your next discovery action. The existing demo uses process-local discovery storage.</p>
        <label className="flex items-start gap-3 text-sm mt-4">
          <input type="checkbox" className="mt-1" disabled={blocked || !data.can_confirm_discovery} checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)} />
          I reviewed this brief and authorize starting discovery with synthetic, unverified evidence.
        </label>
        <Button className="mt-4" disabled={blocked || !data.can_confirm_discovery || !acknowledged}
          onClick={() => { setAcknowledged(false); void onConfirm(); }}>Start discovery</Button>
        <Button variant="ghost" className="mt-4 ml-3" disabled={busy}
          onClick={() => { setStage("brief"); setAcknowledged(false); }}>Edit brief</Button>
      </Card>}
      {preview && stage !== "sources" && <Button variant="ghost" disabled={blocked || !data.can_confirm_discovery}
        onClick={() => {
          if (!briefDirty || window.confirm("Discard unsaved discovery brief changes and the saved draft?")) void onCancel();
        }}>Discard discovery draft</Button>}
      {preview && !data.can_confirm_discovery && <p className="notice">Only the draft creator can edit, confirm or discard it.
        You may select sources to prepare your own draft if you have write permission.</p>}
    </>}
    {!data.permissions.write && <p className="notice">Read-only access: you can inspect sources but cannot prepare or start discovery.</p>}
  </section>;
}

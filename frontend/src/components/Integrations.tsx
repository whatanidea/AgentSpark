import { useEffect, useLayoutEffect, useState } from "react";
import { api, type HomePage } from "../api";
import type { AdoIntegration, AdoItemType, AdoProject } from "../azureDevOps";
import { Button, Card, Pill, Spinner } from "./ui";
import ConnectorDiscovery from "./ConnectorDiscovery";

const TYPES: AdoItemType[] = ["Bug", "User Story", "Task"];
const AREAS = [["discovery", "Start discovery"], ["delivery", "Delivery handoff"],
  ["settings", "Connection settings"], ["history", "History & details"]] as const;
type Area = typeof AREAS[number][0];

export default function Integrations({ assessmentId, onBusyChange, onUnsavedChange, onOpenDiscovery }: {
  assessmentId: string; onBusyChange: (busy: boolean) => void; onUnsavedChange: (dirty: boolean) => void;
  onOpenDiscovery: (id: string) => void;
}) {
  const [data, setData] = useState<AdoIntegration | null>(null);
  const [assessments, setAssessments] = useState<HomePage | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState(assessmentId);
  const [project, setProject] = useState<AdoProject>("operations");
  const [types, setTypes] = useState<AdoItemType[]>(TYPES);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [area, setArea] = useState<Area>("discovery");
  const [briefDirty, setBriefDirty] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const settingsDirty = !!data && (project !== data.connection?.project && (!!data.connection || project !== "operations")
    || [...types].sort().join() !== [...(data.connection?.item_types || TYPES)].sort().join());
  const dirty = settingsDirty || briefDirty;
  useLayoutEffect(() => {
    onUnsavedChange(dirty);
    return () => onUnsavedChange(false);
  }, [dirty, onUnsavedChange]);

  function apply(value: AdoIntegration) {
    setData(value); setProject(value.connection?.project || "operations");
    setTypes(value.connection?.item_types || TYPES); setSelectedItems([]); setAcknowledged(false);
  }

  useEffect(() => {
    let active = true;
    setBusy(true); onBusyChange(true); setError(""); setData(null);
    Promise.all([api.adoIntegration(), area === "delivery" ? api.home("approved") : Promise.resolve(null)]).then(([value, page]) => {
      if (active) { apply(value); setAssessments(page); }
    }).catch((failure: Error) => { if (active) setError(failure.message); })
      .finally(() => { if (active) { setBusy(false); onBusyChange(false); } });
    return () => { active = false; onBusyChange(false); };
  }, [revision, area, onBusyChange]);

  async function run(action: () => Promise<AdoIntegration>, success: string) {
    setBusy(true); onBusyChange(true); setError(""); setMessage(""); setAcknowledged(false);
    try { const next = await action(); apply(next); setMessage(success); return next; }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Integration operation failed. Refresh before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }

  async function moreAssessments() {
    if (!assessments?.next_cursor) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const next = await api.home("approved", assessments.next_cursor);
      setAssessments({ ...next, items: [...assessments.items, ...next.items] });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Assessment listing failed."); }
    finally { setBusy(false); onBusyChange(false); }
  }

  const assessmentItems = (assessments?.items || []).filter((item, index, items) =>
    items.findIndex(other => other.session_id === item.session_id) === index);

  function changeArea(next: Area) {
    if (next === area) return;
    if (dirty && !window.confirm("Discard unsaved integration changes?")) return;
    setMessage(""); setArea(next);
  }

  async function startDiscovery(previewId: string, digest: string) {
    const next = await run(() => api.confirmAdoDiscovery(previewId, digest), "Discovery created.");
    if (!next) return;
    const receipt = next.discovery_receipts.find(item => item.preview.id === previewId);
    if (!receipt || receipt.status !== "completed") {
      setError("Discovery creation is not complete. Open History & details to retry the recorded confirmation.");
      return;
    }
    onOpenDiscovery(receipt.engagement_id);
  }

  return <section aria-label="Workspace integrations" className="space-y-6">
    <header className="page-header">
      <div className="eyebrow mb-2">Workspace / Integrations</div>
      <h1>Azure DevOps integration</h1>
      <p className="mt-2">Choose source work, shape your brief and start a discovery you control.</p>
    </header>
    <p role="note" className="notice notice-warning">
      <span><strong>Local simulator only.</strong> No Microsoft account is connected, no credentials are accepted,
      and no external work items are read or created. Source links use the reserved .example domain and do not open a real service.
      Local demo users share one identity.</span>
    </p>
    {error && <div role="alert" className="notice"><p>{error}</p>
      <p className="text-sm mt-2">Refresh current data before retrying a changed or expired preview.</p>
    </div>}
    {message && <p role="status" className="notice">{message}</p>}
    <nav aria-label="Integration areas" className="flex flex-wrap gap-2">
      {AREAS.map(([id, label]) => <Button key={id} aria-pressed={area === id}
        disabled={busy} variant={area === id ? "primary" : "ghost"} onClick={() => changeArea(id)}>{label}</Button>)}
    </nav>
    <Button variant="ghost" disabled={busy} onClick={() => {
      if (!dirty || window.confirm("Discard unsaved integration changes?")) { setMessage(""); setRevision(value => value + 1); }
    }}>Refresh integration data</Button>
    {busy && <Spinner label="Loading integration data..." />}
    {data && <>
      {area === "discovery" && <ConnectorDiscovery data={data} busy={busy} onDirtyChange={setBriefDirty}
        onConfigure={() => changeArea("settings")}
        onPrepare={ids => run(() => api.prepareAdoDiscovery(data.version, ids), "Sources prepared. Review your brief.")}
        onReview={async brief => {
          const preview = data.discovery_preview;
          if (!preview) { setError("No saved draft. Select sources to prepare a new brief."); return false; }
          return !!await run(() => api.reviseAdoDiscovery(data.version, preview.id, brief), "Brief saved for your final review.");
        }}
        onConfirm={async () => {
          const preview = data.discovery_preview;
          if (preview) await startDiscovery(preview.id, preview.digest);
          else setError("No saved draft. Select sources to prepare a new brief.");
        }}
        onCancel={() => run(() => api.cancelAdoDiscovery(data.version), "Discovery draft discarded. No engagement created.")} />}
      {area === "settings" && <>
      <Card title="1. Configure the simulator" description="Settings and snapshots are isolated to the selected personal or organization/team workspace.">
        <Pill tone="amber">SIMULATOR — not connected</Pill>
        <fieldset disabled={busy || !data.permissions.manage} className="mt-4 space-y-4 min-w-0">
          <label className="block text-sm">Fictional Azure DevOps project
            <select className="form-control block mt-2 w-full" value={project} onChange={event => {
              const next = data.projects.find(item => item.id === event.target.value);
              if (next) setProject(next.id);
            }}>{data.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </label>
          <fieldset className="space-y-2"><legend className="text-sm mb-2">Allowed source work-item types</legend>
            {TYPES.map(type => <label key={type} className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={types.includes(type)} onChange={event =>
                setTypes(previous => event.target.checked ? [...previous, type] : previous.filter(item => item !== type))} />
              {type}
            </label>)}
          </fieldset>
          <p className="text-sm">Saving settings clears imported snapshots and any pending preview. Confirmed simulator receipts remain.</p>
          <Button disabled={!types.length} onClick={() => {
            if (!data.connection || window.confirm("Replace simulator settings and clear imported snapshots and the pending preview?"))
              void run(() => api.configureAdo(data.version, project, types), "Simulator settings saved. No external connection was made.");
          }}>Save simulator settings</Button>
        </fieldset>
        {!data.permissions.manage && <p className="notice mt-4">Only an organization owner or administrator can configure or reset this team's simulator.</p>}
        {settingsDirty && <p className="text-sm mt-3">Unsaved integration settings.</p>}
        {data.connection && <Button variant="ghost" className="mt-3" disabled={busy}
          onClick={() => changeArea("discovery")}>Use this source for discovery</Button>}
        <p className="text-xs text-zinc-500 mt-4">Local connector data expires {new Date(data.expires_at).toLocaleString()}.
          Reads and ordinary edits do not extend the fixed 30-day period. Assessments retain their existing separate retention rules.</p>
      </Card>
      {data.connection && <>
        <Card title="2. Import selected work items" description="Only the configured fictional project and source types are available. Re-import refreshes a snapshot without duplicating it.">
          <fieldset disabled={busy || dirty || !data.permissions.write} className="space-y-4 min-w-0">
            {data.available_items.map(item => <label key={item.id} className="block rounded border border-zinc-200 p-4">
              <span className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={selectedItems.includes(item.id)} onChange={event =>
                  setSelectedItems(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />
                <span className="min-w-0"><span className="block font-semibold">{item.id}: {item.title}</span>
                  <span className="block text-sm mt-1">{item.item_type} / {item.state} / revision {item.revision}</span>
                  <span className="block text-sm mt-2">{item.description}</span></span>
              </span>
            </label>)}
            <Button disabled={!selectedItems.length} onClick={() =>
              void run(() => api.importAdoItems(data.version, selectedItems), "Selected synthetic snapshots imported. Existing records were not changed.")}>
              Import selected work items
            </Button>
          </fieldset>
          <p className="text-sm mt-4">Imports are not automatically added to discovery or assessments and are not verified findings.
            Select saved snapshots below to preview and explicitly create a discovery engagement.</p>
        </Card>
        <Card title="Imported source snapshots" description={`${data.imported.length} imported snapshots. Source timestamps are fictional fixture values, not observed production performance.`}>
          {!data.imported.length && <p>No work items imported yet.</p>}
          <ul className="space-y-4">{data.imported.map(item => <li key={item.id} className="text-sm">
            <h3 className="font-semibold">{item.id}: {item.title}</h3>
            <p className="mt-1">{item.description}</p>
            <p className="mt-2">Source revision {item.revision}; source updated {item.source_updated_at};
              imported {new Date(item.imported_at).toLocaleString()}.</p>
            <p className="break-all mt-1">Simulated source reference: <code>{item.source_url}</code></p>
            <details className="mt-2"><summary className="cursor-pointer">Snapshot provenance</summary>
              <p className="break-all mt-2">Imported by {item.imported_by}; SHA-256 {item.content_digest}</p>
            </details>
          </li>)}</ul>
        </Card>
      </>}
      </>}
      {area === "delivery" && <>
        {!data.connection && <p className="notice">Configure a source in Connection settings before preparing delivery work.</p>}
        {data.connection &&
        <Card title="3. Preview assessment delivery work" description="Uses a current completed assessment, not imported ticket text. This is a proposed validation skeleton, not a parsed or complete implementation roadmap.">
          <label className="block text-sm">Completed assessment
            <select className="form-control block mt-2 w-full" disabled={busy || dirty || !data.permissions.write}
              value={selectedAssessment} onChange={event => { setSelectedAssessment(event.target.value); setAcknowledged(false); }}>
              <option value="">Choose an assessment</option>
              {assessmentId && !assessmentItems.some(item => item.session_id === assessmentId)
                && <option value={assessmentId}>Current workflow (must be completed)</option>}
              {assessmentItems.map(item => <option key={item.session_id} value={item.session_id}>{item.title}</option>)}
            </select>
          </label>
          {!assessmentItems.length && <p className="text-sm mt-3">Complete and review a workflow through the existing assessment journey first.
            Expired assessment sessions cannot be handed off, even if a decision archive remains.</p>}
          {assessments?.next_cursor && <Button variant="ghost" className="mt-3" disabled={busy} onClick={() => void moreAssessments()}>Load more assessments</Button>}
          <Button className="mt-4" disabled={busy || dirty || !data.permissions.write || !selectedAssessment}
            onClick={() => void run(() => api.previewAdoHandoff(data.version, selectedAssessment), "Preview prepared. No work items have been created.")}>
            Preview delivery handoff
          </Button>
          <p className="text-sm mt-4">Includes an Epic, a Feature, up to three saved readiness checks and an outcome-review Task.
            No owners, deadlines, estimates or implementation authority are invented. A do-not-proceed recommendation blocks handoff.</p>
        </Card>}
      {data.preview && <Card title="4. Review and explicitly confirm" description="A preview expires after ten minutes and is bound to the exact assessment version, destination and creator.">
        <p className="text-sm">Fictional destination: {data.preview.project}. Assessment {data.preview.assessment_id};
          analysis {data.preview.analysis_id}. Expires {new Date(data.preview.expires_at).toLocaleString()}.</p>
        <p className="text-sm mt-3">The preview below is the authority for this confirmation, regardless of the assessment currently selected above.</p>
        <ol className="space-y-4 mt-4">{data.preview.items.map((item, index) => <li key={index}>
          <h3 className="font-semibold">{index + 1}. {item.item_type}: {item.title}</h3>
          <p className="text-sm mt-1">Parent: {item.parent_index === null ? "none" : `preview item ${item.parent_index + 1}`}</p>
          <p className="text-sm whitespace-pre-wrap break-words mt-2">{item.description}</p>
        </li>)}</ol>
        <label className="flex items-start gap-3 text-sm mt-5">
          <input type="checkbox" className="mt-1" checked={acknowledged} disabled={busy || dirty || !data.permissions.write || !data.can_confirm}
            onChange={event => setAcknowledged(event.target.checked)} />
          I reviewed this exact preview and authorize creating local simulated work items only.
        </label>
        <Button className="mt-4" disabled={busy || dirty || !data.permissions.write || !data.can_confirm || !acknowledged} onClick={() => {
          const preview = data.preview;
          if (preview) void run(() => api.confirmAdoHandoff(preview.id, preview.digest), "Simulated handoff recorded. No real Azure DevOps work items were created.");
        }}>Confirm simulated handoff</Button>
        <Button variant="ghost" className="mt-4 ml-3" disabled={busy || !data.permissions.write || !data.can_confirm}
          onClick={() => void run(() => api.cancelAdoHandoff(data.version), "Preview discarded. No work items were created.")}>Discard preview</Button>
        {!data.can_confirm && <p className="text-sm mt-3">Only the preview creator can confirm or discard it.</p>}
      </Card>}
      <Button variant="ghost" disabled={busy} onClick={() => changeArea("history")}>View delivery receipts</Button>
      </>}
      {area === "history" && <>
      <Card title="Discovery creation receipts" description="Retries use the same engagement ID. Imported evidence is frozen in discovery; later imports, configuration changes and simulator resets do not rewrite it.">
        {!data.discovery_receipts.length && <p>No discovery engagements have been created from imports.</p>}
        {data.discovery_receipts.map(receipt => <div key={receipt.preview.id} className="mt-4 text-sm">
          <p className="font-semibold">{receipt.preview.engagement.title}</p>
          <p>{receipt.status} / {new Date(receipt.confirmed_at).toLocaleString()}</p>
          <details className="mt-2"><summary className="cursor-pointer">Creation details</summary>
            <p className="break-all">{receipt.engagement_id} / confirmed by {receipt.preview.actor}</p>
          </details>
          {receipt.status === "completed" ? <Button variant="ghost" className="mt-2" disabled={busy || dirty}
            onClick={() => onOpenDiscovery(receipt.engagement_id)}>Open discovery engagement</Button>
            : <><p className="mt-2">Creation is pending. Retry the recorded confirmation; no new review or duplicate engagement is needed.</p>
              <Button className="mt-2" disabled={busy || dirty || !data.permissions.write || receipt.preview.actor !== data.identity_id}
                onClick={() => void startDiscovery(receipt.preview.id, receipt.preview.digest)}>Finish creating discovery</Button></>}
        </div>)}
        <p className="text-xs text-zinc-500 mt-4">Discovery retains its existing fixed 30-day retention and process-local demo storage.
          Completed engagements lost on restart, deleted or expired are never silently recreated by a confirmation retry.</p>
      </Card>
      <Card title="Simulated delivery receipts" description="Retrying the same confirmation cannot create duplicate items. The same assessment analysis cannot be handed off twice to the same fictional project.">
        {!data.receipts.length && <p>No delivery work items have been created.</p>}
        {data.receipts.map(receipt => <details key={receipt.preview_id} className="mt-4">
          <summary className="cursor-pointer font-semibold">{receipt.items.length} simulated items / {receipt.project} / {new Date(receipt.confirmed_at).toLocaleString()}</summary>
          <p className="text-xs break-all mt-2">Assessment {receipt.assessment_id}; analysis {receipt.analysis_id}; confirmed by {receipt.confirmed_by}.</p>
          <ul className="space-y-3 mt-3">{receipt.items.map(item => <li key={item.id} className="text-sm break-words">
            <p>{item.id}: {item.item_type} / {item.title} / {item.state}</p>
            <p>Parent ID: {item.parent_id ?? "none"}</p><code className="break-all">{item.source_url}</code>
          </li>)}</ul>
        </details>)}
        <p className="text-xs text-zinc-500 mt-4">Status is local simulator state, not live delivery progress. Real synchronization is not implemented.</p>
      </Card>
      <Card title="Connector activity" description="Local activity history, not an immutable compliance audit log.">
        <ul className="space-y-3">{[...data.audit].reverse().map((entry, index) => <li key={index} className="text-sm">
          <p className="font-semibold">{entry.action.replace(/_/g, " ")}</p>
          <p>{entry.detail}</p><p className="text-xs break-all">{new Date(entry.at).toLocaleString()} / {entry.actor}</p>
        </li>)}</ul>
      </Card>
      </>}
      {area === "settings" && data.permissions.manage && <Card title="Reset local simulator">
        <p className="text-sm">Deletes this workspace's simulator settings, imports, previews, receipts and activity.
          Assessments and discovery engagements are not deleted. Limits: 20 delivery handoffs, 20 discovery creations and 100 activity events per reset.</p>
        <Button variant="danger" className="mt-4" disabled={busy} onClick={() => {
          if (window.confirm("Delete this workspace's local simulator data? Existing assessments and discovery remain unchanged."))
            void run(() => api.resetAdo(data.version), "Local simulator data reset. Assessments and discovery were not changed.");
        }}>Reset simulator data</Button>
      </Card>}
    </>}
  </section>;
}

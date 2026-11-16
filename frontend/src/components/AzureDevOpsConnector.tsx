import { useEffect, useLayoutEffect, useState } from "react";
import { liveAzureDevOps } from "../api";
import { azureDevOpsToken } from "../auth";
import { discoveryBrief, type AdoDiscoveryBrief } from "../azureDevOps";
import type { LiveItem, LiveState } from "../azureDevOpsLive";
import { DISCOVERY_BRIEF_FIELDS } from "./ConnectorDiscovery";
import { Button, Card, Spinner } from "./ui";

type Stage = "sources" | "brief" | "confirm";

export default function AzureDevOpsConnector({ onBusyChange, onUnsavedChange, onOpenDiscovery, acquireToken = azureDevOpsToken }: {
  onBusyChange: (busy: boolean) => void; onUnsavedChange: (dirty: boolean) => void;
  onOpenDiscovery: (id: string) => void;
  acquireToken?: (interactive?: boolean) => Promise<string>;
}) {
  const [data, setData] = useState<LiveState | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectCursor, setProjectCursor] = useState("");
  const [items, setItems] = useState<LiveItem[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [stage, setStage] = useState<Stage>("sources");
  const [brief, setBrief] = useState<AdoDiscoveryBrief | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const preview = data?.preview;
  const briefDirty = !!brief && !!preview && JSON.stringify(brief) !== JSON.stringify(discoveryBrief(preview.engagement));
  const settingsDirty = !!data && (organization !== (data.connection?.organization || "") || project !== (data.connection?.project_id || ""));
  const selectionDirty = stage === "sources" && [...selected].sort().join() !== [...(preview?.items.map(item => item.id) || [])].sort().join();
  const dirty = settingsDirty || (stage === "brief" && briefDirty) || selectionDirty;
  const writable = data?.permissions.write === true;

  useLayoutEffect(() => {
    onUnsavedChange(dirty);
    return () => onUnsavedChange(false);
  }, [dirty, onUnsavedChange]);

  function apply(value: LiveState, nextStage: Stage = value.preview ? "brief" : "sources") {
    setData(value); setOrganization(value.connection?.organization || ""); setProject(value.connection?.project_id || "");
    setBrief(value.preview ? discoveryBrief(value.preview.engagement) : null);
    setSelected(value.preview?.items.map(item => item.id) || []); setAcknowledged(false); setStage(nextStage);
  }
  useEffect(() => {
    let active = true;
    setBusy(true); onBusyChange(true);
    liveAzureDevOps.state().then(value => {
      if (active) { apply(value); setSettingsOpen(!value.connection); }
    }).catch((failure: Error) => { if (active) setError(failure.message); })
      .finally(() => { if (active) { setBusy(false); onBusyChange(false); } });
    return () => { active = false; onBusyChange(false); };
  }, [onBusyChange]);

  async function perform<T,>(action: () => Promise<T>, success = ""): Promise<T | undefined> {
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try { const result = await action(); setMessage(success); return result; }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The connector operation failed. Refresh before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function token() {
    if (!connected) throw new Error("Choose Connect Microsoft account before reading Azure DevOps.");
    return acquireToken();
  }
  function discard() { return !dirty || window.confirm("Discard unsaved connector selections, settings and brief edits?"); }
  async function refresh() {
    if (!discard()) return;
    const next = await perform(liveAzureDevOps.state);
    if (next) { apply(next); setItems([]); setLoaded(false); setBefore(null); }
  }
  async function loadProjects(more = false) {
    const next = await perform(async () => liveAzureDevOps.projects(organization, more ? projectCursor : "", await token()));
    if (next) {
      setProjects(previous => more ? [...previous, ...next.items.filter(item => !previous.some(old => old.id === item.id))] : next.items);
      setProjectCursor(next.next_cursor);
    }
  }
  async function browse(more = false) {
    const next = await perform(async () => liveAzureDevOps.items(more ? before : null, await token()));
    if (next) {
      setItems(previous => more ? [...previous, ...next.items.filter(item => !previous.some(old => old.id === item.id))] : next.items);
      setBefore(next.next_before); setLoaded(true);
    }
  }
  async function start(previewId: string, digest: string) {
    if (!discard()) return;
    setAcknowledged(false);
    const result = await perform(async () => liveAzureDevOps.confirm(previewId, digest, await token()));
    if (result) { onUnsavedChange(false); onOpenDiscovery(result.engagement_id); }
  }
  function backToSources() {
    if (briefDirty && !window.confirm("Discard unsaved discovery brief changes?")) return;
    if (preview) setBrief(discoveryBrief(preview.engagement));
    setStage("sources"); setAcknowledged(false);
  }

  return <section aria-label="Azure DevOps connector" className="space-y-6">
    <header className="page-header"><div className="eyebrow mb-2">Workspace / Integrations</div>
      <h1>Azure DevOps connector</h1><p className="mt-2">Read real project work, shape your brief and explicitly start discovery.</p>
    </header>
    <p role="note" className="notice">Read-only external access. AgentSpark never creates, edits or deletes Azure DevOps work items.
      Selected source content is copied into this workspace for discovery and is visible to its readers. Ticket text is not proof of process facts or AI value.</p>
    {error && <p role="alert" className="notice">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy} onClick={() => void perform(async () => {
        await acquireToken(true); setConnected(true);
      }, "Microsoft account connected for read-only Azure DevOps access.")}>Connect Microsoft account</Button>
      <Button disabled={busy} variant="ghost" onClick={() => void refresh()}>Refresh connector</Button>
      <Button disabled={busy} variant="ghost" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(value => !value)}>Connection settings</Button>
      <Button disabled={busy} variant="ghost" aria-pressed={historyOpen} onClick={() => setHistoryOpen(value => !value)}>History & details</Button>
    </div>
    <p className="text-sm">{connected ? "Microsoft connection available for this page session." : "Connect with Microsoft to authorize source reads. No access tokens are stored in connector data."}</p>
    {busy && <Spinner label="Working with Azure DevOps..." />}
    {data && <>
      {settingsOpen && <Card title="Organization and project" description="Administrators choose the allowed source; every source read also uses your own Microsoft account access.">
        <fieldset disabled={busy || !data.permissions.manage || !!data.creation} className="space-y-4 min-w-0">
          <label className="block text-sm">Azure DevOps organization
            <input className="form-control block mt-2 w-full" maxLength={100} value={organization} placeholder="https://dev.azure.com/your-organization"
              onChange={event => { setOrganization(event.target.value); setProject(""); setProjects([]); setProjectCursor(""); }} />
          </label>
          <Button disabled={!connected || !organization.trim()} onClick={() => void loadProjects()}>Find projects</Button>
          <label className="block text-sm">Project
            <select className="form-control block mt-2 w-full" value={project} onChange={event => setProject(event.target.value)}>
              <option value="">Select a project</option>
              {data.connection && !projects.some(item => item.id === data.connection?.project_id) &&
                <option value={data.connection.project_id}>{data.connection.project_name}</option>}
              {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {projectCursor && <Button variant="ghost" disabled={!connected} onClick={() => void loadProjects(true)}>Load more projects</Button>}
          <Button disabled={!connected || !organization.trim() || !project} onClick={() => void (async () => {
            if ((briefDirty || selectionDirty) && !window.confirm("Changing the source will discard unsaved discovery edits and selections. Continue?")) return;
            const next = await perform(async () => liveAzureDevOps.configure(data.version, organization, project, await token()), "Read-only source configured.");
            if (next) { apply(next); setItems([]); setLoaded(false); setBefore(null); setSettingsOpen(false); }
          })()}>Save source connection</Button>
          {data.connection && <Button variant="ghost" onClick={() => {
            if (window.confirm("Disconnect and clear this workspace's connector previews, receipts and activity? Saved discovery engagements are not deleted.")) void (async () => {
              const next = await perform(() => liveAzureDevOps.disconnect(data.version), "Connector data cleared. Saved engagements retained.");
              if (next) { apply(next); setItems([]); setProjects([]); setLoaded(false); setBefore(null); setProjectCursor(""); }
            })();
          }}>Disconnect and clear connector data</Button>}
        </fieldset>
        {!data.permissions.manage && <p className="notice mt-4">Only a workspace administrator can change the source connection.</p>}
      </Card>}
      {data.connection && <section aria-label="Start discovery from Azure DevOps" className="space-y-5">
        <ol aria-label="Discovery setup steps" className="flex flex-wrap gap-3 text-sm">
          {([["sources", "1. Select sources"], ["brief", "2. Review and edit"], ["confirm", "3. Start discovery"]] as const).map(([id, label]) =>
            <li key={id} aria-current={stage === id ? "step" : undefined} className={stage === id ? "font-semibold text-brand-700" : ""}>{label}</li>)}
        </ol>
        <p className="text-sm break-words">Source: {data.connection.organization} / {data.connection.project_name}</p>
        {stage === "sources" && <Card title="Select work items" description="Choose up to 20 items once. Continue copies a frozen, privacy-screened snapshot into a reviewable brief; it does not create an engagement.">
          <Button disabled={busy || !connected} onClick={() => void browse()}>Read work items</Button>
          <fieldset disabled={busy || !writable} className="space-y-3 min-w-0 mt-4">
            {items.map(item => <label key={item.id} className="flex items-start gap-3 rounded border border-zinc-200 p-4 text-sm">
              <input type="checkbox" className="mt-1" checked={selected.includes(item.id)} onChange={event =>
                setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />
              <span className="min-w-0 break-words"><span className="block font-semibold">{item.id}: {item.title}</span>
                <span className="block mt-1">{item.item_type} / {item.state} / revision {item.revision}</span>
                <span className="block mt-2 whitespace-pre-wrap">{item.description}</span></span>
            </label>)}
          </fieldset>
          {loaded && !items.length && <p>No work items were returned for your account in this project.</p>}
          {before !== null && <Button variant="ghost" disabled={busy || !connected} onClick={() => void browse(true)}>Load more work items</Button>}
          <p className="text-sm my-3">{selected.length} selected. Maximum 20.</p>
          <Button disabled={busy || !writable || !connected || !selected.length || selected.length > 20 || !!data.creation} onClick={() => void (async () => {
            const next = await perform(async () => liveAzureDevOps.prepare(data.version, selected, await token()), "Sources prepared. Review and edit your brief.");
            if (next) apply(next, "brief");
          })()}>Continue to brief</Button>
          {preview && <Button variant="ghost" className="ml-3" disabled={busy} onClick={() => {
            setSelected(preview.items.map(item => item.id)); setStage("brief"); setAcknowledged(false);
          }}>Resume saved brief</Button>}
        </Card>}
        {stage === "brief" && preview && brief && <Card title="Review and edit your brief">
          <form onSubmit={event => {
            event.preventDefault();
            void (async () => {
              const next = await perform(() => liveAzureDevOps.revise(data.version, preview.id, brief), "Brief saved for final review.");
              if (next) apply(next, "confirm");
            })();
          }}><fieldset disabled={busy || !writable || !data.can_edit} className="space-y-4 min-w-0">
            {DISCOVERY_BRIEF_FIELDS.slice(0, 2).map(([key, label, maximum]) => <label className="block text-sm" key={key}>{label}
              <textarea className="form-control block mt-2 w-full" required maxLength={maximum} value={brief[key]}
                onChange={event => setBrief({ ...brief, [key]: event.target.value })} />
            </label>)}
            <details><summary className="cursor-pointer">Scope, ownership and success measures</summary><div className="space-y-4 mt-4">
              {DISCOVERY_BRIEF_FIELDS.slice(2).map(([key, label, maximum]) => <label className="block text-sm" key={key}>{label}
                <textarea className="form-control block mt-2 w-full" maxLength={maximum} required={["business_units", "sponsor", "engagement_owner"].includes(key)}
                  value={brief[key]} onChange={event => setBrief({ ...brief, [key]: event.target.value })} />
              </label>)}
            </div></details>
            <p className="text-sm">{preview.sources.length} real source snapshots; process claims remain unverified.</p>
            <Button type="submit">Review before starting</Button>
          </fieldset></form>
          <Button variant="ghost" className="mt-3" disabled={busy} onClick={backToSources}>Back to sources</Button>
          {briefDirty && <p className="text-sm mt-3">Unsaved discovery brief changes.</p>}
        </Card>}
        {stage === "confirm" && preview && <Card title="Start this discovery?">
          <dl className="space-y-3">{DISCOVERY_BRIEF_FIELDS.map(([key, label]) => <div key={key}><dt className="font-semibold">{label}</dt>
            <dd className="text-sm whitespace-pre-wrap break-words mt-1">{discoveryBrief(preview.engagement)[key] || "Not specified"}</dd></div>)}</dl>
          <h3 className="font-semibold mt-5">Included sources</h3>
          <ul className="space-y-2 mt-2 text-sm">{preview.sources.map(source => <li className="break-words" key={source.id}>{source.label}</li>)}</ul>
          <details className="text-sm mt-4"><summary className="cursor-pointer">Technical evidence and provenance</summary>
            {preview.sources.map(source => <p key={source.id} className="whitespace-pre-wrap break-all mt-3">{source.source_reference}{"\n"}{source.statement}</p>)}
          </details>
          <p className="text-xs mt-4">Review valid until {new Date(preview.expires_at).toLocaleString()}. Current source revisions and access are checked again before creation.</p>
          <label className="flex items-start gap-3 text-sm mt-4">
            <input type="checkbox" className="mt-1" checked={acknowledged} disabled={busy || !writable || !data.can_edit}
              onChange={event => setAcknowledged(event.target.checked)} />
            I reviewed this brief and authorize starting discovery with these sources, visible to this workspace's readers.
          </label>
          <Button className="mt-4" disabled={busy || !writable || !data.can_edit || !connected || !acknowledged}
            onClick={() => void start(preview.id, preview.digest)}>Start discovery</Button>
          <Button className="mt-4 ml-3" variant="ghost" disabled={busy} onClick={() => { setStage("brief"); setAcknowledged(false); }}>Edit brief</Button>
        </Card>}
        {preview && <Button variant="ghost" disabled={busy || !writable || !data.can_edit} onClick={() => {
          if (!discard()) return;
          void perform(() => liveAzureDevOps.cancel(data.version), "Draft discarded. No engagement created.").then(next => { if (next) apply(next); });
        }}>Discard discovery draft</Button>}
        {preview && !data.can_edit && <p className="notice">Only the draft creator can edit, discard or confirm it.</p>}
        {!writable && <p className="notice">Read-only workspace access: you cannot prepare or create discovery.</p>}
      </section>}
      {(historyOpen || data.creation) && <Card title="History & details">
        {data.creation && <div className="notice"><p>Discovery creation was confirmed but has not finished recording its receipt. Retry safely without creating a duplicate.</p>
          <Button disabled={busy || !writable || !connected || data.creation.preview.actor !== data.identity_id}
            onClick={() => data.creation && void start(data.creation.preview.id, data.creation.preview.digest)}>Finish creating discovery</Button></div>}
        {!data.receipts.length && !data.creation && <p>No discovery creation receipts.</p>}
        {data.receipts.map(receipt => <div key={receipt.preview_id} className="mt-4 text-sm">
          <p>Created {new Date(receipt.created_at).toLocaleString()}</p>
          <Button variant="ghost" disabled={busy} onClick={() => { if (discard()) onOpenDiscovery(receipt.engagement_id); }}>Open discovery engagement</Button>
        </div>)}
        <details className="mt-4 text-sm"><summary className="cursor-pointer">Connector activity</summary>
          {data.activity.map((item, index) => <p key={index} className="mt-2 break-all">{new Date(item.at).toLocaleString()} / {item.action} / {item.actor}</p>)}
        </details>
        <p className="text-xs mt-4">Connector data expires {new Date(data.expires_at).toLocaleString()}. Disconnecting clears connector history, not saved engagements.</p>
      </Card>}
    </>}
  </section>;
}

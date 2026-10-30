import { useEffect, useState } from "react";
import { api, type ArchivedDecision, type HomeItem, type HomePage, type HomeStatus } from "../api";
import { Button, Card, Pill, Spinner } from "./ui";
import Icon from "./Icon";
import Markdown from "./Markdown";
import ROIReport from "./ROIReport";
import { EvidenceSummary } from "./EvidenceRegister";
import { ReadinessSummary } from "./ImplementationReadiness";
import RuntimeDecisionSummary from "./RuntimeDecision";
import ExecutiveBriefSummary from "./ExecutiveBrief";

const STATUS: Record<HomeStatus, { label: string; tone: "green" | "red" | "amber" | "slate" }> = {
  draft: { label: "Draft / clarification", tone: "slate" },
  pending_review: { label: "Pending review", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};
const date = (value: string) => value ? new Date(value).toLocaleString() : "Time unavailable";

export default function Home({ demo, retentionDays, workspaceName, canCreate, onCreate, onOpen, onDeleted, onBusyChange }: {
  demo: boolean; retentionDays: number; onCreate: () => void;
  workspaceName?: string; canCreate: boolean;
  onOpen: (session: string) => Promise<void>; onDeleted: (session: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<HomeStatus | "all">("all");
  const [page, setPage] = useState<HomePage | null>(null);
  const [decision, setDecision] = useState<ArchivedDecision | null>(null);
  const [deleting, setDeleting] = useState<HomeItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(""); setPage(null);
    api.home(status).then(result => { if (!cancelled) setPage(result); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [status, revision]);

  async function more() {
    if (!page?.next_cursor) return;
    setBusy(true); setError("");
    try {
      const next = await api.home(status, page.next_cursor);
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load more workflows."); }
    finally { setBusy(false); }
  }

  async function open(item: HomeItem) {
    setBusy(true); setError("");
    try {
      if (item.kind === "decision" && item.analysis_id) setDecision(await api.decision(item.session_id, item.analysis_id));
      else await onOpen(item.session_id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open this workflow."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true); setError("");
    try {
      if (deleting.kind === "decision" && deleting.analysis_id) {
        await api.deleteArchivedWorkflow(deleting.session_id, deleting.analysis_id);
      } else await api.deleteSession(deleting.session_id);
      const session = deleting.session_id;
      setDeleting(null); setDecision(null); setRevision(value => value + 1);
      onDeleted(session);
    } catch (e) { setError(e instanceof Error ? e.message : "Deletion failed. Retry to finish removing this workflow."); }
    finally { setBusy(false); }
  }

  const review = decision?.details.human_review;
  return <div className="space-y-6">
    <header className="page-header flex items-end justify-between flex-wrap gap-4">
      <div>
        <div className="eyebrow mb-2">{workspaceName || "Personal workspace"}</div>
        <h1>{decision ? "Decision details" : "Home"}</h1>
        <p className="mt-2">{decision ? "A retained, read-only snapshot of this analysis and its decision." : "Your workflow assessments, review decisions, and next steps in one place."}</p>
      </div>
      {decision ? <Button variant="ghost" disabled={busy} onClick={() => { setDecision(null); setError(""); }}>Back to Home</Button>
        : <Button disabled={busy || !canCreate} onClick={onCreate}>Create workflow <span aria-hidden="true">+</span></Button>}
    </header>
    {!workspaceName && <p className="notice">Team workflows and pending reviews are listed in their team workspace. Select your team under Organizations &amp; teams, then choose Pending review.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[
        [demo ? "Shared local demo" : workspaceName ? "Team-scoped access" : "Owner-isolated access",
          demo ? "Fictional data; not a private organization workspace." : workspaceName
            ? "Active membership and team permissions control access." : "Only your signed-in identity's records are listed."],
        [`${page?.archive_retention_days ?? retentionDays}-day decision archive`, "Final decisions survive session expiry and app restarts."],
        ["Human accountability", "Approval is advisory, never execution authority."],
      ].map(([title, detail]) => <div key={title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-xs font-semibold text-slate-800">{title}</p><p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{detail}</p>
      </div>)}
    </div>
    {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
    {deleting && <section role="alertdialog" aria-label="Confirm workflow and archive deletion" className="rounded-xl border border-rose-200 bg-rose-50 p-5">
      <h2 className="font-semibold text-rose-900">Delete workflow and all decision history?</h2>
      <p className="text-sm text-rose-800 mt-2">This removes the active workflow and every retained decision snapshot for it, including reviewer comments. This cannot be undone.</p>
      <div className="flex flex-wrap gap-3 mt-4">
        <Button variant="danger" disabled={busy} onClick={remove}>Delete workflow & history</Button>
        <Button variant="ghost" disabled={busy} autoFocus onClick={() => setDeleting(null)}>Cancel</Button>
      </div>
    </section>}
    {decision ? <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Pill tone={STATUS[decision.summary.status].tone}>{STATUS[decision.summary.status].label}</Pill>
            <h2 className="text-xl font-semibold text-slate-900 mt-3">{decision.summary.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{decision.summary.domain}</p>
          </div>
          <Button variant="ghost" disabled={busy || !decision.summary.can_delete} onClick={() => setDeleting(decision.summary)}>Delete workflow & history</Button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100 text-xs">
          <div><dt className="text-slate-500">Record saved</dt><dd className="text-slate-700 mt-1">{date(decision.summary.updated_at)}</dd></div>
          <div><dt className="text-slate-500">Archive expires</dt><dd className="text-slate-700 mt-1">{date(decision.summary.expires_at)}</dd></div>
          <div><dt className="text-slate-500">Analysis version</dt><dd className="font-mono text-slate-700 mt-1 break-all">{decision.summary.analysis_id}</dd></div>
        </dl>
      </Card>
      <ExecutiveBriefSummary brief={decision.details.executive_brief} />
      <Card title="Reviewed deployment target">
        <p className="text-sm">{decision.details.deployment_preferences?.target_cloud === "aws" ? "AWS" : "Azure"} / {decision.details.deployment_preferences?.preferred_region || "Region not specified"} (unverified)</p>
        <p className="text-sm mt-2">Data residency: {decision.details.deployment_preferences?.data_residency_requirements || "Not specified"}</p>
        <p className="text-sm mt-2">Constraints: {decision.details.deployment_preferences?.deployment_constraints || "Not specified"}</p>
        <p className="text-xs text-slate-500 mt-2">Advisory assessment only; no resources were deployed. AgentSpark remains hosted on Azure.</p>
      </Card>
      <Card title="Recorded assessment model">
        <p className="text-sm">{decision.details.inference_model
          ? `${decision.details.inference_model.provider} / ${decision.details.inference_model.model} / deployment ${decision.details.inference_model.deployment}`
          : "Model provenance was not recorded in this historical assessment."}</p>
        <p className="text-xs text-slate-500 mt-2">This is the saved decision snapshot, not the current server default.</p>
      </Card>
      <EvidenceSummary report={decision.details.evidence_report} />
      <ReadinessSummary report={decision.details.readiness_report} />
      <RuntimeDecisionSummary decision={decision.details.runtime_decision} />
      <Card title={review ? "Reviewer decision & comments" : "Automated policy decision"}>
        {review ? <>
          <p className="text-sm font-medium text-slate-800">{review.decision === "approve" ? "Approved" : "Rejected"} by {review.reviewer}</p>
          <p className="text-xs text-slate-500 mt-1">{date(review.reviewed_at)}{demo ? " · Self-reported demo identity" : " · Verified token identity"}</p>
          <blockquote className="mt-4 border-l-2 border-teal-300 pl-4 text-sm text-slate-700 whitespace-pre-wrap break-words">{review.note}</blockquote>
        </> : <>
          <p className="text-sm text-slate-700">{decision.details.governance?.reason || "No policy rationale was recorded."}</p>
          <p className="text-xs text-slate-500 mt-3">This is a policy outcome, not a human review. No approver comments were submitted.</p>
        </>}
      </Card>
      {decision.details.workflow_intelligence && <Card title="Workflow overview"><p className="text-sm text-slate-600 leading-relaxed">{decision.details.workflow_intelligence.summary}</p>
        <p className="text-xs text-slate-500 mt-3">Systems: {decision.details.workflow_intelligence.systems.join(", ") || "None supplied"}</p></Card>}
      {decision.details.suitability_score && <Card title="Readiness assessment">
        <p className="text-3xl font-semibold text-teal-800">{decision.details.suitability_score.agent_score}<span className="text-base text-slate-500"> / 100</span></p>
        <p className="text-sm font-medium mt-3">{decision.details.suitability_score.recommended_pattern}</p>
        <p className="text-sm text-slate-500 leading-relaxed mt-2">{decision.details.suitability_score.explanation}</p>
      </Card>}
      {decision.details.governance && <Card title="Original policy assessment">
        <Pill tone="slate">{decision.details.governance.decision}</Pill>
        <p className="text-sm text-slate-600 leading-relaxed mt-3">{decision.details.governance.reason}</p>
        <p className="text-xs text-slate-500 mt-2">Overall risk: {decision.details.governance.overall_risk}. A human review does not rewrite the original policy outcome.</p>
      </Card>}
      {decision.details.roi && <Card title="ROI assumptions and scenarios"><ROIReport roi={decision.details.roi} /></Card>}
      {decision.details.architecture_doc && <Card title="Retained recommendation"><Markdown>{decision.details.architecture_doc}</Markdown></Card>}
      {decision.details.cost_estimate && <Card title="Retained cost estimate"><Markdown>{decision.details.cost_estimate}</Markdown></Card>}
      {decision.details.roadmap && <Card title="Retained delivery roadmap"><Markdown>{decision.details.roadmap}</Markdown></Card>}
      <p className="text-xs text-slate-500 leading-relaxed">This deletable decision snapshot is not an immutable compliance audit log. Full interview transcripts are not retained in this archive.</p>
    </> : <>
      <Card title="Workflow library" description="Active work and retained decision versions. Reanalysis can create multiple decision records for the same workflow.">
        <div role="group" aria-label="Workflow status filters" className="flex flex-wrap gap-2 mb-5">
          {(["all", "draft", "pending_review", "approved", "rejected"] as const).map(value =>
            <Button key={value} variant="ghost" disabled={busy} aria-pressed={status === value}
              className={status === value ? "bg-teal-50 border-teal-300 text-teal-900" : ""}
              onClick={() => setStatus(value)}>{value === "all" ? "All workflows" : STATUS[value].label}</Button>)}
          <Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh</Button>
        </div>
        {busy && <Spinner label="Loading your workflows…" />}
        {!busy && page?.items.length === 0 && <div className="text-center py-12">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon name="home" /></div>
          <h2 className="text-base font-semibold text-slate-800">No workflows in this view</h2>
          <p className="text-sm text-slate-500 mt-2">Create a workflow, or choose a different status filter.</p>
        </div>}
        {page && page.items.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="data-table"><thead><tr>{["Workflow", "Status", "Record", "Saved / updated", "Expires", "Actions"].map((label, index) => <th key={index} scope="col">{label}</th>)}</tr></thead>
            <tbody>{page.items.map(item => <tr key={`${item.kind}:${item.session_id}:${item.analysis_id || ""}`}>
              <td className="min-w-48"><button disabled={busy} className="font-semibold text-teal-800 hover:underline text-left"
                onClick={() => void open(item)} aria-label={`Open ${item.title} ${STATUS[item.status].label}`}>{item.title}</button>
                <p className="text-[11px] text-slate-500 mt-1">{item.domain}</p></td>
              <td><Pill tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Pill></td>
              <td className="whitespace-nowrap">{item.kind === "decision" ? "Decision snapshot" : item.legacy ? "Legacy session" : "Active session"}</td>
              <td className="whitespace-nowrap">{date(item.updated_at)}</td><td className="whitespace-nowrap">{date(item.expires_at)}</td>
              <td><button disabled={busy || !item.can_delete} className="text-rose-700 hover:underline text-xs whitespace-nowrap"
                aria-label={`Delete ${item.title} and history`} onClick={() => setDeleting(item)}>Delete</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {page?.next_cursor && <div className="mt-5"><Button variant="ghost" disabled={busy} onClick={more}>Load more workflows</Button></div>}
        <p className="text-xs text-slate-500 leading-relaxed mt-5">Approved includes policy auto-approval. Rejected includes policy rejection and human rejection. Session expiry and archive expiry are independent; older sessions without archive metadata remain short-lived.</p>
      </Card>
    </>}
  </div>;
}

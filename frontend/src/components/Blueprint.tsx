import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, Button, Spinner } from "./ui";
import Markdown from "./Markdown";
import ArchitectureDiagram from "./ArchitectureDiagram";
import AnalysisEvidence from "./AnalysisEvidence";
import ROIReport, { roiMarkdown } from "./ROIReport";

export default function Blueprint({ sessionId, active, canReview, secureReview, onRefresh, onBusyChange }: any) {
  const [bp, setBp] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const authorizedReview = canReview && bp?.permissions?.review === true;

  useEffect(() => {
    if (!active || !sessionId) return;
    let cancelled = false;
    setBp(null); setErr(""); setBusy(true); onBusyChange(true);
    api.blueprint(sessionId).then((result) => {
      if (!cancelled) setBp(result);
    }).catch((e: Error) => {
      if (!cancelled) setErr(e.message);
    }).finally(() => {
      if (!cancelled) { setBusy(false); onBusyChange(false); }
    });
    return () => { cancelled = true; onBusyChange(false); };
  }, [active, sessionId]);

  async function load() {
    if (!sessionId) return;
    setBusy(true); onBusyChange(true); setErr(""); setBp(null);
    try { setBp(await api.blueprint(sessionId)); }
    catch (e: any) {
      setErr(/404/.test(e.message)
        ? "Run the Workflow Analysis first — the blueprint is generated from it."
        : e.message);
    }
    finally { setBusy(false); onBusyChange(false); }
  }

  async function review(decision: "approve" | "reject") {
    if (!bp?.analysis_id || (!secureReview && !reviewer.trim()) || !note.trim() || !authorizedReview) return;
    setBusy(true); onBusyChange(true); setErr("");
    try {
      await api.submitReview(sessionId, {
        analysis_id: bp.analysis_id, decision, reviewer: secureReview ? "authenticated" : reviewer.trim(), note: note.trim(),
      });
      setBp(await api.blueprint(sessionId));
      await onRefresh();
      setReviewer(""); setNote("");
    } catch (e: unknown) {
      setBp(null);
      setErr(e instanceof Error ? e.message : "Review failed. Fetch the current recommendation before retrying.");
    } finally { setBusy(false); onBusyChange(false); }
  }

  async function download() {
    if (!bp) return;
    setBusy(true); onBusyChange(true); setErr("");
    try {
      const current = await api.blueprint(sessionId);
      if (current.analysis_id !== bp.analysis_id || current.status !== bp.status) {
        setBp(current);
        await onRefresh();
        setErr("Recommendation changed. Review the refreshed version before exporting.");
        return;
      }
      exportMarkdown(current);
    } catch (e) {
      setBp(null);
      setErr(e instanceof Error ? e.message : "Cannot verify the current blueprint.");
    } finally { setBusy(false); onBusyChange(false); }
  }

  function exportMarkdown(bp: any) {
    const s = bp.suitability_score || {};
    const heading = `# AgentSpark ${bp.status === "rejected" ? "Rejected Recommendation" : "Blueprint"}

**Status:** ${bp.status}${bp.provisional ? " — PROVISIONAL: NOT APPROVED" : ""}
**Analysis:** ${bp.analysis_id}
${bp.human_review ? `**Human review:** ${bp.human_review.decision} by ${bp.human_review.reviewer} at ${bp.human_review.reviewed_at}\n**Review note:** ${bp.human_review.note}` : ""}

Advisory recommendation only; approval does not execute or deploy a business workflow.
${bp.demo_scenario ? `Fictional demo fixture: ${bp.demo_scenario}; not extracted customer facts.` : ""}

## Evidence and provenance
\`\`\`json
${JSON.stringify(bp.diagnosis, null, 2)}
\`\`\`

## Grounded pattern sources (keyword retrieval + required design IDs)
${(bp.retrieved_patterns || []).map((p: { id: string; name: string; source_ref?: string; content_sha256?: string }) =>
  `- ${p.id}: ${p.name} — ${p.source_ref && p.content_sha256
    ? `${p.source_ref}; SHA256 ${p.content_sha256}` : "Legacy source unavailable; rerun analysis."}`).join("\n")}

## ROI assumptions and sensitivity
${roiMarkdown(bp.roi)}
`;
    const md = bp.status === "rejected" ? `${heading}

## Rejection
${bp.human_review?.note || bp.governance?.reason || ""}

## Non-agentic Alternative
${bp.alternative || ""}
` : `${heading}

**Readiness:** ${s.agent_score ?? "-"}/100 (${s.classification ?? "-"}) · Pattern: ${s.recommended_pattern ?? "-"}

## Architecture
${bp.architecture_doc || ""}

## Mermaid Diagram
\`\`\`mermaid
${bp.mermaid_diagram || ""}
\`\`\`

## Cost Estimate
${bp.cost_estimate || ""}

## Enterprise Governance
**Decision**: ${bp.governance?.decision || "N/A"}
**Overall Risk**: ${bp.governance?.overall_risk || "N/A"}
${bp.governance?.decision === "REJECT" ? `**Rejection Alternative**: ${bp.governance.rejection_package?.alternative || "N/A"}` : ""}
*Reasoning*: ${bp.governance?.reason || "N/A"}

## Roadmap
${bp.roadmap || ""}

## Illustrative, untested scaffold — not deployment-ready
\`\`\`python
${bp.code_scaffold || ""}
\`\`\`
`;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AgentSpark_Blueprint.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <header className="page-header flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Step 04 / Review & decide</div>
          <h1>Implementation Blueprint</h1>
          <p className="mt-2">Architecture, cost, roadmap and starter code — generated from the analysis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={load} disabled={!sessionId || busy}>Generate / Fetch</Button>
          {bp && <Button aria-label="⬇ Export .md" variant="ghost" onClick={download} disabled={busy}>Export .md</Button>}
        </div>
      </header>

      {!sessionId && <Card><p className="text-amber-800 text-sm">⚠️ Run the analysis first.</p></Card>}
      {busy && <Card><Spinner label="Fetching blueprint…" /></Card>}
      {err && <Card><p role="alert" className="text-rose-700 text-sm">❌ {err}</p></Card>}
      {bp && !bp.diagnosis && <Card><p className="text-amber-800 text-sm">Legacy analysis has no fact provenance. Rerun analysis before reviewing it.</p></Card>}
      <AnalysisEvidence diagnosis={bp?.diagnosis} scenario={bp?.demo_scenario} />
      {bp?.roi && <Card title="ROI assumptions and sensitivity"><ROIReport roi={bp.roi} /></Card>}

      {bp && (
        <Card title="Recommendation disposition">
          <p className="font-semibold">
            {bp.status === "rejected" ? "Rejected — no agentic blueprint"
              : bp.provisional ? "Provisional blueprint — human review required"
              : bp.human_review ? "Recommendation approved by a human reviewer"
              : "Recommendation auto-approved by policy"}
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">Approval applies to this advisory recommendation only. It does not execute or deploy a workflow.</p>
          {bp.human_review && <p className="text-sm mt-2">{bp.human_review.reviewer}: {bp.human_review.note}</p>}
          {bp.status === "rejected" && (
            <div className="mt-3">
              <p className="text-sm text-rose-700">{bp.human_review?.note || bp.governance?.reason}</p>
              <p className="text-sm mt-2"><b>Non-agentic alternative:</b> {bp.alternative}</p>
            </div>
          )}
          {bp.provisional && !authorizedReview && <p role="status" className="mt-3 text-amber-800">Your identity cannot review this workflow. Team reviews require a reviewer grant, the configured token role in live mode, and a reviewer other than the creator.</p>}
          {bp.provisional && authorizedReview && (
            <div className="mt-4 space-y-3">
              <p className="notice notice-warning">{secureReview ? "Review is attributed to the verified token identity; ownership, membership and role checks are enforced by the API."
                : "Local demo only: reviewer names are self-reported, not production approval authority."}</p>
              {!secureReview && <label className="block text-sm">
                Reviewer
                <input className="form-control block mt-2" value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={200} disabled={busy} />
              </label>}
              <label className="block text-sm">
                Review rationale
                <textarea className="form-control block mt-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} disabled={busy} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => review("approve")} disabled={busy || (!secureReview && !reviewer.trim()) || !note.trim()}>Approve recommendation</Button>
                <Button variant="ghost" className="border-rose-200 text-rose-700" onClick={() => review("reject")} disabled={busy || (!secureReview && !reviewer.trim()) || !note.trim()}>Reject recommendation</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {bp && bp.status !== "rejected" && (
        <>
          {bp.token_usage && (
            <div className="flex gap-4">
              <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-teal-900">Total Tokens Consumed</h3>
                  <p className="text-xs text-teal-700 mt-1">Across all 7 LangGraph agents</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-semibold text-teal-900">{bp.token_usage.total_tokens.toLocaleString()}</span>
                  <div className="text-xs text-teal-800 mt-1 space-x-2">
                    <span>Prompt: {bp.token_usage.prompt_tokens.toLocaleString()}</span>
                    <span className="opacity-50">|</span>
                    <span>Completion: {bp.token_usage.completion_tokens.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <ArchitectureDiagram bp={bp} />
          <Card title="Architecture Document"><Markdown>{bp.architecture_doc || ""}</Markdown></Card>
          
          {bp.governance && (
            <Card title="Enterprise Governance Decision">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                <div className="flex gap-2 items-center flex-wrap mb-2">
                  <span className="font-semibold text-lg text-slate-800">
                    {bp.human_review?.decision === "approve" ? "HUMAN APPROVED" : bp.governance.decision === "HUMAN_REVIEW_REQUIRED" ? "🟡 HUMAN REVIEW REQUIRED" : "🟢 AUTO APPROVED"}
                  </span>
                  <span className="text-xs text-slate-600 uppercase px-2 py-1 bg-white border border-slate-200 rounded">Risk: {bp.governance.overall_risk}</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{bp.governance.reason}</p>
                {bp.governance.decision === "REJECT" && bp.governance.rejection_package && (
                   <p className="text-sm text-rose-700 mt-2"><b>Alternative:</b> {bp.governance.rejection_package.alternative}</p>
                )}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Cost Estimate"><Markdown>{bp.cost_estimate || ""}</Markdown></Card>
            <Card title="Roadmap"><Markdown>{bp.roadmap || ""}</Markdown></Card>
          </div>
          <Card title="Illustrative, untested scaffold — not deployment-ready">
            <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto leading-relaxed">{bp.code_scaffold}</pre>
          </Card>
          {bp.mermaid_diagram && (
            <details className="rounded-xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-sm font-semibold text-teal-700">Show raw Mermaid source</summary>
              <pre className="text-xs text-teal-900 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto mt-4">{bp.mermaid_diagram}</pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}

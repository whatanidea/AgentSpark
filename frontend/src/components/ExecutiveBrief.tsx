import { useState } from "react";
import { api, type ExecutiveBrief } from "../api";
import { Button, Card } from "./ui";

export function executiveBriefMarkdown(brief?: ExecutiveBrief | null): string {
  if (!brief) return "## Executive decision brief\nNot assessed in this historical snapshot.\n";
  return `## Executive decision brief
**${brief.workflow_name}**
**Decision:** ${brief.decision_label}
**Advisory status:** ${brief.approval_status}
**Analysis:** ${brief.analysis_id || "Incomplete assessment"}

${brief.rationale}

${brief.claims.map(claim => `- **${claim.label}:** ${claim.statement} [${claim.source_ids.join(", ")}]`).join("\n")}

### Risks and evidence gaps
${brief.risks_and_gaps.map(gap => `- ${gap}`).join("\n") || "No outstanding gaps recorded; this is not execution authorization."}

**Next action:** ${brief.next_action}

### Sources and assumptions
${brief.sources.map(source => `- **${source.id} — ${source.label}:** ${source.basis}`).join("\n")}

${brief.limitations}
`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExecutiveBriefSummary({ brief, sessionId }: { brief?: ExecutiveBrief | null; sessionId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pdf() {
    if (!brief || !sessionId) return;
    setBusy(true); setError("");
    try {
      const state = await api.session(sessionId);
      if (JSON.stringify(state.executive_brief) !== JSON.stringify(brief)) {
        throw new Error("Executive brief changed. Reload the assessment before exporting.");
      }
      download(await api.executiveBriefPdf(sessionId, state.version), "AgentSpark_Executive_Brief.pdf");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not export executive brief."); }
    finally { setBusy(false); }
  }
  return <Card title="Executive decision brief">
    {!brief ? <p>Not assessed in this historical snapshot. Rerun analysis to generate a brief.</p> : <>
      <h2 className="text-xl font-semibold">{brief.decision_label}</h2>
      <p className="mt-2">{brief.rationale}</p>
      <p className="text-xs mt-2">Advisory status: {brief.approval_status.replace(/_/g, " ")}. Not pilot authorization.</p>
      <dl className="grid gap-3 md:grid-cols-2 mt-4">
        {brief.claims.filter(claim => claim.label !== "Recommended decision").map(claim => <div key={claim.label}>
          <dt className="font-semibold">{claim.label}</dt><dd>{claim.statement}</dd>
          <dd className="text-xs text-slate-500">Basis: {claim.source_ids.join(", ")}</dd>
        </div>)}
      </dl>
      <p className="font-semibold mt-4">Next action</p><p>{brief.next_action}</p>
      <details className="mt-4"><summary>Risks, gaps and source evidence</summary>
        <ul className="list-disc pl-5">{brief.risks_and_gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
        {brief.sources.map(source => <div key={source.id} className="mt-3">
          <h3 className="font-semibold">{source.id} - {source.label}</h3>
          <p className="whitespace-pre-wrap break-words">{source.basis}</p>
        </div>)}
      </details>
      <p className="text-xs text-slate-500 mt-4">{brief.limitations}</p>
      <div className="flex gap-3 mt-4">
        <Button variant="ghost" onClick={() => download(new Blob([executiveBriefMarkdown(brief)], { type: "text/markdown" }),
          "AgentSpark_Executive_Brief.md")}>Export brief Markdown</Button>
        {sessionId && <Button variant="ghost" disabled={busy} onClick={() => void pdf()}>Export one-page brief PDF</Button>}
      </div>
      {error && <p role="alert" className="text-rose-700 mt-2">{error}</p>}
    </>}
  </Card>;
}

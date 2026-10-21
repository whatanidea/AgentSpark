import { useState } from "react";
import { api } from "../api";
import { Card, Button, Bar, Pill, Spinner, classColor } from "./ui";

export default function Portfolio() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try { setRows((await api.portfolio()).portfolio || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the sample portfolio. Please retry."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header className="page-header flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Explore / Prioritize opportunities</div>
          <h1>Portfolio Planner</h1>
          <p className="mt-2">Compare sample workflows so you know <b>what to build first</b>. Every score uses the same 12-criteria engine.</p>
        </div>
        <Button onClick={load} disabled={busy}>Score Backlog</Button>
      </header>

      {busy && <Card><Spinner /></Card>}
      {error && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{error}</p>}
      {!busy && rows.length === 0 && (
        <Card className="text-center py-14">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-teal-200 bg-teal-50 text-teal-700" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19h16M6 15V9m6 6V4m6 11v-5" strokeLinecap="round" /></svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Compare opportunities in one place</h2>
          <p className="max-w-md mx-auto mt-2 text-sm text-slate-500 leading-relaxed">Select Score Backlog to compare readiness, governance, and recommended patterns across fictional sample workflows.</p>
          <p className="text-xs text-slate-500 mt-5">Sample data only. This is not an assessment of your organization's backlog.</p>
        </Card>
      )}
      {rows.length > 0 && (
        <Card title="Sample workflow comparison" description="Fictional workflows, ranked by readiness. Review policy outcomes alongside each score.">
          <div className="space-y-6">
            {rows.map((r) => (
              <div key={r.workflow_name}>
                <div className="flex justify-between items-start flex-wrap gap-3 text-sm mb-3">
                  <span className="font-semibold text-slate-800">{r.workflow_name}</span>
                  <div className="flex items-center flex-wrap gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Pill tone={r.governance_decision === "REJECT" ? "red" : r.governance_decision === "HUMAN_REVIEW_REQUIRED" ? "amber" : "green"}>
                        {r.governance_decision}
                      </Pill>
                      <Pill tone={r.governance_risk === "Critical" || r.governance_risk === "High" ? "red" : r.governance_risk === "Medium" ? "amber" : "green"}>
                        {r.governance_risk} Risk
                      </Pill>
                    </div>
                    <span className="font-bold" style={{ color: classColor(r.classification) }}>{r.agent_score}/100</span>
                  </div>
                </div>
                <Bar pct={r.agent_score} color={classColor(r.classification)} />
                <p className="text-[11px] text-slate-500 mt-1">→ {r.recommended_pattern}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4">Sequence top-down: highest readiness delivers value soonest.</p>
        </Card>
      )}
    </div>
  );
}

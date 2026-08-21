import { useState } from "react";
import { api } from "../api";
import { Card, Button, Bar, Pill, Spinner, classColor } from "./ui";

export default function Portfolio() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try { setRows((await api.portfolio()).portfolio || []); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Portfolio Planner</h1>
          <p className="text-slate-400 mt-1">Score a whole backlog so you know <b>what to build first</b>. Every score is computed by the same 12-criteria engine.</p>
        </div>
        <Button onClick={load} disabled={busy}>📊 Score Backlog</Button>
      </header>

      {busy && <Card><Spinner /></Card>}
      {rows.length > 0 && (
        <Card>
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.workflow_name}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="font-bold text-slate-100">{r.workflow_name}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
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

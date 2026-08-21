import { useState } from "react";
import { api } from "../api";
import { Card, Button, Bar, Pill, Spinner, classColor } from "./ui";

export default function Analyze({ sessionId, goNext }: any) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (!sessionId) return;
    setBusy(true); setErr(""); setData(null);
    try {
      setData(await api.analyze(sessionId));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const score = data?.score;
  const strategy = data?.recommendation?.strategy || {};
  const roi = data?.roi;
  const governance = data?.governance;
  const patterns = data?.patterns || [];
  const trace = data?.trace || [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Agentification Readiness</h1>
          <p className="text-slate-400 mt-1">Diagnostic → Score (12 criteria) → Map → RAG Recommend → Validate → ROI → Blueprint.</p>
        </div>
        <Button onClick={run} disabled={!sessionId || busy}>▶ Run Multi-Agent Analysis</Button>
      </header>

      {!sessionId && <Card><p className="text-amber-300 text-sm">⚠️ Chat with the Diagnostic Agent first to describe a workflow.</p></Card>}
      {busy && <Card><Spinner label="Running the 7-stage agent flow…" /></Card>}
      {err && <Card><p className="text-rose-300 text-sm">❌ {err}</p></Card>}
      {data && !score && !busy && !err && (
        <Card><p className="text-amber-300 text-sm">
          ⚠️ No workflow captured yet. Open the <b>Diagnostic Agent</b>, describe a real workflow
          (or click “Use a sample answer”), then run the analysis.
        </p></Card>
      )}

      {score && (
        <>
          {/* Score + ROI */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-1">
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-extrabold" style={{ color: classColor(score.classification) }}>{score.agent_score}</span>
                <span className="text-slate-500 text-lg">/100</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill tone={score.classification === "High" ? "green" : score.classification === "Medium" ? "amber" : "red"}>{score.classification}</Pill>
                <Pill tone="slate">{score.autonomy_level}</Pill>
                <Pill tone={score.requires_hitl ? "amber" : "green"}>{score.requires_hitl ? "HITL required" : "HITL optional"}</Pill>
              </div>
              <p className="text-sm text-slate-300 mt-3 font-semibold">{score.recommended_pattern}</p>
              <p className="text-xs text-slate-500 mt-1">{score.explanation}</p>
            </Card>

            <Card title="Estimated ROI" className="lg:col-span-2">
              {roi ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Metric label="Cost saved / yr" value={`$${(roi.cost_saved_per_year || 0).toLocaleString()}`} color="#10b981" />
                    <Metric label="Hours saved / yr" value={(roi.hours_saved_per_year || 0).toLocaleString()} color="#a78bfa" />
                    <Metric label="ROI multiple" value={`${roi.roi_multiple}×`} color="#60a5fa" />
                    <Metric label="Payback" value={`${roi.payback_months} mo`} color="#f59e0b" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3">Assumptions: {roi.assumptions}</p>
                </>
              ) : <p className="text-slate-500 text-sm">—</p>}
            </Card>
          </div>

          {/* 12 criteria */}
          <Card title="12-Criteria Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {score.criteria?.map((c: any) => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">{c.name}</span>
                    <span className="text-slate-500">+{c.contribution}/{c.weight}</span>
                  </div>
                  <Bar pct={c.raw * 100} color={c.raw >= 0.66 ? "#10b981" : c.raw >= 0.33 ? "#f59e0b" : "#ef4444"} />
                  <p className="text-[11px] text-slate-500 mt-1">{c.rationale}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Recommendation + Validation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Architecture Recommendation">
              <p className="text-sm text-slate-200">{strategy.automation_strategy}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(strategy.recommended_patterns || []).map((p: string) => <Pill key={p}>{p}</Pill>)}
              </div>
              {strategy.confidence != null && <p className="text-xs text-slate-500 mt-2">Confidence: {Math.round(strategy.confidence * 100)}%</p>}
              <div className="text-xs text-slate-400 mt-3 space-y-1">
                <p><b className="text-slate-300">Memory:</b> {strategy.memory_strategy}</p>
                <p><b className="text-slate-300">Governance:</b> {strategy.governance}</p>
                <p><b className="text-slate-300">Why:</b> {strategy.justification}</p>
                {strategy.critique && <p className="text-amber-300/90"><b>⚠ Self-critique:</b> {strategy.critique}</p>}
              </div>
            </Card>

            <Card title="Enterprise Governance Dashboard">
              {governance && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Pill tone={governance.overall_risk === "Critical" || governance.overall_risk === "High" ? "red" : governance.overall_risk === "Medium" ? "amber" : "green"}>Overall Risk: {governance.overall_risk}</Pill>
                    <Pill tone={governance.decision === "REJECT" ? "red" : governance.decision === "HUMAN_REVIEW_REQUIRED" ? "amber" : "green"}>
                      {governance.decision === "REJECT" ? "🔴 Rejected" : governance.decision === "HUMAN_REVIEW_REQUIRED" ? "🟡 Human review required" : "🟢 Auto-approved"}
                    </Pill>
                  </div>
                  
                  {governance.reason && (
                    <p className="text-xs text-slate-300 mb-4 bg-white/5 p-2 rounded">
                      <b>Rationale:</b> {governance.reason}
                    </p>
                  )}

                  {governance.triggered_rules && governance.triggered_rules.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-slate-400 mb-1">Triggered Policies:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {governance.triggered_rules.map((rule: string) => (
                          <span key={rule} className="text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 font-mono">
                            {rule}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <details className="cursor-pointer group">
                    <summary className="text-sm font-semibold text-violet-300 mb-2">Show 8-Module Assessment Detail</summary>
                    <div className="space-y-3 mt-3 pt-3 border-t border-white/10">
                      {Object.entries(governance.assessments || {}).map(([name, a]: [string, any]) => (
                        <div key={name} className="text-xs bg-white/[0.02] p-2 rounded">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-slate-200">
                              {a.status === "pass" ? "✅" : a.status === "warn" ? "⚠️" : "❌"} {name}
                            </span>
                            <span className="text-[10px] text-slate-500 uppercase">{a.risk_level} Risk</span>
                          </div>
                          <p className="text-slate-400 mt-0.5">{a.reason}</p>
                          <p className="text-[10px] text-violet-300/80 mt-1">↳ {a.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </Card>
          </div>

          {/* Patterns + Trace */}
          <Card title="Retrieved Design Patterns (RAG)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {patterns.map((p: any) => (
                <div key={p.id || p.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-sm font-bold text-violet-300">{p.name} <span className="text-[10px] text-slate-500">· {p.category}</span></div>
                  <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                  <p className="text-[11px] text-slate-500 mt-1"><i>When:</i> {p.when_to_use}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Agent Trace · Observability">
            <div className="space-y-1">
              {trace.map((s: any) => (
                <div key={s.step} className="flex items-center gap-3 text-xs border-b border-white/5 py-1.5">
                  <span className="text-slate-600 w-5">{s.step}</span>
                  <span>{s.status === "ok" ? "✅" : s.status === "warn" ? "⚠️" : "❌"}</span>
                  <span className="font-bold text-violet-300 w-40">{s.agent}</span>
                  <span className="flex-1 text-slate-300">{s.detail}</span>
                  <span className="text-slate-600">{s.duration_ms} ms</span>
                </div>
              ))}
            </div>
            <div className="mt-4"><Button variant="ghost" onClick={goNext}>Generate Blueprint →</Button></div>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, color }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
      <div className="text-2xl font-extrabold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-1">{label}</div>
    </div>
  );
}

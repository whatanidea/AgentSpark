import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, Button, Bar, Pill, Spinner, classColor } from "./ui";
import AnalysisEvidence from "./AnalysisEvidence";
import { EvidenceSummary } from "./EvidenceRegister";
import { ReadinessSummary } from "./ImplementationReadiness";
import RuntimeDecisionSummary from "./RuntimeDecision";
import ExecutiveBriefSummary from "./ExecutiveBrief";
import ROIReport, { DEFAULT_ROI_ASSUMPTIONS, ROIAssumptionForm } from "./ROIReport";

function analysisData(s: any) {
  return !s || s.status === "init" ? null : {
    ...s, score: s.suitability_score, recommendation: s.architecture_recommendation, patterns: s.retrieved_patterns,
  };
}

export default function Analyze({ sessionId, active, initialSnapshot, onRefresh, onBusyChange, goNext }: any) {
  const [data, setData] = useState<any>(analysisData(initialSnapshot));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [assumptions, setAssumptions] = useState(initialSnapshot?.roi_assumptions || DEFAULT_ROI_ASSUMPTIONS);

  useEffect(() => {
    if (!active || !sessionId) return;
    let cancelled = false;
    setBusy(true); onBusyChange(true);
    api.session(sessionId).then((snapshot) => {
      if (cancelled) return;
      setData(analysisData(snapshot));
    }).catch((e: Error) => {
      if (!cancelled) { setData(null); setErr(e.message); }
    }).finally(() => { if (!cancelled) { setBusy(false); onBusyChange(false); } });
    return () => { cancelled = true; onBusyChange(false); };
  }, [active, sessionId]);

  async function run() {
    if (!sessionId) return;
    setBusy(true); onBusyChange(true); setErr(""); setData(null);
    try {
      setData(await api.analyze(sessionId, assumptions));
      await onRefresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); onBusyChange(false); }
  }

  const score = data?.score;
  const strategy = data?.recommendation?.strategy || {};
  const roi = data?.roi;
  const governance = data?.governance;
  const patterns = data?.patterns || [];
  const trace = data?.trace || [];

  return (
    <div className="space-y-6">
      <header className="page-header flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Step 03 / Evaluate the opportunity</div>
          <h1>Agentification Readiness</h1>
          <p className="mt-2">A grounded assessment of readiness, value, architecture, and governance.</p>
        </div>
        <Button aria-label="▶ Run Multi-Agent Analysis" onClick={run} disabled={!sessionId || busy}>Run Multi-Agent Analysis</Button>
      </header>

      {!sessionId && <Card><p className="text-amber-800 text-sm">⚠️ Chat with the Diagnostic Agent first to describe a workflow.</p></Card>}
      {busy && <Card><Spinner label="Running the 7-stage agent flow…" /></Card>}
      {err && <Card><p role="alert" className="text-rose-700 text-sm">❌ {err}</p></Card>}
      {data?.enterprise_context && <p className="notice">Assessment target: {data.enterprise_context.target_cloud === "aws" ? "AWS" : "Azure"}.
        {" "}Region: {data.enterprise_context.preferred_region || "not specified"} (unverified). This does not change AgentSpark hosting or deploy resources.</p>}
      {data && <ExecutiveBriefSummary brief={data.executive_brief} sessionId={sessionId} />}
      <ROIAssumptionForm value={assumptions} onChange={setAssumptions} disabled={busy} />
      <AnalysisEvidence diagnosis={data?.diagnosis} scenario={data?.demo_scenario} />
      {data && <EvidenceSummary report={data.evidence_report} />}
      {data && <ReadinessSummary report={data.readiness_report} />}
      {data && <RuntimeDecisionSummary decision={data.runtime_decision} />}
      {data?.status && score && (
        <Card title="Recommendation status">
          <p className="text-sm">
            {data.status === "rejected" ? "Rejected — no agentic blueprint is available."
              : data.status === "awaiting_human_review" ? "Provisional — open Blueprint to review this recommendation."
              : data.human_review?.decision === "approve" ? "Recommendation approved by a human reviewer."
              : "Recommendation auto-approved by policy."}
          </p>
          <p className="text-xs text-slate-500 mt-1">Approval is advisory; it does not execute or deploy a business workflow.</p>
        </Card>
      )}
      {data && !score && data.status !== "needs_clarification" && !busy && !err && (
        <Card><p className="text-amber-800 text-sm">
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
              <p className="text-sm text-slate-700 mt-3 font-semibold">{score.recommended_pattern}</p>
              <p className="text-xs text-slate-500 mt-1">{score.explanation}</p>
            </Card>

            <Card title="Estimated ROI" className="lg:col-span-2">
              {roi ? (
                <>
                  <ROIReport roi={roi} />
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
                    <span className="font-semibold text-slate-700">{c.name}</span>
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
              <p className="text-sm text-slate-700 leading-relaxed">{strategy.automation_strategy}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(strategy.recommended_patterns || []).map((p: string) => <Pill key={p}>{p}</Pill>)}
              </div>
              {strategy.data_completeness != null && <p className="text-xs text-slate-500 mt-2">Data completeness: {Math.round(strategy.data_completeness * 100)}% — not model confidence.</p>}
              <div className="text-xs text-slate-600 mt-3 space-y-2 leading-relaxed">
                <p><b className="text-slate-700">Memory:</b> {strategy.memory_strategy}</p>
                <p><b className="text-slate-700">Governance:</b> {strategy.governance}</p>
                <p><b className="text-slate-700">Why:</b> {strategy.justification}</p>
                {strategy.critique && <p className="text-amber-800"><b>⚠ Self-critique:</b> {strategy.critique}</p>}
              </div>
            </Card>

            <Card title="Original Policy Assessment">
              {governance && (
                <>
                  <div className="flex items-center flex-wrap gap-2 mb-3">
                    <Pill tone={governance.overall_risk === "Critical" || governance.overall_risk === "High" ? "red" : governance.overall_risk === "Medium" ? "amber" : "green"}>Overall Risk: {governance.overall_risk}</Pill>
                    <Pill tone={governance.decision === "REJECT" ? "red" : governance.decision === "HUMAN_REVIEW_REQUIRED" ? "amber" : "green"}>
                      {governance.decision === "REJECT" ? "🔴 Rejected" : governance.decision === "HUMAN_REVIEW_REQUIRED" ? "🟡 Human review required" : "🟢 Auto-approved"}
                    </Pill>
                  </div>
                  
                  {governance.reason && (
                    <p className="text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg leading-relaxed">
                      <b>Rationale:</b> {governance.reason}
                    </p>
                  )}

                  {governance.triggered_rules && governance.triggered_rules.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Triggered Policies:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {governance.triggered_rules.map((rule: string) => (
                          <span key={rule} className="text-[11px] bg-teal-50 text-teal-800 px-2 py-1 rounded border border-teal-200 font-mono">
                            {rule}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <details className="cursor-pointer group">
                    <summary className="text-sm font-semibold text-teal-700 mb-2">Show 8-Module Assessment Detail</summary>
                    <div className="space-y-3 mt-3 pt-3 border-t border-slate-200">
                      {Object.entries(governance.assessments || {}).map(([name, a]: [string, any]) => (
                        <div key={name} className="text-xs bg-slate-50 p-3 rounded-lg">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-slate-700">
                              {a.status === "pass" ? "✅" : a.status === "warn" ? "⚠️" : "❌"} {name === "Confidence" ? "Data Completeness (legacy policy key: Confidence)" : name}
                            </span>
                            <span className="text-[10px] text-slate-500 uppercase">{a.risk_level} Risk</span>
                          </div>
                          <p className="text-slate-600 mt-1 leading-relaxed">{a.reason}</p>
                          <p className="text-[11px] text-teal-700 mt-2">↳ {a.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </Card>
          </div>

          {/* Patterns + Trace */}
          <Card title="Grounded Design Patterns · Keyword retrieval + required design IDs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {patterns.map((p: any) => (
                <div key={p.id || p.name} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="text-sm font-semibold text-teal-800">{p.name} <span className="text-[11px] text-slate-500">· {p.category}</span></div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{p.description}</p>
                  <p className="text-[11px] text-slate-500 mt-1"><i>When:</i> {p.when_to_use}</p>
                  <a className="text-xs text-teal-700 underline break-words" href={p.source_url} target="_blank" rel="noreferrer">{p.id} · {p.source_ref}</a>
                  <p className="text-[10px] text-slate-500 break-all">Snapshot SHA256: {p.content_sha256}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Agent Trace · Observability">
            <div className="space-y-1">
              {trace.map((s: any) => (
                <div key={s.step} className="flex items-start flex-wrap sm:flex-nowrap gap-3 text-xs border-b border-slate-100 py-3">
                  <span className="text-slate-600 w-5">{s.step}</span>
                  <span>{s.status === "ok" ? "✅" : s.status === "warn" ? "⚠️" : "❌"}</span>
                  <span className="font-semibold text-teal-800 sm:w-36">{s.agent}</span>
                  <span className="flex-1 min-w-0 break-words text-slate-600">{s.detail}</span>
                  <span className="text-slate-500 whitespace-nowrap">{s.duration_ms} ms</span>
                </div>
              ))}
            </div>
            <div className="mt-4"><Button variant="ghost" onClick={goNext}>View Blueprint / Review Outcome →</Button></div>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, color }: any) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <div className="text-2xl font-extrabold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-1">{label}</div>
    </div>
  );
}

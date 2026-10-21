export default function ArchitectureDiagram({ bp }: { bp: {
  workflow_intelligence?: { workflow_name: string; systems: string[] };
  suitability_score?: { recommended_pattern: string; autonomy_level: string; requires_hitl: boolean };
  architecture_recommendation?: { mapping?: Record<string, string> };
  governance?: { decision: string };
} }) {
  const intel = bp.workflow_intelligence;
  const score = bp.suitability_score;
  const mapping = bp.architecture_recommendation?.mapping;
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 space-y-4 text-center">
      <h2 className="font-bold text-xl">{intel?.workflow_name} — proposed customer workflow</h2>
      <p className="text-sm text-slate-400">Design constraints, not a deployed system or AgentSpark's internal pipeline.</p>
      <div className="rounded-xl border border-white/10 p-3">Workflow input and validated case data</div>
      <p className="text-violet-300">↓</p>
      <div className="rounded-xl border border-violet-500/40 p-3">
        <b>{score?.recommended_pattern}</b><p className="text-xs mt-1">Autonomy: {score?.autonomy_level}</p>
      </div>
      <p className="text-violet-300">↓</p>
      <div className="rounded-xl border border-amber-500/30 p-3">
        {score?.requires_hitl ? "Mandatory human approval before consequential actions" : "Bounded action policy and exception review"}
        <p className="text-xs text-slate-400 mt-1">Advisory policy outcome: {bp.governance?.decision}</p>
      </div>
      <p className="text-violet-300">↓</p>
      <div className="rounded-xl border border-white/10 p-3">Existing systems: {intel?.systems.join(", ") || "None"} · Audit records</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-left">
        {Object.entries(mapping || {}).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-white/10 p-2"><b>{key}:</b> {value}</div>
        ))}
      </div>
    </div>
  );
}

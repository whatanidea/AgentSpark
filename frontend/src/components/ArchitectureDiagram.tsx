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
    <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-6 space-y-4 text-center">
      <h2 className="font-semibold text-xl text-slate-800">{intel?.workflow_name} — proposed customer workflow</h2>
      <p className="text-sm text-slate-500">Design constraints, not a deployed system or AgentSpark's internal pipeline.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">Workflow input and validated case data</div>
      <p className="text-teal-600" aria-hidden="true">↓</p>
      <div className="rounded-xl border border-teal-200 bg-white p-4 text-teal-900">
        <b>{score?.recommended_pattern}</b><p className="text-xs mt-1">Autonomy: {score?.autonomy_level}</p>
      </div>
      <p className="text-teal-600" aria-hidden="true">↓</p>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {score?.requires_hitl ? "Mandatory human approval before consequential actions" : "Bounded action policy and exception review"}
        <p className="text-xs text-amber-800 mt-2">Advisory policy outcome: {bp.governance?.decision}</p>
      </div>
      <p className="text-teal-600" aria-hidden="true">↓</p>
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">Existing systems: {intel?.systems.join(", ") || "None"} · Audit records</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-left">
        {Object.entries(mapping || {}).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-3 leading-relaxed"><b className="text-teal-800">{key}:</b> {value}</div>
        ))}
      </div>
    </div>
  );
}

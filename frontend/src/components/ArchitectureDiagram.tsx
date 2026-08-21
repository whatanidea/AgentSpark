// Data-driven agentic-architecture visual — rebuilds the rich diagram from the
// live analysis (workflow, readiness score, recommended Azure services).

const AGENTS = [
  { n: "Agent 1", t: "Diagnostic", d: "Interviews stakeholders; extracts workflow data via structured GPT-4o function calling." },
  { n: "Agent 2", t: "Mapping", d: "Maps the workflow to specific Microsoft Azure services via structured output." },
  { n: "Agent 3", t: "Recommendation", d: "Retrieves & composes patterns from a curated RAG library (Azure AI Search)." },
  { n: "Agent 4", t: "Blueprint", d: "Synthesizes an architecture document with starter code scaffolding." },
  { n: "Agent 5", t: "Validation", d: "Cross-checks compliance, audit & guardrails before human handoff." },
];

function Arrow({ label }: { label: string }) {
  return <div className="text-center text-[11px] font-bold text-violet-400/80 tracking-wide my-1">↓ {label} ↓</div>;
}

export default function ArchitectureDiagram({ bp }: { bp: any }) {
  const intel = bp?.workflow_intelligence || {};
  const score = bp?.suitability_score || {};
  const ctx = bp?.enterprise_context || {};
  const mapping = bp?.architecture_recommendation?.mapping || {};

  const workflow = intel.workflow_name || "Enterprise Workflow";
  const domain = ctx.business_domain || "Generic Domain";
  const systems = (intel.systems && intel.systems.length ? intel.systems.join(", ") : ctx.existing_systems) || "Enterprise Systems";
  const compliance = intel.compliance_sensitivity || "Low";
  const cls = score.classification || "N/A";
  const scoreColor = cls === "High" ? "#10b981" : cls === "Medium" ? "#f59e0b" : "#ef4444";

  const ai = mapping.ai || "Azure OpenAI (GPT-4o)";
  const search = mapping.search || "Azure AI Search";
  const database = mapping.database || "Azure Cosmos DB";
  const compute = mapping.compute || "Azure App Service";
  const orchestration = mapping.orchestration || "Azure AI Foundry + LangGraph";

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#160a30] via-[#1b0f3a] to-[#0a1628] p-6">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-violet-500/20 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xl font-extrabold bg-gradient-to-r from-fuchsia-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">AgentSense</span>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white">Agentic Architecture</span>
        </div>
        <div className="text-xs text-slate-400">Advisory for: <span className="text-violet-200 font-semibold">{workflow}</span></div>
      </div>

      {/* INPUT */}
      <div className="rounded-xl border border-violet-500/40 bg-white/[0.03] px-4 py-3 text-center">
        <div className="font-extrabold text-violet-100">📋 {workflow} — Workflow Input</div>
        <div className="text-xs text-slate-400 mt-1">
          Domain: <span className="text-violet-200">{domain}</span> · Systems: <span className="text-violet-200">{systems}</span> · Compliance: <span className="text-violet-200">{compliance}</span>
        </div>
      </div>

      <Arrow label="SUBMITTED TO ORCHESTRATOR" />

      {/* ORCHESTRATOR */}
      <div className="rounded-xl border border-violet-600/60 bg-gradient-to-r from-[#2d1260] to-[#1e0a40] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-extrabold text-violet-50">⚡ {orchestration} Orchestrator</div>
          <div className="text-[11px] text-violet-300">Central routing, agent invocation &amp; governance — single control authority</div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["Autonomy Policy", "Agent Sequencing", "Human Gates", "Audit Trail"].map((p) => (
            <span key={p} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-violet-400/40 text-violet-100 bg-violet-500/10">{p}</span>
          ))}
        </div>
      </div>

      <Arrow label="INVOKES & COORDINATES AGENTS" />

      {/* READINESS INDEX */}
      <div className="rounded-xl border border-violet-500/60 bg-gradient-to-r from-[#4c1d95] to-[#2e0a6e] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-extrabold text-violet-50">🎯 Agentification Readiness Index</div>
          <div className="text-[11px] text-violet-300">Single source of truth — referenced by all agents to score suitability</div>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white" style={{ background: scoreColor }}>Score: {score.agent_score ?? "–"}/100</span>
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white bg-indigo-600">{score.recommended_pattern || "Pattern"}</span>
        </div>
      </div>

      <Arrow label="ANCHORS ALL CORE AGENTS" />

      {/* AGENTS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {AGENTS.map((a) => (
          <div key={a.n} className="rounded-xl border border-violet-500/30 border-t-4 border-t-violet-500 bg-white/[0.03] p-3">
            <div className="text-[10px] font-extrabold uppercase text-violet-400">{a.n}</div>
            <div className="font-extrabold text-violet-50 text-sm mt-0.5">{a.t}</div>
            <div className="text-[11px] text-slate-400 mt-1 leading-snug">{a.d}</div>
          </div>
        ))}
      </div>

      <Arrow label="POWERED BY MICROSOFT AZURE" />

      {/* PLATFORM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Platform tone="blue" title="Azure AI Foundry" pills={[ai, "GPT-4o Reasoning", "Function Calling"]} />
        <Platform tone="teal" title="Knowledge & Code" pills={[search, "GitHub Copilot"]} />
        <Platform tone="green" title="Data & Hosting" pills={[database, compute]} />
      </div>

      {/* OUTPUTS */}
      <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-violet-300">Client Outputs</span>
        <div className="flex gap-3 flex-wrap text-xs text-violet-200 font-semibold">
          {["Blueprint Doc", "Score Report", "Code Scaffold", "Deploy Checklist", "ROI Estimate", "Risk Matrix"].map((o) => (
            <span key={o} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />{o}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Platform({ tone, title, pills }: { tone: string; title: string; pills: string[] }) {
  const tones: any = {
    blue: "from-[#0c1a3a] to-[#1e3a5f] border-blue-600/60",
    teal: "from-[#042f2e] to-[#0f3b3a] border-teal-600/60",
    green: "from-[#052e16] to-[#14532d] border-green-600/60",
  };
  const pillTone: any = {
    blue: "bg-blue-600/25 text-blue-200 border-blue-700/60",
    teal: "bg-teal-600/25 text-teal-200 border-teal-700/60",
    green: "bg-green-600/25 text-green-200 border-green-700/60",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 ${tones[tone]}`}>
      <div className="font-extrabold text-violet-50 text-sm mb-2">{title}</div>
      <div className="flex gap-1.5 flex-wrap">
        {pills.map((p) => <span key={p} className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${pillTone[tone]}`}>{p}</span>)}
      </div>
    </div>
  );
}

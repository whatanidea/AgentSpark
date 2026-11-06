import { useId, useState } from "react";
import type { ArchitectureView } from "../api";

type ArchitectureSnapshot = {
  architecture_view?: ArchitectureView | null;
  cloud_mapping?: Record<string, unknown> | null;
  workflow_intelligence?: { systems?: string[] } | null;
};

function serviceLabel(value: unknown): string {
  return typeof value === "string" ? value
    : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") || "Not recorded"
    : "Not recorded";
}

const roles = { software: "Ordinary software", ai: "Bounded AI", human: "Human decision" };
const tones = {
  software: "border-teal-200 bg-teal-50 text-teal-900",
  ai: "border-brand-200 bg-brand-50 text-brand-900",
  human: "border-amber-200 bg-amber-50 text-amber-900",
};

export function architectureViewMarkdown(view: ArchitectureView | null | undefined, mapping?: Record<string, unknown>) {
  if (!view) return "## Proposed workflow overview\nNo workflow-specific overview was recorded. Retained technical detail follows.\n";
  const text = (value: string) => value.replace(/([\\`*{}[\]<>#|])/g, "\\$1").replace(/\r?\n/g, " ");
  return `## Proposed outcome\n${text(view.outcome)}\n\n${text(view.why)}\n
## Connected responsibility flow
${view.flow.map((step, index) => `### ${index + 1}. ${text(step.title)} / ${roles[step.kind]}
${text(step.purpose)}
- Receives: ${text(step.receives)}
- Produces: ${text(step.produces)}
- Control: ${text(step.control)}
- Components: ${step.components.map(key => key === "systems" ? "Reported integrations" : `${key}: ${text(serviceLabel(mapping?.[key]))}`).join("; ") || "Accountable person"}
`).join("\n")}
## Key design trade-offs
${view.choices.map(choice => `- ${choice.component}: ${text(serviceLabel(mapping?.[choice.component]))}. ${text(choice.why)} Compare ${text(choice.alternative)}: ${text(choice.tradeoff)}`).join("\n")}

## Acceptance-based delivery milestones (not completed)
${view.milestones.map((milestone, index) => `${index + 1}. ${text(milestone.title)}: ${text(milestone.acceptance)}`).join("\n")}
`;
}

export default function ArchitectureDiagram({ bp }: { bp: ArchitectureSnapshot }) {
  const [selected, setSelected] = useState(0);
  const panelId = useId();
  const view = bp.architecture_view;
  if (!view) return <div className="notice notice-warning">
    No workflow-specific overview was recorded in this historical assessment. The retained technical detail is available below; rerun analysis to generate a connected overview.
  </div>;
  const step = view.flow[selected];
  return <section className="rounded-2xl border border-brand-200 bg-white p-4 sm:p-6 space-y-6 min-w-0" aria-label="Proposed architecture overview">
    <div>
      <div className="eyebrow mb-2">Proposed outcome / not deployed</div>
      <h2 className="text-xl font-semibold text-zinc-900 break-words">{view.outcome}</h2>
      <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{view.why}</p>
      <p className="text-xs text-zinc-500 mt-2">A proposed responsibility flow, not verified infrastructure or permission to execute. Read the recorded pilot criteria and evidence before approval.</p>
    </div>
    <div>
      <h3 className="font-semibold text-zinc-900">How the work connects</h3>
      <p className="text-sm text-zinc-500 mt-1 mb-4">Select a step to inspect the handoff, supporting services and control boundary.</p>
      <ol aria-label="Proposed workflow steps" className="space-y-0">
        {view.flow.map((item, index) => <li key={index}>
          <button type="button" aria-label={`Inspect step ${index + 1}: ${item.title}`}
            aria-pressed={selected === index} aria-controls={panelId} onClick={() => setSelected(index)}
            className={`w-full rounded-xl border p-4 text-left flex gap-3 items-start min-w-0 ${tones[item.kind]} ${selected === index ? "ring-2 ring-brand-400 ring-offset-2" : ""}`}>
            <span className="rounded-full bg-white border border-current text-sm font-semibold w-8 h-8 flex items-center justify-center shrink-0">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider block">{roles[item.kind]}</span>
              <span className="font-semibold block break-words">{item.title}</span>
              <span className="text-xs block mt-1 break-words">Output: {item.produces}</span>
            </span>
          </button>
          {index < view.flow.length - 1 && <div className="flex items-center gap-3 pl-7 py-2 text-zinc-500">
            <svg aria-hidden="true" width="16" height="24" viewBox="0 0 16 24" className="shrink-0">
              <path d="M8 0v20m-5-5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="text-[11px] break-words">Next receives: {view.flow[index + 1].receives}</span>
          </div>}
        </li>)}
      </ol>
    </div>
    {step && <div id={panelId} className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 space-y-3" aria-label="Selected workflow step">
      <h3 className="font-semibold">{selected + 1}. {step.title}</h3>
      <p className="text-sm text-zinc-600">{step.purpose}</p>
      <dl className="grid sm:grid-cols-2 gap-3 text-sm">
        <div><dt className="font-semibold">Receives</dt><dd className="break-words">{step.receives}</dd></div>
        <div><dt className="font-semibold">Produces</dt><dd className="break-words">{step.produces}</dd></div>
      </dl>
      <p className="text-sm"><b>Control boundary:</b> {step.control}</p>
      <div className="flex flex-wrap gap-2" aria-label="Supporting services">
        {step.components.map(key => <span key={key} className="text-xs bg-white rounded border border-zinc-200 p-2 break-words max-w-full">
          {key === "systems" ? bp.workflow_intelligence?.systems?.join(", ") || "No integrations recorded"
            : `${key}: ${serviceLabel(bp.cloud_mapping?.[key])}`}
        </span>)}
        {!step.components.length && <span className="text-xs text-zinc-500">Accountable person; not an autonomous tool action.</span>}
      </div>
    </div>}
    <div>
      <h3 className="font-semibold text-zinc-900 mb-3">Why these building blocks?</h3>
      <div className="grid lg:grid-cols-2 gap-3">
        {view.choices.map(choice => <div key={choice.component} className="rounded-xl border border-zinc-200 p-4 text-sm">
          <h4 className="font-semibold capitalize">{choice.component} decision</h4>
          <p className="text-brand-800 mt-1 break-words">{serviceLabel(bp.cloud_mapping?.[choice.component])}</p>
          <p className="mt-2 text-zinc-600">{choice.why}</p>
          <p className="mt-2"><b>Compare:</b> {choice.alternative}</p>
          <p className="mt-1 text-zinc-600">{choice.tradeoff}</p>
        </div>)}
      </div>
    </div>
    <div>
      <h3 className="font-semibold text-zinc-900 mb-3">Prove it before expanding</h3>
      <ol className="grid lg:grid-cols-3 gap-3">
        {view.milestones.map((milestone, index) => <li key={index} className="rounded-xl border border-zinc-200 p-4">
          <p className="text-xs text-brand-700 mb-1">Gate {index + 1} / not completed</p>
          <h4 className="font-semibold text-sm">{milestone.title}</h4>
          <p className="text-xs text-zinc-600 mt-2 leading-relaxed">{milestone.acceptance}</p>
        </li>)}
      </ol>
    </div>
  </section>;
}

import type { RuntimeDecision, RuntimeDecisionLayer, RuntimeRequirements } from "../api";
import { Card, Pill } from "./ui";

const STATUSES: Record<RuntimeDecision["status"], string> = {
  recommended: "Recommended", provisional: "Provisional", insufficient_information: "Insufficient information",
};
const REQUIREMENTS: Record<keyof RuntimeRequirements, string> = {
  reasoning: "Reasoning", duration: "Duration", external_waits: "External waits", recovery: "Recovery",
  side_effects: "Side effects", side_effect_safety: "Side-effect safety", existing_reasoning: "Existing reasoning",
  existing_runtime: "Existing runtime", runtime_hosting: "Runtime hosting", operational_owner: "Operational owner",
  scale_constraints: "Scale constraints", platform_constraints: "Platform constraints",
};
const ADVISORY = "Advisory architecture selection only. Deployment, availability and operational readiness are not verified; this does not authorize business actions.";
const entries = (decision: RuntimeDecision) =>
  (Object.keys(REQUIREMENTS) as (keyof RuntimeRequirements)[]).map(key => ({
    key, label: REQUIREMENTS[key], value: decision.requirements[key] || "Not supplied",
    provenance: decision.provenance[key] ?? decision.provenance[`runtime.${key}`],
  }));
const humanize = (value: string) => value.replace(/_/g, " ");

function Layer({ title, layer }: { title: string; layer: RuntimeDecisionLayer }) {
  return <section className="space-y-2 break-words">
    <h3 className="font-semibold">{title}: {layer.label}</h3>
    <p className="text-xs text-slate-500">Selected ID: {layer.selected ?? "None selected"}</p>
    <ul className="list-disc pl-5 text-sm">{layer.rationale.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
    <details>
      <summary className="cursor-pointer text-sm font-medium">{title} alternatives</summary>
      {layer.alternatives.length ? <ul className="space-y-3 mt-2 text-sm">{layer.alternatives.map(alternative =>
        <li key={alternative.id}>
          <strong>{alternative.label}</strong> ({alternative.id}) — {alternative.eligible ? "Eligible" : "Ineligible"}
          <p>{alternative.reason}</p>
          <ul className="list-disc pl-5">{alternative.tradeoffs.map((tradeoff, index) => <li key={index}>{tradeoff}</li>)}</ul>
        </li>)}</ul> : <p className="text-sm mt-2">No alternatives recorded.</p>}
    </details>
  </section>;
}

export default function RuntimeDecisionSummary({ decision }: { decision?: RuntimeDecision | null }) {
  if (!decision) return <Card title="Architecture Runtime Decision">
    <p className="text-sm">Runtime selection not assessed</p>
    <p className="text-xs text-slate-500 mt-2">No runtime decision was recorded in this snapshot. No selection is inferred from historical architecture text.</p>
  </Card>;
  return <Card title="Architecture Runtime Decision">
    <div className="space-y-4">
      <Pill tone={decision.status === "recommended" ? "green" : "amber"}>{STATUSES[decision.status]}</Pill>
      <p className="text-sm">{ADVISORY}</p>
      <p className="text-xs text-slate-500 break-words">Target: {decision.target_cloud === "aws" ? "AWS" : "Azure"}
        {" · "}Rules version: {decision.rules_version} · Catalog version: {decision.catalog_version}</p>
      <Layer title="Reasoning layer" layer={decision.reasoning} />
      <Layer title="Durable execution layer" layer={decision.durable_execution} />
      <section>
        <h3 className="font-semibold">Human and execution boundaries</h3>
        <ul className="list-disc pl-5 text-sm">{decision.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul>
      </section>
      <section>
        <h3 className="font-semibold">Runtime validation tasks</h3>
        {decision.validation_tasks.length ? <ul className="list-disc pl-5 text-sm">
          {decision.validation_tasks.map((task, index) => <li key={index}>{task}</li>)}
        </ul> : <p className="text-sm">No tasks recorded; this is not deployment verification.</p>}
      </section>
      <details>
        <summary className="cursor-pointer font-medium text-sm">Runtime requirements and provenance</summary>
        <dl className="mt-3 space-y-3 text-sm">{entries(decision).map(({ key, label, value, provenance }) =>
          <div key={key} className="break-words">
            <dt className="font-semibold">{label}</dt>
            <dd className="whitespace-pre-wrap">{value}</dd>
            <dd className="text-xs text-slate-500">{provenance
              ? `${humanize(provenance.status)} · ${humanize(provenance.source)}` : "Provenance not recorded"}</dd>
            {provenance?.quote && <dd className="text-xs whitespace-pre-wrap">Source quote: {provenance.quote}</dd>}
          </div>)}</dl>
      </details>
      <section className="text-sm whitespace-pre-wrap break-words">
        <h3 className="font-semibold">Runtime limitations</h3>
        <p>{decision.limitations || "No additional limitations recorded; deployment remains unverified."}</p>
      </section>
    </div>
  </Card>;
}

const escapeMarkdown = (value: string) => value.replace(/[\\`*_{}[\]<>#|!]/g, "\\$&").replace(/\r?\n/g, " ");

export function runtimeDecisionMarkdown(decision?: RuntimeDecision | null): string {
  if (!decision) return "## Architecture Runtime Decision\nRuntime selection not assessed\n";
  const text = escapeMarkdown;
  const list = (items: string[]) => items.map(item => `- ${text(item)}`).join("\n");
  const layer = (title: string, value: RuntimeDecisionLayer) => `### ${title}: ${text(value.label)}
Selected ID: ${text(value.selected ?? "None selected")}
${list(value.rationale)}

#### Alternatives
${value.alternatives.map(alternative => `- **${text(alternative.label)}** (${text(alternative.id)}) — ${alternative.eligible ? "Eligible" : "Ineligible"}: ${text(alternative.reason)}
${alternative.tradeoffs.map(tradeoff => `  - ${text(tradeoff)}`).join("\n")}`).join("\n") || "No alternatives recorded."}
`;
  return `## Architecture Runtime Decision
**Status:** ${STATUSES[decision.status]}
**Target cloud:** ${decision.target_cloud === "aws" ? "AWS" : "Azure"}
**Rules version:** ${text(decision.rules_version)}
**Catalog version:** ${text(decision.catalog_version)}

${ADVISORY}

${layer("Reasoning layer", decision.reasoning)}
${layer("Durable execution layer", decision.durable_execution)}
### Human and execution boundaries
${list(decision.boundaries)}

### Runtime validation tasks
${list(decision.validation_tasks) || "No tasks recorded; this is not deployment verification."}

### Runtime requirements and provenance
${entries(decision).map(({ label, value, provenance }) =>
    `- **${label}:** ${text(value)} — ${provenance
      ? `${humanize(provenance.status)} / ${humanize(provenance.source)}; Source quote: ${text(provenance.quote || "None recorded")}`
      : "Provenance not recorded"}`).join("\n")}

### Runtime limitations
${text(decision.limitations || "No additional limitations recorded; deployment remains unverified.")}
`;
}

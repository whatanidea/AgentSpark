import type { AdoptionAssessment, ImplementationReadinessReport } from "../api";
import { Card, Pill } from "./ui";

const LABELS: Record<AdoptionAssessment["opportunity"], string> = {
  supported: "Supported by stated requirements", potential: "Potential - validate reasoning",
  not_indicated: "Not established by current evidence",
};
const text = (value: string) => value.replace(/[\\`*_{}[\]<>#|!]/g, "\\$&").replace(/\r?\n/g, " ");
const list = (items: string[]) => items.map(item => `- ${text(item)}`).join("\n");

export default function AgenticAdoption({ adoption, readiness }: {
  adoption?: AdoptionAssessment | null; readiness?: ImplementationReadinessReport | null;
}) {
  if (!adoption) return <Card title="Agentic adoption assessment">
    <p className="text-sm">Not recorded in this historical assessment. Rerun analysis to assess opportunity separately from autonomy and delivery readiness.</p>
  </Card>;
  const section = (title: string, items: string[]) => <section>
    <h3 className="font-semibold">{title}</h3>
    <ul className="list-disc pl-5 text-sm space-y-1">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
  </section>;
  return <Card title="Agentic adoption assessment">
    <div className="space-y-4 break-words">
      <div className="grid gap-4 md:grid-cols-3">
        <section>
          <h3 className="font-semibold mb-2">Agentic opportunity</h3>
          <Pill tone={adoption.opportunity === "supported" ? "positive" : "amber"}>{LABELS[adoption.opportunity]}</Pill>
          <p className="text-sm mt-2">{adoption.design_label}</p>
        </section>
        <section>
          <h3 className="font-semibold">Permitted autonomy</h3>
          <p className="text-sm mt-2">Read-only pilot and draft outputs. Humans control consequential actions. No production authority is granted.</p>
        </section>
        <section>
          <h3 className="font-semibold">Delivery readiness</h3>
          <p className="text-sm mt-2">{readiness?.decision.replace(/_/g, " ") || "Not assessed"}</p>
          <p className="text-xs text-zinc-500 mt-1">{adoption.readiness_basis}</p>
        </section>
      </div>
      <p className="text-sm">{adoption.decision_basis}</p>
      <p className="text-sm"><strong>Baseline:</strong> {adoption.current_approach}</p>
      {section("Why this candidate", adoption.rationale)}
      {adoption.questions.length > 0 && section("Validate before adding complexity", adoption.questions)}
      <div className="grid gap-4 md:grid-cols-2">
        {section("Keep deterministic", adoption.deterministic_responsibilities)}
        {section("Proposed AI / agent scope", adoption.proposed_agent_responsibilities)}
      </div>
      {section("Human and tool boundaries", adoption.human_boundaries)}
      <p className="text-sm"><strong>Bounded pilot:</strong> {adoption.pilot_scope}</p>
      <details>
        <summary className="cursor-pointer font-medium text-sm">Pilot measures, stop conditions and evidence</summary>
        <div className="mt-3 space-y-4">
          {section("Agree measurable success thresholds", adoption.success_criteria)}
          {section("Stop / reject expansion", adoption.stop_conditions)}
          {section("Expansion requires", adoption.expansion_conditions)}
          <section>
            <h3 className="font-semibold">Input provenance - not independent verification</h3>
            <dl className="text-sm space-y-2">{adoption.evidence.map(item => <div key={item.field_id}>
              <dt className="font-medium">{item.field_id}: {item.value || "Not supplied"}</dt>
              <dd>{item.source.replace(/_/g, " ")}</dd>
              {item.quote && <dd className="whitespace-pre-wrap">Source quote: {item.quote}</dd>}
              {item.reference && <dd className="text-xs">{item.reference}</dd>}
            </div>)}</dl>
          </section>
          <p className="text-xs text-zinc-500">Rules: {adoption.rules_version}. No measured improvement or deployment approval is implied.</p>
        </div>
      </details>
    </div>
  </Card>;
}

export function adoptionMarkdown(adoption?: AdoptionAssessment | null): string {
  if (!adoption) return "## Agentic adoption assessment\nNot recorded; rerun analysis. No modern opportunity assessment is inferred from historical scores.\n";
  return `## Agentic adoption assessment
**Opportunity:** ${LABELS[adoption.opportunity]}
**Candidate:** ${text(adoption.design_label)}
**Rules:** ${adoption.rules_version}
${text(adoption.decision_basis)}
**Delivery readiness:** ${text(adoption.readiness_basis)}
**Baseline:** ${text(adoption.current_approach)}

### Why this candidate
${list(adoption.rationale)}
### Questions before complexity
${list(adoption.questions)}
### Keep deterministic
${list(adoption.deterministic_responsibilities)}
### Proposed agent scope
${list(adoption.proposed_agent_responsibilities)}
### Human and tool boundaries
${list(adoption.human_boundaries)}
### Bounded pilot
${text(adoption.pilot_scope)}
### Measurable success criteria
${list(adoption.success_criteria)}
### Stop conditions
${list(adoption.stop_conditions)}
### Expansion conditions
${list(adoption.expansion_conditions)}
### Input provenance - not independent verification
${adoption.evidence.map(item => `- ${text(item.field_id)}: ${text(item.value || "Not supplied")}; ${text(item.source)}; quote: ${text(item.quote || "None recorded")}; reference: ${text(item.reference || "Not recorded")}`).join("\n")}
`;
}

import type { DiscoveryOrigin } from "../api";

const alternativeNames = {
  unchanged: "Leave unchanged", process_improvement: "Process improvement",
  deterministic_automation: "Deterministic automation", ai_assistance: "AI assistance", hybrid: "Hybrid",
};

export default function DiscoveryOriginSummary({ origin }: { origin: DiscoveryOrigin }) {
  return <section aria-label="Reviewed discovery provenance" className="space-y-3 break-words">
    {(origin.processes || []).map(process => <article key={process.id}>
      <h3 className="font-semibold">Process: {process.title}</h3>
      <p>Owner: {process.process_owner}. Goal: {process.goal}</p>
      <p>Bounded scope: {process.scope}</p>
      <p>Systems: {process.systems}. Volume: {process.volume}. Baseline: {process.baseline_pain}</p>
      <ol>{process.steps.map(step => <li key={step.id}>Step: {step.title} — {step.work} / {step.systems}</li>)}</ol>
    </article>)}
    {!!origin.alternatives?.length && <div>
      <h3 className="font-semibold">Human-written delivery comparison</h3>
      <p>Preferred approach: {origin.preferred_alternative ? alternativeNames[origin.preferred_alternative] : "Not selected"}</p>
      <dl>{origin.alternatives.map(alternative => <div key={alternative.kind}>
        <dt className="font-medium">{alternativeNames[alternative.kind]}</dt><dd>{alternative.rationale}</dd>
      </div>)}</dl>
    </div>}
    <h3 className="font-semibold">Source-linked statements, not confirmed assessment facts</h3>
    <ul>{origin.sources.map(source => <li key={source.id}>
      <strong>{source.label}</strong>: {source.statement}
      {source.source_reference && <p>Reference: {source.source_reference}. Basis: {source.basis?.replace(/_/g, " ") || "Self-reported"}.
        Human review: {source.review_status?.replace(/_/g, " ") || "Not reviewed"}.</p>}
    </li>)}</ul>
    {(origin.source_reviews || []).map(review => <p key={review.id}>
      Human review: {review.status.replace(/_/g, " ")} — {review.rationale}
    </p>)}
  </section>;
}

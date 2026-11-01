const steps = [
  { title: "Existing business inputs", kind: "rules", label: "Inputs to validate",
    detail: "An invoice and relevant business records provide the context for the proposed checks." },
  { title: "AI-assisted checks", kind: "assist", label: "Suggestions, not actions",
    detail: "Suggest possible duplicates or missing information, with references to the source material." },
  { title: "Human approval", kind: "human", label: "A person decides",
    detail: "An authorized approver checks the evidence and accepts, changes or rejects the proposal." },
  { title: "Existing business workflow", kind: "rules", label: "Only after authorization",
    detail: "An authorized person acts in the current system. AI suggestions do not approve or pay an invoice." },
] as const;

export default function ArchitectureIllustration() {
  return <figure className="architecture-illustration" aria-labelledby="architecture-example-title">
    <div className="architecture-example-heading">
      <div><p className="landing-eyebrow">From a proposed design to controlled work</p>
        <h2 id="architecture-example-title">Invoice assistance, with people in control.</h2></div>
      <span className="landing-demo-label">Fictional design</span>
    </div>
    <p className="architecture-example-intro">One possible customer implementation. This is not AgentSpark's internal architecture or a connected, deployed workflow.</p>
    <ol className="architecture-flow" role="list" aria-label="Illustrative invoice assistance flow">
      {steps.map((step, index) => <li key={step.title} data-kind={step.kind}>
        <span className="architecture-step-number">0{index + 1}</span>
        <h3>{step.title}</h3><p>{step.detail}</p>
        <strong className="architecture-step-boundary">{step.label}</strong>
        {index < steps.length - 1 && <span className="architecture-connector" aria-hidden="true">
          <svg width="36" height="24" viewBox="0 0 36 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 12h28M24 5l7 7-7 7" />
          </svg>
        </span>}
      </li>)}
    </ol>
    <div className="architecture-design-controls">
      <div><h3>Rules and orchestration</h3><p>Field validation, routing, state and bounded retries belong in the workflow, not inside a model prompt.</p></div>
      <div><h3>Controls to validate</h3><p>Scoped access, decision logs, escalation paths and pilot quality targets must be designed and tested.</p></div>
    </div>
    <div className="architecture-delivery-boundary">
      <div><h3>What AgentSpark provides</h3><p>An assessment, proposed cloud-aligned blueprint and advisory review record.</p></div>
      <div><h3>What your delivery team still does</h3><p>Validate data, build integrations, establish permissions, test controls and deploy the approved design.</p></div>
    </div>
    <figcaption>Static illustration only. No model calls, saved records or connected business systems.
      Approval in AgentSpark is advisory; it does not authorize actions in your business systems.</figcaption>
  </figure>;
}

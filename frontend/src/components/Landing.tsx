import { useState } from "react";
import type { CloudProvider } from "../api";
import Icon, { type IconName } from "./Icon";
import "./Landing.css";

type Step = { title: string; kind: "assist" | "rules" | "human"; detail: string; gap: string; azure: string; aws: string };
type Example = { name: string; icon: IconName; team: string; steps: Step[] };

const EXAMPLES: Example[] = [
  { name: "Insurance claims", icon: "claims", team: "Claims operations", steps: [
    { title: "Receive a claim", kind: "rules", detail: "Register the request and check required fields with predictable validation rules.", gap: "Validate portal API permissions and duplicate-handling rules.", azure: "Azure Functions", aws: "AWS Lambda" },
    { title: "Read the documents", kind: "assist", detail: "Extract information and flag uncertain fields for a person to check. Not every document needs an agent.", gap: "Measure extraction quality on representative, approved test data.", azure: "Azure AI Document Intelligence", aws: "Amazon Textract" },
    { title: "Prepare the evidence", kind: "assist", detail: "Propose a source-linked summary for an examiner, without deciding coverage.", gap: "Validate source traceability, model access and data handling.", azure: "Azure OpenAI + Azure AI Search", aws: "Amazon Bedrock + Amazon OpenSearch Service" },
    { title: "Examiner decision", kind: "human", detail: "A human examiner decides the outcome. Payment authorization stays with authorized people.", gap: "Confirm examiner ownership, escalation rules and approval boundaries.", azure: "Human review + existing claims portal", aws: "Human review + existing claims portal" },
  ] },
  { name: "Invoice processing", icon: "finance", team: "Finance operations", steps: [
    { title: "Receive an invoice", kind: "rules", detail: "Capture the invoice and validate required fields without an open-ended agent loop.", gap: "Confirm mailbox or ERP sandbox access and document retention.", azure: "Azure Logic Apps", aws: "AWS Step Functions + AWS Lambda" },
    { title: "Extract the details", kind: "assist", detail: "Extract line items and flag low-confidence values for review.", gap: "Test accuracy across invoice layouts, currencies and languages.", azure: "Azure AI Document Intelligence", aws: "Amazon Textract" },
    { title: "Resolve a mismatch", kind: "assist", detail: "Gather purchase-order evidence and propose a resolution for exceptions.", gap: "Validate purchase-order access and source-linked explanations.", azure: "Azure OpenAI + Azure Functions", aws: "Amazon Bedrock + AWS Lambda" },
    { title: "Authorize payment", kind: "human", detail: "Finance approves exceptions and payment release. No automated spending authority is implied.", gap: "Confirm separation of duties and authorized payment approvers.", azure: "Human review + existing ERP", aws: "Human review + existing ERP" },
  ] },
  { name: "Employee onboarding", icon: "portfolio", team: "People operations", steps: [
    { title: "Register a new hire", kind: "rules", detail: "Validate approved hiring inputs and create a tracked onboarding request.", gap: "Confirm HR system permissions and approved data fields.", azure: "Azure Logic Apps", aws: "AWS Step Functions" },
    { title: "Assemble the plan", kind: "assist", detail: "Draft an onboarding checklist from approved policies and the person's role.", gap: "Validate policy freshness and avoid unnecessary personal data.", azure: "Azure OpenAI + Azure AI Search", aws: "Amazon Bedrock + Amazon OpenSearch Service" },
    { title: "Coordinate tasks", kind: "rules", detail: "Route known tasks to HR, IT and managers with explicit retry and escalation rules.", gap: "Confirm integration owners and failure-handling procedures.", azure: "Azure Functions + Azure Service Bus", aws: "AWS Lambda + Amazon SQS" },
    { title: "Approve access", kind: "human", detail: "Authorized managers approve access. The assistant does not grant itself permissions.", gap: "Confirm least privilege, access reviewers and audit requirements.", azure: "Human review + existing identity system", aws: "Human review + existing identity system" },
  ] },
];
const KINDS = { assist: "AI assistance", rules: "Deterministic rules", human: "Human decision" };
const VIEWS = ["Suitability", "Readiness", "Business case", "Blueprint"] as const;
type Preview = typeof VIEWS[number];

export default function Landing({ onStart, onWorkspace, disabled, hasSession, signedIn, message }: {
  onStart: () => void; onWorkspace: () => void; disabled: boolean; hasSession: boolean;
  signedIn: boolean; message: string;
}) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(2);
  const [preview, setPreview] = useState<Preview>("Suitability");
  const [cloud, setCloud] = useState<CloudProvider>("azure");
  const [volume, setVolume] = useState(100);
  const example = EXAMPLES[exampleIndex];
  const step = example.steps[stepIndex];
  const startLabel = hasSession ? "Open your workspace" : "Assess my workflow";

  return <div className="landing">
    <a className="landing-skip" href="#landing-main">Skip to content</a>
    <header className="landing-nav landing-container">
      <a className="landing-brand" href="#top" aria-label="AgentSpark overview">
        <span className="landing-brand-mark" aria-hidden="true">✦</span> AgentSpark
      </a>
      <nav aria-label="Product navigation">
        <a href="#how-it-works">How it works</a><a href="#deliverables">What you get</a>
        <button className="landing-link" disabled={disabled} onClick={onWorkspace}>{signedIn ? "Workspace" : "Sign in"}</button>
      </nav>
    </header>

    <main id="landing-main">
      <section id="top" className="landing-hero landing-container" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span aria-hidden="true" /> A clearer path to enterprise AI</div>
          <h1 id="landing-title">Find where<br />AI agents fit.<br /><span>Before you build.</span></h1>
          <p>Turn one business workflow into an informed AI decision. Explore the fit, uncover the gaps, and create a blueprint your team can review.</p>
          <div className="landing-actions">
            <button className="landing-button landing-button-primary" disabled={disabled} onClick={onStart}>{startLabel} <span aria-hidden="true">↗</span></button>
            <a className="landing-button landing-button-secondary" href="#workflow-explorer">Explore an example <span aria-hidden="true">↓</span></a>
          </div>
          <p className="landing-fine">One workflow. Up to 10 guided interview rounds. A reviewable next step.</p>
          {message && <p role="status" className="landing-feedback">{message}</p>}
          <div className="landing-hero-proof"><span>Evidence, not guesswork</span><span>Human oversight built in</span></div>
        </div>

        <div id="workflow-explorer" className="landing-explorer">
          <div className="landing-explorer-top"><span className="landing-live-dot" aria-hidden="true" /><span>WORKFLOW EXPLORER</span><span className="landing-demo-label">Illustrative example</span></div>
          <h2>Start with the work.<br />Not the technology.</h2>
          <p className="landing-explorer-intro">Choose a workflow. Select a step to see where assistance belongs.</p>
          <div className="landing-example-picker" role="group" aria-label="Example workflow">
            {EXAMPLES.map((item, index) => <button key={item.name} aria-pressed={exampleIndex === index}
              onClick={() => { setExampleIndex(index); setStepIndex(2); }}>
              <Icon name={item.icon} className="h-4 w-4" />{item.name}
            </button>)}
          </div>
          <div className="landing-flow" role="group" aria-label={`${example.name} steps`}>
            {example.steps.map((item, index) => <button key={item.title} className={`landing-node landing-node-${item.kind}`}
              aria-pressed={stepIndex === index} aria-label={`Step ${index + 1}: ${item.title}`}
              onClick={() => setStepIndex(index)}>
              <span className="landing-node-number">{String(index + 1).padStart(2, "0")}</span>
              <span>{item.title}</span><small>{KINDS[item.kind]}</small>
            </button>)}
          </div>
          <div className="landing-step-detail" aria-live="polite" aria-atomic="true">
            <span className={`landing-kind landing-kind-${step.kind}`}>{KINDS[step.kind]}</span>
            <h3>{step.title}</h3><p>{step.detail}</p>
            <div className="landing-gap"><span aria-hidden="true">◇</span><p><strong>Before a pilot</strong>{step.gap}</p></div>
          </div>
          <p className="landing-explorer-note">Explore freely. No sign-in, model calls or saved assessment from these examples.</p>
        </div>
      </section>

      <section className="landing-principles" aria-label="Assessment principles">
        <div className="landing-container"><span>Not everything needs an agent.</span><p>Keep rules predictable. Use AI where it helps. Keep people accountable.</p></div>
      </section>

      <section id="how-it-works" className="landing-section landing-container" aria-labelledby="how-title">
        <div className="landing-section-heading"><div><p className="landing-eyebrow">From possibility to a plan</p><h2 id="how-title">Less AI guesswork.<br />More forward motion.</h2></div>
          <p>A structured path from how work happens today to what a responsible pilot would need.</p></div>
        <ol className="landing-journey">
          {[
            ["Describe", "Bring one workflow", "Capture the steps, systems, volumes and human decisions in a bounded interview."],
            ["Assess", "Understand the fit", "Explore suitability, proposed patterns and an estimated business case."],
            ["Validate", "Make the gaps visible", "Record integration, data, security and operational findings with owners and evidence."],
            ["Review", "Decide what comes next", "Review the proposed blueprint and export a report. Approval is advisory, not execution authority."],
          ].map(([label, title, detail], index) => <li key={label}>
            <div className="landing-journey-number">0{index + 1}<span>{label}</span></div><h3>{title}</h3><p>{detail}</p>
          </li>)}
        </ol>
      </section>

      <section id="deliverables" className="landing-deliverables" aria-labelledby="deliverables-title">
        <div className="landing-container">
          <div className="landing-section-heading"><div><p className="landing-eyebrow">An assessment you can actually use</p><h2 id="deliverables-title">See the decision.<br />And what sits behind it.</h2></div>
            <p>This preview follows <strong>{example.name.toLowerCase()}</strong>. Change the workflow above to explore another example.</p></div>
          <div className="landing-preview-grid">
            <div className="landing-preview-menu" role="group" aria-label="Deliverable preview">
              {VIEWS.map((item, index) => <button key={item} aria-pressed={preview === item} onClick={() => setPreview(item)}>
                <span>0{index + 1}</span><strong>{item}</strong><span aria-hidden="true">↗</span>
              </button>)}
              <p>Illustrative content, not a scored assessment or a verified implementation plan.</p>
            </div>
            <div className="landing-preview-card">
              <div className="landing-preview-caption"><span>{example.team}</span><span>EXAMPLE / {preview.toUpperCase()}</span></div>
              <div className="landing-preview-content" aria-live="polite">
                {preview === "Suitability" && <>
                  <h3>A good fit is not an all-or-nothing decision.</h3>
                  <p>Explore the role of each step, rather than assuming the whole process should be autonomous.</p>
                  <div className="landing-fit-list">{example.steps.map(item => <div key={item.title}><span>{item.title}</span>
                    <span className={`landing-kind landing-kind-${item.kind}`}>{KINDS[item.kind]}</span></div>)}</div>
                  <p className="landing-preview-footnote">Your actual assessment scores 12 criteria from supplied workflow facts. No score is calculated in this preview.</p>
                </>}
                {preview === "Readiness" && <>
                  <h3>Unknowns belong in the plan.</h3><p>For the selected step: <strong>{step.title.toLowerCase()}</strong>.</p>
                  <div className="landing-readiness-example"><span className="landing-kind landing-kind-human">Needs validation</span>
                    <h4>{step.gap}</h4><p>Owner: Unassigned · Evidence: Not supplied</p></div>
                  <p className="landing-preview-footnote">The full report covers integration access, data, security, human oversight, cloud prerequisites and operations. Findings and attestations are not automated verification.</p>
                </>}
                {preview === "Business case" && <>
                  <h3>Make the assumptions visible.</h3><p>Move the volume to explore a simple capacity illustration, not your actual ROI.</p>
                  <label className="landing-slider-label" htmlFor="example-volume">Illustrative workflows per day <output htmlFor="example-volume">{volume}</output></label>
                  <input id="example-volume" className="landing-slider" type="range" min="10" max="500" step="10" value={volume} onChange={event => setVolume(Number(event.target.value))} />
                  <div className="landing-value"><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(volume * 220 * 3 / 60 * 40)}</strong><span>Illustrative gross annual capacity value</span></div>
                  <p className="landing-preview-footnote">{volume} workflows/day × 220 days × 3 minutes saved ÷ 60 × $40/hour. Excludes delivery costs, adoption and operating costs; not net savings or a forecast. Actual reports include ROI assumptions and scenarios.</p>
                </>}
                {preview === "Blueprint" && <>
                  <h3>Your workflow. A cloud-aligned starting point.</h3>
                  <div className="landing-cloud-picker" role="group" aria-label="Example target cloud">
                    {(["azure", "aws"] as const).map(item => <button key={item} aria-pressed={cloud === item} onClick={() => setCloud(item)}>{item === "azure" ? "Azure" : "AWS"}</button>)}
                  </div>
                  <div className="landing-cloud-diagram"><span>{step.title}</span><span aria-hidden="true">↓</span><strong>{step[cloud]}</strong><span aria-hidden="true">↓</span><span>Human oversight &amp; operational controls</span></div>
                  <p className="landing-preview-footnote">Conceptual service candidates for the selected step, not provisioned resources. Availability, residency, permissions and pricing need validation. AgentSpark itself remains Azure-hosted.</p>
                </>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-container landing-report-section" aria-labelledby="report-title">
        <div className="landing-report-copy"><p className="landing-eyebrow">Built for the conversation after the demo</p>
          <h2 id="report-title">A report to review.<br />Not another black box.</h2>
          <p>Bring suitability, implementation gaps, evidence, ROI assumptions and the proposed architecture into one downloadable PDF.</p>
          <ul><li>Keep proposed findings separate from verified facts.</li><li>Make approval status and human decisions explicit.</li><li>Share a versioned assessment, not a promise of deployment.</li></ul>
          <button className="landing-button landing-button-secondary" disabled={disabled} onClick={onStart}>Create your assessment report <span aria-hidden="true">↗</span></button>
        </div>
        <article className="landing-report" aria-label="Illustrative report cover">
          <div className="landing-report-top"><span>✦ AgentSpark</span><span>REPORT PREVIEW</span></div>
          <span className="landing-report-status">ILLUSTRATIVE · NOT APPROVED</span>
          <h3>Workflow<br />Assessment</h3><p>{example.name}</p>
          <div className="landing-report-rule" />
          <ol>{["Suitability & rationale", "Evidence & assumptions", "Implementation readiness", "Business case scenarios", "Proposed blueprint & review"].map((item, index) => <li key={item}><span>0{index + 1}</span>{item}</li>)}</ol>
          <p className="landing-report-note">This cover is an example, not a generated report. Create an assessment to export your own PDF.</p>
        </article>
      </section>

      <section className="landing-final landing-container" aria-labelledby="final-title">
        <span className="landing-final-spark" aria-hidden="true">✦</span><p className="landing-eyebrow">Start small. Decide with clarity.</p>
        <h2 id="final-title">Your next AI project<br />starts with one workflow.</h2><p>No autonomous business actions. No deployment implied.<br />Just a clearer, evidence-led next step.</p>
        <button className="landing-button landing-button-primary" disabled={disabled} onClick={onStart}>{startLabel} <span aria-hidden="true">↗</span></button>
      </section>
    </main>
    <footer className="landing-footer landing-container"><span>AgentSpark <small>The agent that tells you where agents belong.</small></span><p>Advisory assessment, not compliance certification.</p><a href="#top">Back to top ↑</a></footer>
  </div>;
}

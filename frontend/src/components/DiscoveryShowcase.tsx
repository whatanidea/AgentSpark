import { useState } from "react";

const stages = ["Discover", "Synthesize", "Prioritize", "Assess"] as const;
const sources = [
  ["S1", "Business operator", "We repeat invoice checks. Finance owns exception decisions."],
  ["S2", "Process owner", "Procurement owns exception decisions. Baseline volumes are unconfirmed."],
  ["S3", "Technical owner", "API access and data quality still need validation."],
];

export default function DiscoveryShowcase() {
  const [stage, setStage] = useState<typeof stages[number]>("Discover");
  return <article id="discovery-showcase" className="discovery-showcase" aria-label="Illustrative discovery walkthrough">
    <div className="showcase-top"><span>DISCOVERY TO DECISION</span><span className="showcase-example">Fictional example</span></div>
    <div className="showcase-project"><span className="showcase-project-icon" aria-hidden="true">↗</span>
      <div><p>Finance discovery</p><h2>Less duplicate work.<br />A clearer next step.</h2></div></div>
    <div className="showcase-stages" role="group" aria-label="Discovery preview stage">
      {stages.map((name, index) => <button key={name} aria-pressed={stage === name} onClick={() => setStage(name)}>
        <span>0{index + 1}</span>{name}
      </button>)}
    </div>
    <div className="showcase-content" aria-live="polite">
      {stage === "Discover" && <>
        <div className="showcase-caption"><h3>Hear the different perspectives.</h3><span>3 role contributions</span></div>
        <div className="showcase-sources">{sources.map(([id, role, statement]) => <div key={id}>
          <span className="showcase-source-id">{id}</span><div><strong>{role}</strong><p>{statement}</p></div>
        </div>)}</div>
      </>}
      {stage === "Synthesize" && <>
        <h3>Find the themes. Keep the differences.</h3>
        <div className="showcase-finding"><span>Reported friction</span><strong>Repeated invoice checks</strong><p>Investigate where the same work is done twice. <small>Source: S1</small></p></div>
        <div className="showcase-finding showcase-finding-unknown"><span>Disagreement to resolve</span><strong>Who owns exception decisions?</strong><p>Finance and Procurement ownership statements differ. <small>Sources: S1, S2</small></p></div>
        <p className="showcase-open-question">Open question: what baseline and access can be validated? <small>Sources: S2, S3</small></p>
      </>}
      {stage === "Prioritize" && <>
        <h3>Make the shortlist explainable.</h3>
        <div className="showcase-rank"><div><span>01 / Source-linked hypothesis</span><strong>Investigate duplicate invoice checks</strong></div><b>80<small>/100</small></b></div>
        <div className="showcase-rank showcase-rank-unknown"><div><span>02 / Incomplete assumptions</span><strong>Redesign exception routing</strong></div><span>Not ranked</span></div>
        <details className="showcase-assumptions"><summary>See the illustrative rating assumptions</summary>
          <p>Value 5 (30%), feasibility 4 (25%), confidence 3 (20%), risk 2 (15%), effort 1 (10%).</p>
          <p>Positive ratings use (rating - 1) / 4; risk and effort use (5 - rating) / 4. Assumed ratings produce 80/100, not measured savings or verified confidence.</p>
        </details>
        <p className="showcase-open-question">Missing ratings or evidence references withhold a score. Unknown is not zero.</p>
      </>}
      {stage === "Assess" && <>
        <h3>Review the hypothesis. Then assess it.</h3>
        <ol className="showcase-handoff"><li>Review the opportunity and its source statements.</li>
          <li>Choose the assessment model and target cloud.</li><li>Carry forward an unverified source snapshot.</li></ol>
        <div className="showcase-finding showcase-finding-unknown"><strong>14 workflow facts still need confirmation.</strong>
          <p>A handoff is not pilot readiness, approval to execute, or a confirmed business case.</p></div>
      </>}
    </div>
    <div className="showcase-footer"><span className="showcase-footer-dot" aria-hidden="true" /> Illustrative only. No model calls. No records created.</div>
  </article>;
}

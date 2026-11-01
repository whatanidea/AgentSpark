import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MarketingIcon, type MarketingIconName } from "./MarketingVisuals";

const stages: { name: string; icon: MarketingIconName; heading: string; text: string; path: string }[] = [
  { name: "Discover", icon: "people", heading: "Map the work. Invite the people who know it.", text: "Connect a process to operator, process-owner and technical-owner contributions. Keep disagreements visible.", path: "/platform/discovery" },
  { name: "Prioritize", icon: "evidence", heading: "Make the shortlist explainable.", text: "Connect opportunity hypotheses to source statements and compare non-AI and AI alternatives. Unknown ratings stay unranked.", path: "/platform/prioritization" },
  { name: "Prepare", icon: "readiness", heading: "Separate suitability from pilot readiness.", text: "An attractive workflow still needs validated data access, accountable owners and pilot measures.", path: "/platform/assessment" },
  { name: "Decide", icon: "blueprint", heading: "Give the next decision a reviewable foundation.", text: "Bring the proposed blueprint, evidence gaps and executive brief together. Customer implementation and authorization remain separate.", path: "/platform/architecture" },
];

export default function ProductShowcase() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = stages[index];
  function select(next: number) { setIndex(next); tabs.current[next]?.focus(); }
  return <section id="product-showcase" className="premium-product-section landing-container" aria-labelledby="product-showcase-title">
    <div className="premium-section-heading"><div><p className="landing-eyebrow">Inside AgentSpark</p>
      <h2 id="product-showcase-title">See the work.<br /><span>Then decide what changes.</span></h2></div>
      <p>One connected evaluation path. Explore a fictional reconstruction of the product's capabilities, without signing in or creating records.</p></div>
    <div className="premium-product-tabs" role="tablist" aria-label="Product walkthrough stages" onKeyDown={event => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement) || target.getAttribute("role") !== "tab") return;
      const current = tabs.current.indexOf(target);
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        select(event.key === "Home" ? 0 : event.key === "End" ? stages.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + stages.length) % stages.length);
      }
    }}>
      {stages.map((item, number) => <button key={item.name} ref={element => { tabs.current[number] = element; }}
        role="tab" id={`product-tab-${number}`} aria-selected={index === number} aria-controls={`product-panel-${number}`}
        tabIndex={index === number ? 0 : -1} onClick={() => setIndex(number)}>
        <MarketingIcon name={item.icon} /><span><small>0{number + 1}</small>{item.name}</span><span aria-hidden="true">↗</span>
      </button>)}
    </div>
    <div role="tabpanel" id={`product-panel-${index}`} aria-labelledby={`product-tab-${index}`} tabIndex={0} className="premium-product-panel">
      <div className="premium-product-story"><span className="premium-icon-tile"><MarketingIcon name={stage.icon} /></span>
        <h3>{stage.heading}</h3><p>{stage.text}</p>
        <Link to={stage.path}>Explore {stage.name.toLowerCase()} <span aria-hidden="true">↗</span></Link>
        <p className="premium-product-disclaimer">Illustrative interface reconstruction. All statements and results shown are fictional and unverified.</p>
      </div>
      <div key={index} className="premium-product-screen" aria-label={`${stage.name} interface preview`}>
        <div className="premium-screen-bar"><span><span aria-hidden="true">✦</span> AgentSpark / Finance discovery</span><span>ILLUSTRATIVE</span></div>
        <div className="premium-screen-body">
          {index === 0 && <>
            <div className="premium-screen-heading"><span>PROCESS / 01</span><strong>Invoice exception handling</strong><small>Process knowledge, not system monitoring</small></div>
            <div className="premium-screen-flow"><span>Receive</span><span>Check details</span><span>Review exception</span></div>
            <div className="premium-screen-source"><span>S1</span><div><strong>Business operator</strong><p>We repeat invoice checks. Finance owns exception decisions.</p></div><small>Submitted</small></div>
            <div className="premium-screen-source"><span>S2</span><div><strong>Process owner</strong><p>Procurement owns exception decisions. Volumes are unconfirmed.</p></div><small>Submitted</small></div>
            <div className="premium-screen-callout"><MarketingIcon name="people" /><span>Clarification needed: who owns exception decisions?</span></div>
          </>}
          {index === 1 && <>
            <div className="premium-screen-heading"><span>OPPORTUNITY SHORTLIST</span><strong>Keep the reasoning beside the recommendation.</strong></div>
            <div className="premium-screen-candidate"><span>01</span><div><strong>Investigate duplicate invoice checks</strong><p>Source S1 · Source S3</p></div><small>Review assumptions</small></div>
            <div className="premium-screen-candidate"><span>02</span><div><strong>Redesign exception routing</strong><p>Owner and baseline unresolved</p></div><small>Not ranked</small></div>
            <div className="premium-alternatives" aria-label="Improvement alternatives">{["No change", "Process improvement", "Rules-based automation", "AI assistance", "Hybrid"].map(item => <span key={item}>{item}</span>)}</div>
            <div className="premium-screen-callout"><MarketingIcon name="evidence" /><span>Priority ratings are assessor judgments, not measured savings.</span></div>
          </>}
          {index === 2 && <>
            <div className="premium-screen-heading"><span>IMPLEMENTATION READINESS</span><strong>Before a pilot, validate what matters.</strong><small>Separate from workflow suitability</small></div>
            <dl className="premium-screen-readiness">
              {[["Data access", "Needs validation"], ["Human oversight", "Owner to confirm"], ["Quality targets", "Baseline needed"], ["Integration permissions", "Not supplied"]].map(([name, value]) =>
                <div key={name}><dt>{name}</dt><dd><span aria-hidden="true" />{value}</dd></div>)}
            </dl>
            <div className="premium-screen-callout"><MarketingIcon name="readiness" /><span>Unconfirmed answers remain unresolved. Not pilot-ready.</span></div>
          </>}
          {index === 3 && <>
            <div className="premium-screen-heading"><span>EXECUTIVE DECISION / ADVISORY</span><strong>Validate access before committing to a pilot.</strong></div>
            <div className="premium-blueprint-flow"><span>Business inputs</span><span>AI suggestions</span><span>Human approval</span></div>
            <dl className="premium-screen-readiness"><div><dt>Proposed approach</dt><dd>Assistance + rules</dd></div><div><dt>Open validation</dt><dd>Access, owners, baseline</dd></div><div><dt>Next step</dt><dd>Review the evidence gaps</dd></div></dl>
            <div className="premium-screen-callout"><MarketingIcon name="decision" /><span>Advisory review does not authorize actions in business systems.</span></div>
          </>}
        </div>
        <div className="premium-screen-footer">Fictional example · No model calls · No records created</div>
      </div>
    </div>
  </section>;
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MarketingIcon, type MarketingIconName } from "./MarketingVisuals";
import { EvidenceLens } from "./EditorialExperience";
import { AlignmentPreview, DecisionPreview } from "./ProductEvidence";

const stages: { name: string; icon: MarketingIconName; heading: string; text: string; path: string }[] = [
  { name: "Discover", icon: "people", heading: "Understand the work with the people who do it.", text: "Ask your team where work slows down, what gets repeated and which decisions need a person.", path: "/platform/discovery" },
  { name: "Align", icon: "decision", heading: "Agree what matters and who is responsible.", text: "Record goals, concerns and decisions to make. People accept their own responsibilities; silence is not agreement.", path: "/platform/alignment" },
  { name: "Prioritize", icon: "evidence", heading: "Choose an opportunity you can explain.", text: "Compare a process change, a simpler tool and AI assistance. Keep missing information visible instead of guessing.", path: "/platform/prioritization" },
  { name: "Prepare", icon: "readiness", heading: "Check what a small trial would need.", text: "Review the information, access, people and success measures needed before committing to a trial.", path: "/platform/assessment" },
  { name: "Decide", icon: "blueprint", heading: "Review the plan before you invest.", text: "See the reasons, the proposed approach and the next step. Share a report for people to review; it does not authorize implementation.", path: "/platform/architecture" },
];

export default function ProductShowcase() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = stages[index];
  function select(next: number) { setIndex(next); tabs.current[next]?.focus(); }
  return <section id="product-showcase" className="premium-product-section landing-container" aria-labelledby="product-showcase-title">
    <div className="premium-section-heading"><div><p className="landing-eyebrow">Inside AgentSpark</p>
      <h2 id="product-showcase-title">See the work.<br /><span>Then decide what changes.</span></h2></div>
      <p>See how a team can move from a business question to a practical next step. Explore five stages before deciding whether the platform fits your work.</p></div>
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
        <MarketingIcon name={item.icon} /><span><small>0{number + 1}</small>{item.name}</span><span aria-hidden="true">→</span>
      </button>)}
    </div>
    <div role="tabpanel" id={`product-panel-${index}`} aria-labelledby={`product-tab-${index}`} tabIndex={0} className="premium-product-panel">
      <div className="premium-product-story"><span className="premium-icon-tile"><MarketingIcon name={stage.icon} /></span>
        <h3>{stage.heading}</h3><p>{stage.text}</p>
        <Link to={stage.path}>Explore {stage.name.toLowerCase()} <span aria-hidden="true">→</span></Link>
      </div>
      <div key={index} className="premium-product-screen" aria-label={`${stage.name} interface preview`}>
        <div className="premium-screen-bar"><span><span aria-hidden="true">✦</span> AgentSpark / Finance discovery</span><span>PRODUCT PREVIEW</span></div>
        <div className="public-screen-context"><span>Example organization / Finance team</span><Link to="/platform/workspaces">Team workspace →</Link></div>
        <div className="premium-screen-body">
          {stage.name === "Discover" && <>
            <div className="premium-screen-heading"><span>PROCESS</span><strong>Invoice exception handling</strong><small>Process knowledge, not system monitoring</small></div>
            <EvidenceLens />
          </>}
          {stage.name === "Align" && <AlignmentPreview />}
          {stage.name === "Prioritize" && <>
            <div className="premium-screen-heading"><span>OPPORTUNITY SHORTLIST</span><strong>Keep the reasoning beside the recommendation.</strong></div>
            <div className="premium-screen-candidate"><span>A</span><div><strong>Investigate duplicate invoice checks</strong><p>Source S1 · Source S3</p></div><small>Review assumptions</small></div>
            <div className="premium-screen-candidate"><span>B</span><div><strong>Redesign exception routing</strong><p>Owner and baseline unresolved</p></div><small>Not ranked</small></div>
            <div className="premium-alternatives" aria-label="Improvement alternatives">{["No change", "Process improvement", "Rules-based automation", "AI assistance", "Hybrid"].map(item => <span key={item}>{item}</span>)}</div>
            <div className="premium-screen-callout"><MarketingIcon name="evidence" /><span>Priority ratings are assessor judgments, not measured savings.</span></div>
          </>}
          {stage.name === "Prepare" && <>
            <div className="premium-screen-heading"><span>IMPLEMENTATION READINESS</span><strong>Before a pilot, validate what matters.</strong><small>Separate from workflow suitability</small></div>
            <dl className="premium-screen-readiness">
              {[["Data access", "Needs validation"], ["Human oversight", "Owner to confirm"], ["Quality targets", "Baseline needed"], ["Integration permissions", "Not supplied"]].map(([name, value]) =>
                <div key={name}><dt>{name}</dt><dd><span aria-hidden="true" />{value}</dd></div>)}
            </dl>
            <div className="premium-screen-callout"><MarketingIcon name="readiness" /><span>Unconfirmed answers remain unresolved. Not pilot-ready.</span></div>
          </>}
          {stage.name === "Decide" && <DecisionPreview />}
        </div>
        <div className="premium-screen-footer">Fictional example · No model calls or records created. <Link to="/resources/trust">Trust &amp; limitations</Link></div>
      </div>
    </div>
  </section>;
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MarketingIcon, type MarketingIconName } from "./MarketingVisuals";
import { EvidenceLens } from "./EditorialExperience";
import { AlignmentPreview, DecisionPreview } from "./ProductEvidence";

const stages: { name: string; icon: MarketingIconName; heading: string; text: string; path: string }[] = [
  { name: "Discover", icon: "people", heading: "Map the work. Invite the people who know it.", text: "Connect a process to operator, process-owner and technical-owner contributions. Keep disagreements visible.", path: "/platform/discovery" },
  { name: "Align", icon: "decision", heading: "Name the outcome. Make ownership real.", text: "Record positions, conditions and decisions needed. A nominated owner must accept responsibility; no response is not agreement.", path: "/platform/alignment" },
  { name: "Prioritize", icon: "evidence", heading: "Make the shortlist explainable.", text: "Connect opportunity hypotheses to source statements and compare non-AI and AI alternatives. Unknown ratings stay unranked.", path: "/platform/prioritization" },
  { name: "Prepare", icon: "readiness", heading: "Separate suitability from pilot readiness.", text: "Use documents and role-based interviews to surface gaps. Keep optional capacity, cash, hiring and service outcomes distinct.", path: "/platform/assessment" },
  { name: "Decide", icon: "blueprint", heading: "Lead with the outcome. Show how it connects.", text: "Review key reasons and a next action, then inspect the connected blueprint and export the decision report. Review is advisory, not execution permission.", path: "/platform/architecture" },
];

export default function ProductShowcase() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = stages[index];
  function select(next: number) { setIndex(next); tabs.current[next]?.focus(); }
  return <section id="product-showcase" className="premium-product-section landing-container" aria-labelledby="product-showcase-title">
    <div className="premium-section-heading"><div><p className="landing-eyebrow">Inside AgentSpark</p>
      <h2 id="product-showcase-title">See the work.<br /><span>Then decide what changes.</span></h2></div>
      <p>From stakeholder perspectives to accepted ownership, a source-linked shortlist and a visual proposal. Explore five connected stages with fictional data. No sign-in, model calls or records created.</p></div>
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
        <div className="public-screen-context"><span>Example organization / Finance team</span><Link to="/platform/workspaces">Team-scoped workspace ↗</Link></div>
        <div className="premium-screen-body">
          {stage.name === "Discover" && <>
            <div className="premium-screen-heading"><span>PROCESS / 01</span><strong>Invoice exception handling</strong><small>Process knowledge, not system monitoring</small></div>
            <EvidenceLens />
          </>}
          {stage.name === "Align" && <AlignmentPreview />}
          {stage.name === "Prioritize" && <>
            <div className="premium-screen-heading"><span>OPPORTUNITY SHORTLIST</span><strong>Keep the reasoning beside the recommendation.</strong></div>
            <div className="premium-screen-candidate"><span>01</span><div><strong>Investigate duplicate invoice checks</strong><p>Source S1 · Source S3</p></div><small>Review assumptions</small></div>
            <div className="premium-screen-candidate"><span>02</span><div><strong>Redesign exception routing</strong><p>Owner and baseline unresolved</p></div><small>Not ranked</small></div>
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
        <div className="premium-screen-footer">Fictional example · No model calls · No records created</div>
      </div>
    </div>
  </section>;
}

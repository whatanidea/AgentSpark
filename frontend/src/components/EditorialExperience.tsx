import { useState } from "react";
import { MarketingIcon } from "./MarketingVisuals";

export function SignalField() {
  const [paused, setPaused] = useState(false);
  return <figure className="editorial-signal" data-paused={paused}
    aria-label="Illustrative journey from business friction to human-reviewed progress">
    <div className="editorial-signal-meta"><span>THE AI-NATIVE JOURNEY / AN ILLUSTRATION</span>
      <button className="editorial-motion-control" onClick={() => setPaused(current => !current)}
        aria-label={paused ? "Resume illustration" : "Pause illustration"}>
        <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Resume motion" : "Pause motion"}
      </button>
    </div>
    <div className="editorial-signal-stage">
      <svg viewBox="0 0 1200 260" aria-hidden="true" focusable="false">
        <g className="editorial-signal-grid">
          {[40, 100, 160, 220].map(y => <path key={y} d={`M0 ${y}H1200`} />)}
          {[120, 300, 480, 660, 840, 1020].map(x => <path key={x} d={`M${x} 0V260`} />)}
        </g>
        <g className="editorial-signal-routes">
          <path d="M50 45H230C325 45 330 130 440 130" />
          <path d="M50 130H440" />
          <path d="M50 215H230C325 215 330 130 440 130" />
          <path d="M650 130H760C860 130 855 65 960 65H1150" />
          <path d="M650 130H760C860 130 855 195 960 195H1150" />
        </g>
        <g className="editorial-signal-flow">
          <path pathLength="100" d="M50 45H230C325 45 330 130 440 130" />
          <path pathLength="100" d="M50 215H230C325 215 330 130 440 130" />
          <path pathLength="100" d="M650 130H760C860 130 855 65 960 65H1150" />
        </g>
        <g className="editorial-signal-orbit">
          <ellipse cx="545" cy="130" rx="112" ry="92" />
          <ellipse cx="545" cy="130" rx="112" ry="38" />
          <ellipse cx="545" cy="130" rx="38" ry="92" />
          <ellipse cx="545" cy="130" rx="70" ry="92" transform="rotate(38 545 130)" />
          <ellipse cx="545" cy="130" rx="70" ry="92" transform="rotate(-38 545 130)" />
        </g>
        <g className="editorial-signal-points">
          <circle cx="50" cy="45" r="4" /><circle cx="50" cy="130" r="4" />
          <circle cx="50" cy="215" r="4" /><circle cx="1150" cy="65" r="4" />
          <circle cx="1150" cy="195" r="4" />
        </g>
      </svg>
      <div className="editorial-signal-inputs"><span>Fragmented work</span><span>Team knowledge</span><span>Business priorities</span></div>
      <div className="editorial-signal-core"><span>PEOPLE + PROCESS + AI</span><strong>A connected<br />way of working.</strong></div>
      <div className="editorial-signal-outputs"><span><MarketingIcon name="cloud" />Customer-owned tools</span>
        <span><MarketingIcon name="decision" />Human-reviewed progress</span></div>
    </div>
    <figcaption><span>From possibility to a deliberate next step.</span><span>Not a connected system or an autonomous workflow.</span></figcaption>
  </figure>;
}

const frictions = [
  { name: "Repeated checks", source: "S1 / Business operator", statement: "We enter the same invoice details twice.",
    secondSource: "S3 / Technical owner", secondStatement: "Access to invoice and purchase-order data still needs validation.",
    recommendation: "Investigate duplicate checks before introducing AI.",
    detail: "Compare a process change, deterministic validation and AI assistance. Validate the baseline and data access before choosing a pilot." },
  { name: "Unclear ownership", source: "S1 / Business operator", statement: "Finance owns exception decisions.",
    secondSource: "S2 / Process owner", secondStatement: "Procurement owns exception decisions.",
    recommendation: "Clarify decision ownership before automating the handoff.",
    detail: "Resolve the conflicting accounts with the process owner. An AI assistant cannot decide who has authority to approve an exception." },
] as const;

export function EvidenceLens() {
  const [selected, setSelected] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const friction = frictions[selected];
  return <div className="editorial-evidence">
    <p className="editorial-evidence-label">01 / SELECT A REPORTED FRICTION</p>
    <div className="editorial-friction-picker" role="group" aria-label="Reported workflow friction">
      {frictions.map((item, index) => <button key={item.name} aria-pressed={selected === index}
        onClick={() => { setSelected(index); setSourcesOpen(false); }}>
        <span aria-hidden="true">0{index + 1}</span>{item.name}<span aria-hidden="true">↗</span>
      </button>)}
    </div>
    <div className="editorial-evidence-result" aria-live="polite" aria-atomic="true">
      <p className="editorial-evidence-label">02 / INSPECT THE REASONING</p>
      <h4>{friction.recommendation}</h4><p>{friction.detail}</p>
      <p className="editorial-evidence-status">Human review required · Baseline unverified</p>
    </div>
    <button className="editorial-source-toggle" aria-expanded={sourcesOpen} aria-controls="editorial-example-sources"
      onClick={() => setSourcesOpen(current => !current)}>
      {sourcesOpen ? "Hide source statements" : "Inspect source statements"}<span aria-hidden="true">{sourcesOpen ? "−" : "+"}</span>
    </button>
    <div id="editorial-example-sources" hidden={!sourcesOpen} className="editorial-source-statements">
      <div><strong>{friction.source}</strong><p>{friction.statement}</p></div>
      <div><strong>{friction.secondSource}</strong><p>{friction.secondStatement}</p></div>
      <p>Submitted statements in a fictional example, not verified evidence.</p>
    </div>
    <p className="editorial-evidence-footnote">Clarification needed: who owns exception decisions? No measured savings or automated approval is implied.</p>
  </div>;
}

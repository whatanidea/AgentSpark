import { useState } from "react";

function SignalDiagram({ compact = false }: { compact?: boolean }) {
  return <svg className={compact ? "editorial-signal-mobile" : "editorial-signal-desktop"}
    viewBox="0 0 400 360" aria-hidden="true" focusable="false">
    <path className="editorial-signal-routes" d="M0 100C60 100 50 180 100 180M0 180h100M0 260c60 0 50-80 100-80M300 180h100" />
    <g className="editorial-signal-flow">
      <path pathLength="100" d="M0 100C60 100 50 180 100 180h200 100" />
      <path pathLength="100" d="M0 180h100" />
      <path pathLength="100" d="M0 260c60 0 50-80 100-80" />
    </g>
    <g className="editorial-signal-orbit">
      <path d="m200 45 100 60v150l-100 60-100-60V105Z" />
      <path d="m200 70 77 47v126l-77 47-77-47V117Z" />
      <path d="m200 96 54 33v102l-54 33-54-33V129Z" />
      <path d="M200 45v270M100 105l200 150M300 105 100 255M100 180h200" />
    </g>
    <circle className="clarity-lens-center" cx="200" cy="180" r="32" />
    <path className="clarity-lens-check" d="m186 181 10 10 19-24" />
    <g className="editorial-signal-points"><circle cx="100" cy="180" r="3" /><circle cx="300" cy="180" r="3" /></g>
  </svg>;
}

export function SignalField() {
  const [paused, setPaused] = useState(false);
  return <figure className="editorial-signal" data-paused={paused}
    aria-label="Illustrative journey from business friction to human-reviewed progress">
    <div className="editorial-signal-meta"><span>FIG. 01 / FROM PERSPECTIVES TO A REVIEWED DECISION</span>
      <button className="editorial-motion-control" onClick={() => setPaused(current => !current)}
        aria-label={paused ? "Resume illustration" : "Pause illustration"}>
        <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Resume motion" : "Pause motion"}
      </button>
    </div>
    <div className="editorial-signal-stage">
      <div className="clarity-sources">
        <p className="clarity-figure-label">01 / Understand the work</p>
        <div className="clarity-source"><span>S1 / Operator perspective</span><p>&ldquo;We enter the same details twice.&rdquo;</p><i aria-hidden="true" /></div>
        <div className="clarity-source"><span>S2 / Process owner</span><p>&ldquo;Exceptions need an accountable owner.&rdquo;</p></div>
        <div className="clarity-source"><span>S3 / Technical owner</span><p>&ldquo;Data access still needs validation.&rdquo;</p></div>
      </div>
      <div className="clarity-lens"><SignalDiagram /><SignalDiagram compact />
        <p className="clarity-figure-label">Evidence &rarr; judgment &rarr; direction</p>
      </div>
      <div className="clarity-decision">
        <div className="clarity-decision-meta"><span>Decision brief / 001</span><span>For review</span></div>
        <h2>Better work.<br />Not automatically more AI.</h2>
        <p>Investigate duplicate checks. Validate data access before selecting an approach.</p>
        <div className="clarity-alternatives"><span>Process change</span><span>Rules</span><span>AI assistance</span></div>
        <dl><div><dt>Source statements</dt><dd>S1 &middot; S2 &middot; S3</dd></div><div><dt>Decision authority</dt><dd>Human review</dd></div></dl>
        <p className="clarity-decision-note">Fictional example &middot; Unverified inputs.<br />No measured outcome or authorization implied.</p>
      </div>
    </div>
    <figcaption><span>Built around evidence. Designed for accountability.</span><span>Not a connected system or an autonomous workflow.</span></figcaption>
  </figure>;
}

const frictions = [
  { name: "Repeated checks", source: "S1 / Business operator", statement: "We enter the same invoice details twice.",
    secondSource: "S3 / Technical owner", secondStatement: "Access to invoice and purchase-order data still needs validation.",
    recommendation: "Investigate duplicate checks before introducing AI.",
    detail: "Compare a process change, checks based on clear rules and AI assistance. Check the starting point and data access before choosing a trial." },
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
    <p className="editorial-evidence-label">SELECT A REPORTED PROBLEM</p>
    <div className="editorial-friction-picker" role="group" aria-label="Reported workflow friction">
      {frictions.map((item, index) => <button key={item.name} aria-pressed={selected === index}
        onClick={() => { setSelected(index); setSourcesOpen(false); }}>
        <span aria-hidden="true">—</span>{item.name}<span aria-hidden="true">→</span>
      </button>)}
    </div>
    <div className="editorial-evidence-result" aria-live="polite" aria-atomic="true">
      <p className="editorial-evidence-label">INSPECT THE REASONING</p>
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
      <p>Submitted statements, not verified evidence.</p>
    </div>
    <p className="editorial-evidence-footnote">Clarification needed: who owns exception decisions? No measured savings or automated approval is implied.</p>
  </div>;
}

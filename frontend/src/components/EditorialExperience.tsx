import { useState } from "react";
import { MarketingIcon } from "./MarketingVisuals";

function SignalDiagram({ compact = false }: { compact?: boolean }) {
  const width = compact ? 320 : 1200;
  const height = compact ? 400 : 260;
  const cx = compact ? 160 : 545;
  const cy = compact ? 200 : 130;
  const rx = compact ? 72 : 112;
  const ry = compact ? 58 : 92;
  const routes = compact ? [
    "M50 30V75C50 120 160 115 160 140",
    "M160 30V140",
    "M270 30V75C270 120 160 115 160 140",
    "M160 260V285C160 315 80 310 80 340V370",
    "M160 260V285C160 315 240 310 240 340V370",
  ] : [
    "M50 45H230C325 45 330 130 440 130",
    "M50 130H440",
    "M50 215H230C325 215 330 130 440 130",
    "M650 130H760C860 130 855 65 960 65H1150",
    "M650 130H760C860 130 855 195 960 195H1150",
  ];
  const points = compact ? [[50, 30], [160, 30], [270, 30], [80, 370], [240, 370]]
    : [[50, 45], [50, 130], [50, 215], [1150, 65], [1150, 195]];
  return <svg className={compact ? "editorial-signal-mobile" : "editorial-signal-desktop"}
    viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    <g className="editorial-signal-grid">
      {(compact ? [30, 115, 200, 285, 370] : [40, 100, 160, 220]).map(y => <path key={y} d={`M0 ${y}H${width}`} />)}
      {(compact ? [50, 160, 270] : [120, 300, 480, 660, 840, 1020]).map(x => <path key={x} d={`M${x} 0V${height}`} />)}
    </g>
    <g className="editorial-signal-routes">{routes.map(d => <path key={d} d={d} />)}</g>
    <g className="editorial-signal-flow">
      {[routes[0], routes[2], routes[3]].map(d => <path key={d} pathLength="100" d={d} />)}
    </g>
    <g className="editorial-signal-orbit">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={compact ? 24 : 38} />
      <ellipse cx={cx} cy={cy} rx={compact ? 24 : 38} ry={ry} />
      <ellipse cx={cx} cy={cy} rx={compact ? 45 : 70} ry={ry} transform={`rotate(38 ${cx} ${cy})`} />
      <ellipse cx={cx} cy={cy} rx={compact ? 45 : 70} ry={ry} transform={`rotate(-38 ${cx} ${cy})`} />
    </g>
    <g className="editorial-signal-points">
      {points.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" />)}
    </g>
  </svg>;
}

export function SignalField() {
  const [paused, setPaused] = useState(false);
  return <figure className="editorial-signal" data-paused={paused}
    aria-label="Illustrative journey from business friction to human-reviewed progress">
    <div className="editorial-signal-meta"><span>BETTER WAYS OF WORKING / AN ILLUSTRATION</span>
      <button className="editorial-motion-control" onClick={() => setPaused(current => !current)}
        aria-label={paused ? "Resume illustration" : "Pause illustration"}>
        <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Resume motion" : "Pause motion"}
      </button>
    </div>
    <div className="editorial-signal-stage">
      <SignalDiagram /><SignalDiagram compact />
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

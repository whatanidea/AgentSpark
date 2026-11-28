import { useEffect, useRef, useState } from "react";
import "./SignalLab.css";

const instruments = [
  { name: "OpenAI", form: "Braided signal", job: "The Friday brief", copy: "We turn scattered project updates into one draft digest. Your lead checks the sources and decides what goes out.", color: "#a9f6c6", foil: "#72b7fc", turns: 3 },
  { name: "Grok Bot", form: "Split orbit", job: "The triage desk", copy: "We design a queue pilot that groups incoming requests and proposes an owner. Your dispatcher approves each handoff.", color: "#b5d8ff", foil: "#af9bfa", turns: 2 },
  { name: "OpenAgent", form: "Phase lattice", job: "The handoff rehearsal", copy: "We prototype a researcher-to-editor handoff on sample material. Your editor checks the evidence before the draft moves on.", color: "#d8bcff", foil: "#76c5da", turns: 4 },
  { name: "Claude Cowork", form: "Amber helix", job: "The account brief", copy: "We shape a pilot around the files your account team already uses. A named reviewer checks every claim before a client sees it.", color: "#ffc29d", foil: "#e997c1", turns: 3 },
] as const;

// Project a closed bundle of curved filaments through a tilted camera.
function filament(i: number, mode: number, phase: number) {
  const f = i / 27, wave = instruments[mode].turns;
  const angle = phase + 0.32, ca = Math.cos(angle), sa = Math.sin(angle);
  const pts: string[] = [];
  for (let j = 0; j < 108; j++) {
    const t = j / 108 * 2 * Math.PI, strand = wave * t + f * 1.65 + mode * .6;
    const radius = 87 + (32 + f * 15) * Math.cos(strand);
    const x = radius * Math.cos(2*t), z = radius * Math.sin(2*t);
    const y = (mode === 3 ? 70 : 53) * Math.sin(strand) + (f - .5) * 32;
    const depth = x * sa + z * ca, dx = x * ca - z * sa;
    const dy = y * .86 + depth * .51, scale = 520 / (520 - depth * .86 + y * .51);
    pts.push(`${j ? "L" : "M"}${(205 + scale * (dx*.95 - dy*.31)).toFixed(1)},${(137 + scale * (dy*.95 + dx*.31)).toFixed(1)}`);
  }
  return pts.join("") + "Z";
}

const lines = Array.from({ length: 28 }, (_, i) => i);
const stills = instruments.map((_, mode) => lines.map(i => filament(i, mode, 0)));

export default function SignalLab() {
  const [mode, select] = useState(0);
  const [paused, pause] = useState(false);
  const art = useRef<SVGGElement>(null);
  const current = instruments[mode];
  useEffect(() => {
    const group = art.current;
    if (!group || paused) return;
    const nodes = Array.from(group.querySelectorAll("path"));
    let visible = false, frame = 0, last = 0, rotation = 0;
    function tick(now: number) {
      if (now - last >= 50) {
        rotation += Math.min(now - last, 80) * .00018;
        nodes.forEach((node, i) => node.setAttribute("d", filament(i, mode, rotation)));
        last = now;
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      if (visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(tick); }
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(group.ownerSVGElement!);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", sync); };
  }, [mode, paused]);
  return <section className="signal-lab" id="signal-lab" aria-labelledby="signal-title">
    <header className="signal-ident"><span><i/> KS / FIELD INSTRUMENTS</span><span>EXHIBIT 01 &nbsp;·&nbsp; INTERACTIVE</span></header>
    <div className="signal-body"><div className="signal-intro">
      <small>Kaisersol Signal Lab</small><h2 id="signal-title">Put intelligence<br/>to <em>work.</em></h2>
      <p>Four ways to put an agent on the job. Explore a pilot we could build with your team, from the first source to the final human check.</p>
      <a href="#pilot-guides">Explore the pilot guides <span aria-hidden="true">↓</span></a>
    </div>
    <div className="signal-stage" style={{color:current.color}}>
      <div className="signal-caption"><span>FIG. 0{mode+1}</span> / {current.form}</div>
      <svg viewBox="0 0 410 290" aria-hidden="true" focusable="false">
        <defs><linearGradient id="signal-foil" x1="0%" y1="85%" x2="95%" y2="10%"><stop stopColor={current.foil}/><stop offset=".36" stopColor={current.color}/><stop offset=".56" stopColor="#f4fff5"/><stop offset=".74" stopColor={current.foil}/><stop offset="1" stopColor={current.color}/></linearGradient></defs>
        <g fill="none" stroke="currentColor" opacity=".25"><ellipse cx="205" cy="244" rx="135" ry="15"/><ellipse cx="205" cy="244" rx="104" ry="10" strokeDasharray="2 5"/><path d="M37 145h9m318 0h9M205 22v8m0 228v9"/></g>
        <g ref={art} key={mode} fill="none" stroke="url(#signal-foil)" strokeWidth="1.25" opacity=".92">
          {lines.map(i=><path key={i} d={stills[mode][i]}/>)}
        </g>
      </svg>
      <button className="signal-motion" type="button" onClick={()=>pause(!paused)}>{paused ? "Play motion" : "Pause motion"}</button>
    </div></div>
    <div className="signal-switch" role="group" aria-label="Select a platform pilot">{instruments.map((item,i)=><button type="button" key={item.name} aria-pressed={i===mode} onClick={()=>select(i)}><b>0{i+1}</b>{item.name}</button>)}</div>
    <div className="signal-readout" aria-live="polite"><div><small>Example pilot / 0{mode+1}</small><h3>{current.job}</h3></div><p>{current.copy}</p></div>
  </section>;
}

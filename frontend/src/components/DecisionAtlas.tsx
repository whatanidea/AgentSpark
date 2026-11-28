import { useEffect, useRef, useState } from "react";
import "./DecisionAtlas.css";

function peak(x: number, z: number, a: number, b: number, spread: number) {
  return Math.exp(-((x-a)**2 + (z-b)**2) / spread);
}
function project(x: number, z: number) {
  const h = 88*peak(x,z,.44,-.15,.095) + 60*peak(x,z,-.48,.21,.17) + 38*peak(x,z,-.28,-.48,.12);
  return `${(230 + 144*x - 67*z).toFixed(1)},${(156 + 26*x + 57*z - h).toFixed(1)}`;
}
const range = (n: number) => Array.from({length:n+1}, (_,i)=>2*i/n-1);
const samples = range(40);
const mesh = range(32).map(z => "M"+samples.map(x=>project(x,z)).join(" L"));
const cross = range(20).map(x => "M"+samples.map(z=>project(x,z)).join(" L"));
const route = "M"+samples.map(t=>project(-.85+.65*(t+1),.57-.36*(t+1)+.09*Math.sin(Math.PI*(t+1)))).join(" L");
const summit = project(.45,-.15);

export default function DecisionAtlas() {
  const panel = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const manualPause = useRef(false);
  const updatePlayback = useRef<() => void>(()=>{});
  useEffect(()=>{
    const section = panel.current;
    const terrain = section?.querySelector(".atlas-viewport svg");
    const trace = terrain?.querySelector(".atlas-route");
    if (!terrain || !trace || !section) return;
    const timing = {duration: 8000, iterations: Infinity, direction: "alternate", easing: "ease-in-out"} as const;
    const animations = [
      terrain.animate([{transform:"rotateX(14deg) rotateY(-12deg) scale(.96)"},{transform:"rotateX(0) rotateY(8deg) scale(1)"}], timing),
      trace.animate([{strokeDashoffset:"1"}, {strokeDashoffset:"0", offset:.78}, {strokeDashoffset:"0"}], timing),
    ];
    let visible = false;
    const sync = () => animations.forEach(a => visible && !document.hidden && !manualPause.current ? a.play() : a.pause());
    updatePlayback.current = sync;
    sync();
    const observer = new IntersectionObserver(([entry])=>{ visible = entry.isIntersecting; sync(); });
    observer.observe(section);
    document.addEventListener("visibilitychange", sync);
    return ()=>{ observer.disconnect(); document.removeEventListener("visibilitychange", sync); animations.forEach(a=>a.cancel()); };
  },[]);
  return <section ref={panel} id="decision-atlas" className="decision-atlas" aria-labelledby="atlas-title">
    <div className="atlas-frame"><span>KAISERSOL / DECISION ATLAS</span><span>FIELD STUDY &nbsp; 001</span></div>
    <div className="atlas-layout"><div className="atlas-intro"><small>AI opportunity mapping</small>
      <h2 id="atlas-title">Find where AI<br/><em>belongs.</em></h2>
      <p>Start with the work, not the model. We map how a team operates, trace the friction, and test whether AI is the right answer.</p>
      <a href="#first-conversation">Bring us a workflow &rarr;</a></div>
      <div className="atlas-viewport">
        <svg viewBox="0 0 460 274" role="img" aria-label="Three-dimensional workflow terrain. A gold survey line climbs from a recurring handoff to a candidate pilot.">
          <defs><linearGradient id="atlas-wire" x2=".8" y2="1"><stop stopColor="#b6ffe3"/><stop offset="1" stopColor="#388b95"/></linearGradient></defs>
          <g className="atlas-relief">
            {[22,15,8].map(y=><path key={y} transform={`translate(0 ${y})`} d="M153 73L441 125L307 239L19 187Z" fill="#10232b" stroke="#36515b"/>)}
            <path d="M153 73L441 125L307 239L19 187Z" fill="#112d34" stroke="#579090"/>
            {mesh.map((d,i)=><path key={i} d={d} fill="none" stroke="url(#atlas-wire)" strokeWidth=".95"/>)}
            {cross.map((d,i)=><path key={i} d={d} fill="none" stroke="#69adb2" opacity=".48" strokeWidth=".75"/>)}
            <path className="atlas-route" d={route} pathLength="1" stroke="#ffce87" fill="none" strokeWidth="2.8"/>
            <g transform={`translate(${summit})`} stroke="#ffe2a9"><ellipse rx="9" ry="3" fill="none"/><path d="M0 0v-29h29" fill="none"/><circle cy="-29" r="3" fill="#ffce87"/></g>
          </g>
        </svg><div className="atlas-key"><span>Terrain / workflows</span><span>Trace / candidate pilot</span></div>
      </div></div>
    <div className="atlas-frame atlas-footer"><span>01 &nbsp; Map the work &nbsp; / &nbsp; 02 &nbsp; Trace friction &nbsp; / &nbsp; 03 &nbsp; Test the fit</span>
      <button type="button" onClick={()=>{ manualPause.current = !paused; setPaused(!paused); updatePlayback.current(); }}>{paused ? "Play survey" : "Pause survey"}</button></div>
  </section>;
}

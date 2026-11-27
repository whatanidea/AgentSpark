import { useEffect, useRef, useState } from "react";
import "./AgentImplementation.css";

const root = "/solutions/agent-implementation/";
export const agentSolutions = `${root}solutions.html`;
const platforms = [
  ["cowork", "claude", "Claude Cowork", "Anthropic"],
  ["dots", "openai", "dots", "OpenAI"],
  ["grok", "grok", "Grok Bot", "xAI"],
  ["openbot", "openbot", "OpenBot", "CopilotKit"],
];

export default function AgentImplementation() {
  const panel = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!panel.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); observer.disconnect(); }
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  return <section ref={panel} className="studio-section agent-offer" id="agent-implementation" data-visible={seen}>
    <div className="studio-scene"><div><small>Consulting + implementation</small>
      <h2>Give an agent <em>one real job.</em></h2>
      <p>Bring us the task your team repeats every week. We help you choose a platform, build the pilot, and teach the person who will run it.</p>
      <a className="landing-button landing-button-primary" href={agentSolutions}>Explore agent implementation →</a></div>
      <aside className="studio-plate"><small>Implementation desk / Platform selection</small><h3>Four platforms. <br/>Start with one.</h3>
        {platforms.map(([slug, icon, name, vendor]) => <a className="agent-row" href={`${root}${slug}.html`} key={slug}>
          <img src={`${root}${icon}.svg`} alt=""/><strong>{name}</strong><span>{vendor}</span></a>)}
        <p>Choose a platform to see an example pilot.</p></aside></div>
    <div className="agent-outputs"><small>What your team keeps</small><p>A tested workflow / Review checklist / Operator playbook</p></div>
  </section>;
}

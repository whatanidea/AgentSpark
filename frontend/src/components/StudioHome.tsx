import { useState, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router-dom";
import { CONSULTING_OFFERINGS } from "./consultingContent";
import { ConsultationLink } from "./ConsultationBooking";
import Icon, { type IconName } from "./Icon";
import StudioRibbon from "./StudioRibbon";
import StudioPilot from "./StudioPilot";
import AgentImplementation from "./AgentImplementation";
import DecisionAtlas from "./DecisionAtlas";
import "./StudioHome.css";

const paths = [
  { title: "Finding a starting point", service: 0, output: "A ranked shortlist.", color: "#bdf38a", rows: [
    ["Start here", "Clarify the visit-date field before changing how staff review bills."],
    ["Test next", "Try extracting dates only if reading varied bill formats takes material staff time."],
    ["Rule out", "Do not automate coverage decisions."]] },
  { title: "Testing a workflow", service: 2, output: "A pilot scorecard.", color: "#94daff", rows: [
    ["Baseline", "Time today’s manual checks, including corrections and follow-up."],
    ["Pilot", "Run the same bills through date extraction with specialist review. Count missed and unnecessary referrals."],
    ["Decision", "Expand only if handling time falls and errors stay within limits agreed before testing."]] },
  { title: "Getting my team on board", service: 3, output: "A team playbook.", color: "#e1b4ff", rows: [
    ["Practise", "Compare the form with the bill. Find the visit date, not the invoice date."],
    ["Escalate", "If dates disagree or the scan is unclear, route both sources to the claims specialist."],
    ["Coach", "The team champion reviews difficult cases at office hours and updates the guide."]] },
];
const serviceIcons: IconName[] = ["discovery", "claims", "blueprint", "support"];
const serviceResults = [
  "Leave with a ranked shortlist and a first step you can take to finance.",
  "Set access and data-use rules, train staff and keep control of your accounts.",
  "Test one change against today’s work. Use the results to stop, revise or expand.",
  "Coach staff on difficult cases and give your team lead a practical review guide.",
];
type Node = [string, string, string, IconName, string];
const nodes: Node[] = [
  ["Clinic bill", "PDF scan", "#ffa9ba", "finance", "The scanned bill says 8 May. Keep its page reference so a specialist can check the extracted date."],
  ["Claim form", "Structured fields", "#93d6ff", "intake", "The form records 6 May. Read the structured field directly; no model is needed."],
  ["Queue events", "Timestamped log", "#ffcd83", "analyze", "Arrival and assignment times help separate handling time from time spent waiting."],
  ["Linked case record", "Centralize", "#bdf38a", "integrations", "Match the inputs by claim reference. Keep the original values and timestamps linked rather than overwriting conflicting facts."],
  ["Flag mismatch", "01 / Analyze", "#cab0ff", "analyze", "AI extracts the bill date. A fixed rule flags the discrepancy and shows both sources, without deciding coverage."],
  ["Draft next step", "02 / Plan", "#9adfd5", "blueprint", "Draft a clarification with both dates, the responsible reviewer and the condition for moving to eligibility review."],
  ["Route for review", "03 / Implement", "#ffc49c", "readiness", "An approved pilot would route a task and the two sources to a specialist. A person reviews before anything is sent."],
];
function DataFlow() {
  const [selected, select] = useState(3);
  const button = (n: number) => <button key={n} type="button" aria-pressed={selected === n} onClick={() => select(n)}
    style={{ "--tone": nodes[n][2] } as CSSProperties}><Icon name={nodes[n][3]}/><small>{nodes[n][1]}</small><b>{nodes[n][0]}</b></button>;
  return <section className="studio-section" id="data-flow"><small>Inside an AI workflow · Illustrative pilot</small><h2>Three sources. One case record.</h2>
    <p>Follow a claim from raw inputs to a review task. Select a source or stage to see what passes through it.</p>
    <div className="studio-board"><div className="studio-scroller" tabIndex={0} role="region" aria-label="Workflow diagram, scroll right from sources to implementation">
      <div className="studio-track"><div className="studio-feeds">{[0,1,2].map(button)}</div>
        <svg className="studio-lines" viewBox="0 0 52 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 50C38 50 14 150 52 150" stroke="#ffa9ba"/><path d="M0 250C38 250 14 150 52 150" stroke="#ffcd83"/><path d="M0 150H52" stroke="#93d6ff"/></svg>
        {button(3)}<span aria-hidden="true">→</span>{[4,5,6].map(button)}</div></div>
      <div className="studio-inspect" role="status"><small>{nodes[selected][1]} / {nodes[selected][0]}</small><p>{nodes[selected][4]}</p></div></div>
    <p className="studio-fine">Fictional example. No systems are connected and no tasks or messages are sent.</p></section>;
}
export default function StudioHome({ titleRef, onBook }: { titleRef: RefObject<HTMLHeadingElement>; onBook: () => void }) {
  const [stage, setStage] = useState(0);
  const active = paths[stage];
  return <div className="studio-home">
    <section className="studio-hero" id="top"><div><small>AI consulting &amp; adoption</small>
      <h1 id="landing-title" tabIndex={-1} ref={titleRef}>Where are you <span>with AI?</span></h1>
      <p>Pick the decision your team faces. See how an adviser would help and a sample of the work you’d keep.</p>
      <div className="studio-paths">{paths.map((path,i) => <div key={path.title}><button type="button" aria-pressed={i===stage} onClick={() => setStage(i)}>
        <small>0{i+1}</small>{path.title}<span aria-hidden="true">{i===stage?"−":"+"}</span></button>
        {i===stage && <div className="studio-answer"><p>{CONSULTING_OFFERINGS[path.service].summary}</p>
          <Link to={CONSULTING_OFFERINGS[path.service].path}>Explore this engagement →</Link></div>}</div>)}</div></div>
      <aside className="studio-plate" style={{"--tone":active.color} as CSSProperties} aria-label="Illustrative consulting deliverable"><small>Field studies / Claims intake · 0{stage+1} of 03</small>
        <StudioRibbon variant={stage}/><small>What you keep</small><h2 aria-live="polite">{active.output}</h2>
        <dl>{active.rows.map(([label,desc])=><div key={label}><dt>{label}</dt><dd>{desc}</dd></div>)}</dl></aside>
    </section>
    <DecisionAtlas/><DataFlow/><StudioPilot/><AgentImplementation/>
    <section id="engagements" className="studio-section"><small>Work with an adviser</small><h2 id="consulting-services">Consulting services</h2>
      <p>Choose the engagement you need now. Each has its own scope and handover.</p>
      <div className="studio-services">{CONSULTING_OFFERINGS.map((s,i)=><Link key={s.path} to={s.path}><Icon name={serviceIcons[i]}/><h3>{s.name} →</h3><p>{serviceResults[i]}</p></Link>)}</div></section>
    <section id="first-conversation" className="studio-section studio-book"><div><small>The first conversation</small><h2>Bring one job that keeps coming back.</h2>
      <p>Describe a recent case, where it stalled and the decision you need to make. No files or customer records needed. We agree scope, fee and timing before paid work starts.</p></div><ConsultationLink onBook={onBook}/></section>
  </div>;
}

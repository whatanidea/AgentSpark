import { useState } from "react";
import { Link } from "react-router-dom";
import ClaimIntakeReview from "./ClaimStory";

const steps = ["Map the work", "Gather evidence", "Compare fixes", "Make the call"];
const focuses = ["Checking the bill", "Waiting for a clinic reply"];
const fixes = ["Clarify the clinic request", "Extract the visit date"];
const decisions = ["Measure the baseline first", "Propose a bounded pilot", "Set this change aside"];
function Choice({ label, options, value, change }: {label:string;options:string[];value:number;change:(n:number)=>void}) {
  return <label>{label}<select value={value} onChange={e=>change(Number(e.target.value))}>{options.map((v,i)=><option value={i} key={v}>{v}</option>)}</select></label>;
}
function EvidenceExercise() {
  const [step, go] = useState(0), [focus, setFocus] = useState(0), [fix, setFix] = useState(0), [decision, decide] = useState(0);
  const [staff, setStaff] = useState(false), [logs, setLogs] = useState(false);
  const support = (fix ? staff : logs) ? "A selected source supports investigating this change, not rolling it out." : "No selected source directly supports this change yet.";
  return <details className="studio-detail"><summary>Explore the evidence behind this pilot</summary>
    <div className="studio-steps">{steps.map((s,i)=><button type="button" key={s} onClick={()=>go(i)} aria-pressed={i===step}><small>0{i+1}</small>{s}</button>)}</div>
    <div className="studio-exercise">
      {step===0 && <><Choice label="Which part needs a closer look?" options={focuses} value={focus} change={setFocus}/><p>{focus?"Specialist → Clinic → Specialist. Measure days from request to usable reply.":"Claim form → Intake specialist → Checked bill. Measure hands-on minutes spent finding and verifying dates."}</p></>}
      {step===1 && <><fieldset><legend>Which evidence would you include?</legend><label><input type="checkbox" checked={staff} onChange={e=>setStaff(e.target.checked)}/> Staff interview: “I open every bill to find the visit date.”</label><label><input type="checkbox" checked={logs} onChange={e=>setLogs(e.target.checked)}/> Queue log: most elapsed time is spent waiting for a clinic reply.</label></fieldset>
        <p role="status">{["Select a source to see which change the evidence supports.","Test the reading task. Count corrections as well as time saved.","Investigate the handoff. Faster reading alone won’t shorten that wait.","Separate two different delays. Measure handling minutes and elapsed days independently."][Number(staff)+2*Number(logs)]}</p></>}
      {step===2 && <><Choice label="Candidate change" options={fixes} value={fix} change={setFix}/><p>{fix?"Compare reading time and missed discrepancies.":"Compare clinic response time and incomplete replies."} {support}</p></>}
      {step===3 && <><Choice label="Record a next step" options={decisions} value={decision} change={decide}/><div role="status"><strong>{decisions[decision]}</strong><p>{focuses[focus]} · {fixes[fix]}. Sources: {[staff&&"staff interview",logs&&"queue log"].filter(Boolean).join(" and ")||"none selected"}. {support} {focus===fix && "The candidate targets a different delay than your chosen focus."}</p></div></>}
    </div></details>;
}
export default function StudioPilot() {
  const [pilot, select] = useState(false);
  return <section id="self-service" className="studio-section"><small>Self-service platform</small><h2>Build the brief yourself.</h2>
    <p>Gather observations, compare improvements and share a decision brief with the budget owner. No consulting engagement required.</p>
    <div className="studio-question" id="claim-review"><small>Workflow question / Claims intake</small><h3>What slows a claim down: checking the bill or waiting for a reply?</h3></div>
    <div className="studio-compare"><fieldset><legend>Compare one claim</legend>{["Today","Proposed pilot"].map((v,i)=><label key={v}><input type="radio" name="comparison" checked={pilot===Boolean(i)} onChange={()=>select(Boolean(i))}/>{v}</label>)}</fieldset>
      <div className="studio-scene"><div className="studio-paper"><small>Specimen 01 · Visit dates</small><p>Claim form <b>6 May</b></p><p>Clinic bill <b>8 May</b></p><strong>{pilot?"Date mismatch flagged":"Manual cross-check"}</strong></div>
      <div aria-live="polite"><small>{pilot?"Proposed pilot / Assisted intake":"Today / Manual intake"}</small><h3>{pilot?"The dates come to the specialist.":"Two documents. One pair of eyes."}</h3>
        <p>{pilot?"AI extracts the dates. A rule flags the discrepancy. A specialist checks both sources before contacting the clinic.":"The specialist opens both documents, finds the dates and asks the clinic which is correct."}</p><p><b>Unchanged:</b> the clinic still has to reply.</p></div></div></div>
    <EvidenceExercise/>
    <details className="studio-detail" id="claim-adoption"><summary>Try the example: a health claim with conflicting dates</summary><ClaimIntakeReview/></details>
    <div className="studio-links"><Link to="/platform">Explore the self-service platform →</Link><Link id="claim-assessment" to="/resources/example-assessment#workflow-explorer">See the full sample assessment →</Link><a href="/briefs/claim-intake.html">Read a sample recommendation</a></div>
  </section>;
}

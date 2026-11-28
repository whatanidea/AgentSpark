import { useState } from "react";
export default function StudioPilot() {
  const [pilot, select] = useState(false);
  return <section id="self-service" className="studio-section"><small>Self-service platform</small><h2>Build the brief yourself.</h2>
    <p>Gather observations, compare improvements and share a decision brief with the budget owner. No consulting engagement required.</p>
    <div className="studio-question" id="claim-review"><small>Workflow question / Claims intake</small><h3>What slows a claim down: checking the bill or waiting for a reply?</h3></div>
    <div className="studio-compare"><fieldset><legend>Compare one claim</legend>{["Today","Proposed pilot"].map((v,i)=><label key={v}><input type="radio" name="comparison" checked={pilot===Boolean(i)} onChange={()=>select(Boolean(i))}/>{v}</label>)}</fieldset>
      <div className="studio-scene"><div className="studio-paper"><small>Specimen 01 · Visit dates</small><p>Claim form <b>6 May</b></p><p>Clinic bill <b>8 May</b></p><strong>{pilot?"Date mismatch flagged":"Manual cross-check"}</strong></div>
      <div aria-live="polite"><small>{pilot?"Proposed pilot / Assisted intake":"Today / Manual intake"}</small><h3>{pilot?"The dates come to the specialist.":"Two documents. One pair of eyes."}</h3>
        <p>{pilot?"AI extracts the dates. A rule flags the discrepancy. A specialist checks both sources before contacting the clinic.":"The specialist opens both documents, finds the dates and asks the clinic which is correct."}</p><p><b>Unchanged:</b> the clinic still has to reply.</p></div></div></div>
  </section>;
}

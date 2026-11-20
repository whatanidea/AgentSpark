import { useState } from "react";

export default function ClaimIntakeReview() {
  const [corrected, setCorrected] = useState(false);
  const formDate = "6 May";
  const billDate = corrected ? formDate : "8 May";
  const matches = billDate === formDate;
  return <section className="intake-lab" aria-labelledby="intake-lab-title">
    <small>Receive a claim · Fictional intake desk</small>
    <h3 id="intake-lab-title">Check the visit date.</h3>
    <p>AI reads the service date on the bill. A rule checks it against the claim form.</p>
    <div className="intake-sources">
      <div><small>01 / Claim form</small><p>Physiotherapy visit</p><strong>{formDate}</strong><span>Service date entered on the form</span></div>
      <div><small>02 / {corrected ? "Corrected clinic bill" : "Original clinic bill"}</small><p>Physiotherapy visit</p><strong>{billDate}</strong><span>AI extraction · Bill, line 1: date of service</span></div>
    </div>
    <div className="intake-result" role="status" aria-atomic="true">
      <small>Intake rule · Compare service dates</small>
      <h4 key={billDate}>{matches ? "Dates match. Check eligibility next." : "Dates differ. Ask the clinic to confirm."}</h4>
      <p>{matches ? "Route to eligibility review. The corrected bill resolves the date check, not whether the visit is covered."
        : "Open a date-discrepancy task in the claims specialist’s queue. Attach both source entries so the specialist can verify them."}</p>
      {!matches && <p><b>AI-drafted query:</b> “The form lists 6 May and the bill lists 8 May. Which was the visit date?” The specialist reviews it before sending.</p>}
    </div>
    <button className="landing-button landing-button-primary intake-switch" type="button" onClick={() => setCorrected(!corrected)}>
      {corrected ? "Compare the original bill" : "Try the clinic’s corrected bill"} <span aria-hidden="true">→</span>
    </button>
    <noscript><style>{".intake-switch{display:none!important}"}</style><p>A corrected bill dated 6 May would resolve the date check. Eligibility would still need review.</p></noscript>
    <p className="intake-caption">Workflow preview only. No patient data is processed, task created or message sent.</p>
  </section>;
}

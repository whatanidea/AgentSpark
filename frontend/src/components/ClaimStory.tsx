import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { CONSULTING_OFFERINGS } from "./consultingContent";
import { ConsultationLink } from "./ConsultationBooking";

function ClaimIntakeReview() {
  const [corrected, setCorrected] = useState(false);
  const formDate = "6 May";
  const billDate = corrected ? formDate : "8 May";
  const matches = billDate === formDate;
  return <section className="intake-lab" aria-labelledby="intake-lab-title">
    <small>Receive a claim · Fictional intake desk</small>
    <h3 id="intake-lab-title">Check the visit date.</h3>
    <p>AI finds the date of service on the clinic’s scanned bill, not the date the invoice was issued. A rule compares it with the claim form. The result determines which task opens next.</p>
    <div className="intake-sources">
      <div><small>01 / Claim form</small><p>Physiotherapy visit</p><strong>{formDate}</strong><span>Service date entered on the form</span></div>
      <div><small>02 / {corrected ? "Corrected clinic bill" : "Original clinic bill"}</small><p>Physiotherapy visit</p><strong>{billDate}</strong><span>AI extraction · Bill, line 1: date of service</span></div>
    </div>
    <div className="intake-result" role="status" aria-atomic="true">
      <small>Intake rule · Compare service dates</small>
      <h4>{matches ? "Dates match. Check eligibility next." : "Dates differ. Ask the clinic to confirm."}</h4>
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

export default function ClaimStory({ titleRef, onBook }: { titleRef: RefObject<HTMLHeadingElement>; onBook: () => void }) {
  const [motion, setMotion] = useState(false);
  const film = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const element = film.current;
    if (!motion || !element) return;
    let frame = 0;
    function paint() {
      frame = 0;
      if (!element) return;
      const {top, height} = element.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (68 - top) / Math.max(1, height / 3)));
      element.style.setProperty("--gather", String(progress));
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      element.style.removeProperty("--gather");
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [motion]);
  return <>
    <div id="top" ref={film} className={`claim-film${motion ? " claim-film-moving" : ""}`}>
      <section className="claim-frame" aria-labelledby="landing-title">
        <p className="claim-label">AI consulting for SMEs · Illustrative health claim</p>
        <h1 ref={titleRef} id="landing-title" tabIndex={-1}>One claim. <em>Three places to look.</em></h1>
        <div className="claim-sources" aria-label="Three items in the file">
          <div><small>01 / Claim form</small><b>Physiotherapy · 6 May</b></div>
          <div><small>03 / Plan record</small><b>Member eligibility</b><i /></div>
          <div><small>02 / Itemized bill</small><b>Visit date: 8 May</b><svg viewBox="0 0 180 65" fill="none" aria-hidden="true"><path d="M8 10h148M8 23h86m20 0h42M8 36h70m36 0h42M8 52h148" stroke="currentColor"/><ellipse cx="136" cy="23" rx="28" ry="10" stroke="#743fa1" strokeWidth="3"/></svg></div>
        </div>
        <p>An examiner needs the facts before deciding coverage.</p>
        <div className="claim-controls"><a href="#claim-review">Follow the file ↓</a></div>
      </section>
      <section className="claim-frame claim-review" id="claim-review">
        <p className="claim-label">02 / At the table · Adviser + examiner</p>
        <h2>What takes time? <em>Finding the facts.</em></h2>
        <p>We follow the file with the examiner. Rules can register the claim. AI could gather the evidence. Neither should decide coverage.</p>
        <a href="#claim-assessment">See the assessment ↓</a>
      </section>
      <section className="claim-frame" id="claim-assessment">
        <p className="claim-label">03 / Platform · Sample assessment</p>
        <h2>Inside the assessment.</h2>
        <Link className="claim-preview" to="/resources/example-assessment#workflow-explorer"><picture>
          <source media="(max-width: 550px)" srcSet="/story/receive-claim-narrow.png"/><img src="/story/receive-claim-wide.png" width="1200" height="654" alt="Step 1 selected: Receive a claim. Rules register the request and check required fields."/>
        </picture><span>Open the interactive assessment →</span></Link>
        <a href="#claim-adoption">Next: bring it to the team ↓</a>
      </section>
    </div>
    <section id="claim-adoption" className="story-guide landing-container">
      <p className="landing-eyebrow">From the assessment to the team</p>
      <h2>Take a seat at <em>the intake desk.</em></h2>
      <ClaimIntakeReview />
      <h3>Where does your team need help?</h3>
      {CONSULTING_OFFERINGS.map(offer => <details key={offer.path} name="home-offers"><summary>{offer.question}</summary><p>{offer.summary}</p><Link to={offer.path}>{offer.name} →</Link></details>)}
      <div className="landing-actions"><ConsultationLink onBook={onBook}/><Link className="landing-button landing-button-secondary" to="/platform">Explore the platform →</Link></div>
    </section>
  </>;
}

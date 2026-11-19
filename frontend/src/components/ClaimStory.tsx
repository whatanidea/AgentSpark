import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { CONSULTING_OFFERINGS } from "./consultingContent";
import { ConsultationLink } from "./ConsultationBooking";

export default function ClaimStory({ titleRef, onBook }: { titleRef: RefObject<HTMLHeadingElement>; onBook: () => void }) {
  const [motion, setMotion] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const film = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setInteractive(true);
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
        <p className="claim-label">AI consulting for SMEs · Illustrative claim</p>
        <h1 ref={titleRef} id="landing-title" tabIndex={-1}>One claim. <em>Three places to look.</em></h1>
        <div className="claim-sources" aria-label="Three items in the file">
          <div><small>01 / Inbox</small><b>Water came through the ceiling.</b></div>
          <div><small>03 / Estimate</small><b>Roof repair</b><i /></div>
          <div><small>02 / Inspection</small><b>Reported leak</b><svg viewBox="0 0 180 65" fill="none" aria-hidden="true"><path d="M6 38 78 7l94 24-63 30zM6 38v8l103 18 63-28v-5M55 18l102 22M36 26l102 23M98 13 29 44M130 20 60 51" stroke="currentColor"/><ellipse cx="93" cy="33" rx="19" ry="11" stroke="#743fa1" strokeWidth="3"/></svg></div>
        </div>
        <p>An examiner needs the facts before deciding coverage.</p>
        <div className="claim-controls"><a href="#claim-review">Follow the file ↓</a>{interactive && <button type="button" onClick={() => setMotion(!motion)} aria-pressed={motion}>Scroll motion: {motion ? "on" : "off"}</button>}</div>
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
          <source media="(max-width: 550px)" srcSet="/story/claim-narrow.png"/><img src="/story/claim-wide.png" width="1200" height="654" alt="Claims workflow: rules register the claim, AI prepares evidence, and an examiner decides."/>
        </picture><span>Open the interactive assessment →</span></Link>
        <a href="#claim-adoption">Next: bring it to the team ↓</a>
      </section>
    </div>
    <section id="claim-adoption" className="story-guide landing-container">
      <p className="landing-eyebrow">From the assessment to the team</p>
      <h2>Now put it in an <em>examiner’s hands.</em></h2>
      <blockquote><small>Illustrative coaching exercise · AI draft</small><strong>“The roof repair is complete.”</strong>
        <p>The draft cites an estimate, not a completion record. The examiner flags the sentence and asks for evidence. Coverage stays undecided.</p></blockquote>
      <h3>Where does your team need help?</h3>
      {CONSULTING_OFFERINGS.map(offer => <details key={offer.path} name="home-offers"><summary>{offer.question}</summary><p>{offer.summary}</p><Link to={offer.path}>{offer.name} →</Link></details>)}
      <div className="landing-actions"><ConsultationLink onBook={onBook}/><Link className="landing-button landing-button-secondary" to="/platform">Explore the platform →</Link></div>
    </section>
  </>;
}

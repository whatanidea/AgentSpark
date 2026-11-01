import { Link } from "react-router-dom";
import { MarketingIcon } from "./MarketingVisuals";

export default function HomeUseCases() {
  return <section data-reveal className="marketing-home-use-cases landing-container" aria-labelledby="use-cases-title">
    <div className="marketing-use-case-heading">
      <div><p className="landing-eyebrow">Two lenses. One responsible decision.</p>
        <h2 id="use-cases-title">Understand the work. Prepare the next step.</h2></div>
      <p>Find the friction worth investigating. Establish what must be true before a pilot. More AI is not the predetermined answer.</p>
    </div>
    <div className="marketing-use-case-grid">
      <article className="marketing-use-case" aria-labelledby="readiness-use-case-title" data-kind="readiness">
        <div className="marketing-use-case-label"><MarketingIcon name="readiness" /><p>Before the pilot</p></div>
        <h3 id="readiness-use-case-title">AI readiness</h3>
        <p className="marketing-use-case-question">What needs to be true before you invest?</p>
        <p>Turn an attractive idea into a clear view of data, ownership, controls and evidence gaps.</p>
        <ul>
          <li>Assess workflow suitability separately from pilot readiness.</li>
          <li>Identify validation needs, responsible owners and pilot success measures.</li>
        </ul>
        <figure className="marketing-use-case-example" aria-label="Fictional readiness snapshot">
          <figcaption>Illustrative review, not a readiness certification</figcaption>
          <div className="premium-readiness-summary"><span className="premium-readiness-ring" aria-hidden="true"><MarketingIcon name="readiness" /></span>
            <div><strong>Validation still needed</strong><p>Suitability and pilot readiness are separate decisions.</p></div></div>
          <dl>
            <div><dt>Data access</dt><dd>Needs validation</dd></div>
            <div><dt>Human oversight</dt><dd>Owner to confirm</dd></div>
            <div><dt>Success measures</dt><dd>Baseline needed</dd></div>
          </dl>
        </figure>
        <Link to="/platform/assessment">Explore readiness assessment <span aria-hidden="true">↗</span></Link>
      </article>
      <article className="marketing-use-case" aria-labelledby="process-use-case-title" data-kind="process">
        <div className="marketing-use-case-label"><MarketingIcon name="process" /><p>Before the shortlist</p></div>
        <h3 id="process-use-case-title">Process intelligence</h3>
        <p className="marketing-use-case-question">Where is work harder than it needs to be?</p>
        <p>Bring operators, process owners and technical teams together to explain how work actually happens.</p>
        <ul>
          <li>Connect process steps, pain points, exceptions and systems to their sources.</li>
          <li>Compare process changes, rules-based automation and AI assistance.</li>
        </ul>
        <figure className="marketing-use-case-example" aria-label="Fictional process map">
          <figcaption>Illustrative invoice process, not measured customer data</figcaption>
          <ol className="marketing-process-lane" aria-label="Example process steps">
            <li><MarketingIcon name="evidence" />Receive</li><li><MarketingIcon name="process" />Re-enter<span>Manual handoff</span></li><li><MarketingIcon name="decision" />Review</li>
          </ol>
          <div className="premium-process-source"><span>S1 / Operator contribution</span><strong>“We enter the same details twice.”</strong><small>Submitted statement, not verified evidence</small></div>
          <p>Investigate the handoff. Validate the baseline before estimating value.</p>
        </figure>
        <Link to="/platform/discovery">Explore process discovery <span aria-hidden="true">↗</span></Link>
      </article>
    </div>
    <div className="marketing-home-deliverables">
      <h3>What you leave with</h3>
      <ul aria-label="AgentSpark deliverables">
        <li>Source-linked opportunity shortlist</li><li>Suitability and readiness gaps</li>
        <li>Proposed architecture</li><li>Executive brief and reviewed next step</li>
      </ul>
    </div>
    <p className="marketing-home-boundary">Based on stakeholder input and reviewed evidence, not automatic system monitoring or process mining.
      {" "}Advisory decisions, not autonomous execution. <Link to="/resources/trust">Understand the boundaries ↗</Link></p>
  </section>;
}

import { Link } from "react-router-dom";
import { MarketingIcon } from "./MarketingVisuals";

export function TechnologyBoundaries() {
  return <section className="premium-technology landing-container" aria-labelledby="technology-title">
    <div className="premium-section-heading"><div><p className="landing-eyebrow">Technology with context</p>
      <h2 id="technology-title">Your decisions first.<br /><span>The stack follows.</span></h2></div>
      <p>AgentSpark is an assessment platform, not a model marketplace or an integration gateway. Keep product capabilities separate from a proposed customer solution.</p></div>
    <div className="premium-technology-grid">
      <article><MarketingIcon name="lock" /><span className="premium-category-label">IN THE PLATFORM</span><h3>Scoped collaboration</h3>
        <p>Microsoft sign-in, team-scoped discovery, source provenance and reviewed assessment outputs.</p><span className="premium-tech-badge">AgentSpark capability</span></article>
      <article><MarketingIcon name="cloud" /><span className="premium-category-label">IN THE BLUEPRINT</span><h3>Cloud-aligned candidates</h3>
        <div className="premium-cloud-options" aria-label="Proposed target cloud options"><span><MarketingIcon name="cloud" />Azure</span><span><MarketingIcon name="cloud" />AWS</span></div>
        <p>Service candidates for the selected assessment cloud. Not connected integrations, provisioned infrastructure or model-provider endorsements.</p></article>
      <article><MarketingIcon name="blueprint" /><span className="premium-category-label">WITH YOUR DELIVERY TEAM</span><h3>Validation and implementation</h3>
        <p>Your team confirms data access, permissions, availability, controls and deployment before using a proposed design.</p><Link to="/platform/architecture">Review delivery boundaries ↗</Link></article>
    </div>
  </section>;
}

export default function BuyerConfidence({ disabled, onDiscover }: { disabled: boolean; onDiscover: () => void }) {
  return <section className="premium-buyer landing-container" aria-labelledby="buyer-title">
    <div className="premium-buyer-copy"><p className="landing-eyebrow">Evaluate before you commit</p>
      <h2 id="buyer-title">A clearer investment decision.<br /><span>Not another AI promise.</span></h2>
      <p>Start with one process. Bring the people who know it. Inspect the outputs before deciding what deserves a pilot.</p>
      <div className="landing-actions"><Link className="landing-button landing-button-primary" to="/resources/example-assessment">Explore an example <span aria-hidden="true">↗</span></Link>
        <button className="landing-button landing-button-secondary" disabled={disabled} onClick={onDiscover}>Start a workflow review <span aria-hidden="true">↗</span></button></div>
      <p className="premium-buyer-note">Examples are public. A workflow review starts in signed-in discovery; it is not a booked consultation or a promise of follow-up.</p>
      <Link className="premium-trust-link" to="/resources/trust"><MarketingIcon name="lock" />Read our access, retention and review boundaries ↗</Link>
    </div>
    <div className="premium-deliverable-stack" aria-label="Illustrative assessment deliverables">
      <article className="premium-document"><span className="premium-document-brand">✦ AgentSpark <small>ILLUSTRATIVE / NOT APPROVED</small></span>
        <h3>Workflow<br />decision brief</h3><p>Invoice exception handling</p><div className="premium-document-rule" />
        <ol><li>Source-linked opportunity shortlist</li><li>Suitability and readiness gaps</li><li>Proposed architecture</li><li>Executive brief and next step</li></ol>
        <p className="premium-document-note">Preview only. Create an assessment to export your own report.</p>
      </article>
      <span className="premium-document-tab"><MarketingIcon name="evidence" />Evidence & assumptions</span>
      <span className="premium-document-tab"><MarketingIcon name="blueprint" />Proposed blueprint</span>
    </div>
  </section>;
}

import { Link } from "react-router-dom";
import { CONSULTING_OFFERINGS, type ConsultingOffering } from "./consultingContent";
import { MarketingIcon } from "./MarketingVisuals";
import BuyerConfidence from "./BuyerConfidence";

type DiscoveryAction = { disabled: boolean; onDiscover: () => void; onBook: () => void };

function OfferingCards({ compact = false }: { compact?: boolean }) {
  const chapters = ["Find the opportunity.", "Equip your people.", "Prove a workflow.", "Build lasting adoption."];
  return <div className={`editorial-chapters${compact ? " editorial-chapters-compact" : ""}`}>
    {CONSULTING_OFFERINGS.map((offer, index) => <article data-reveal key={offer.path} aria-label={offer.name}>
      <span className="editorial-chapter-number" aria-hidden="true">0{index + 1}</span>
      <div className="editorial-chapter-copy"><p className="consulting-question">{offer.name}</p><h3>{chapters[index]}</h3>
        {!compact && <p>{offer.summary}</p>}<span className="consulting-format">{offer.format}</span></div>
      <div className="editorial-chapter-mark" aria-hidden="true"><MarketingIcon name={offer.icon} /><span /></div>
      <Link to={offer.path} aria-label={`Explore ${offer.name}`}>Explore the offering <span aria-hidden="true">↗</span></Link>
    </article>)}
  </div>;
}

export function HomeConsulting({ disabled, onDiscover, onBook }: DiscoveryAction) {
  return <section className="consulting-home landing-container" aria-labelledby="consulting-home-title">
    <div className="premium-section-heading"><div><p className="landing-eyebrow">AgentSpark Consulting</p>
      <h2 id="consulting-home-title">A deliberate journey.<br /><span>Not another AI experiment.</span></h2></div>
      <div><p>Become AI-native through practical strategy, customer-owned platforms, workforce skills and measured workflow improvement. Start with one business priority, not every AI tool.</p>
        <Link className="consulting-text-link" to="/consulting">Meet your transformation journey <span aria-hidden="true">↗</span></Link></div></div>
    <OfferingCards compact />
    <div className="consulting-home-bottom"><p>Consulting delivery is separately scoped. Platform discovery is not a booked consultation or a promise of follow-up.</p>
      <div className="consulting-booking-actions"><button className="landing-button landing-button-primary" onClick={onBook}>Book a consultation <span aria-hidden="true">↗</span></button>
        <button className="consulting-text-link" disabled={disabled} onClick={onDiscover}>Start a workflow review <span aria-hidden="true">↗</span></button></div></div>
  </section>;
}

function ProviderChoices() {
  return <section className="consulting-section consulting-providers landing-container" aria-labelledby="consulting-providers-title">
    <div className="premium-section-heading"><div><p className="landing-eyebrow">Provider choice, with purpose</p>
      <h2 id="consulting-providers-title">Choose for the work.<br /><span>Not for the logo.</span></h2></div>
      <p>We can help evaluate and plan adoption across OpenAI, Anthropic and Google. Start with one suitable primary tool; add providers only when a requirement justifies it.</p></div>
    <div className="consulting-provider-grid">{[
      ["OpenAI", "ChatGPT / OpenAI API", "Business workspace adoption and developer projects are separate tracks.", "https://developers.openai.com/api/docs/guides/your-data"],
      ["Anthropic", "Claude / Claude API", "Match workplace access and developer workloads to the appropriate product and plan.", "https://claude.com/pricing"],
      ["Google", "Gemini", "Distinguish Workspace, Gemini Enterprise, Gemini Developer API and Vertex AI.", "https://ai.google.dev/gemini-api/terms"],
    ].map(([name, products, detail, source]) => <article key={name}>
      <span className="consulting-provider-name">{name}</span><h3>{products}</h3><p>{detail}</p>
      <a href={source} target="_blank" rel="noopener noreferrer">Official product guidance <span className="consulting-sr-only">(opens a new tab)</span><span aria-hidden="true">↗</span></a>
    </article>)}</div>
    <p className="consulting-note">Independent advisory, not a partner or reseller claim. Customer-owned accounts and provider contracts; licenses and API usage are separate from consulting fees. Features, data terms, regions and eligibility must be checked for the selected plan. No provider is connected by visiting this page.</p>
  </section>;
}

function DeliveryPrinciples() {
  return <section className="consulting-section consulting-principles landing-container" aria-labelledby="consulting-principles-title">
    <div><p className="landing-eyebrow">A business case others can inspect</p><h2 id="consulting-principles-title">Ambition, with an<br />evidence trail.</h2>
      <p>For leadership, investment and programme-review conversations, explain the problem, the delivery method and what the evidence does not yet prove.</p>
      <Link className="consulting-text-link" to="/resources/trust">Read our trust and delivery boundaries <span aria-hidden="true">↗</span></Link></div>
    <div className="consulting-principle-grid">{[
      ["Business outcomes", "Define a baseline, an owner and acceptance measures before claiming improvement. Estimates remain estimates."],
      ["Repeatable delivery", "Use a bounded method and reviewable outputs. Reuse the approach, not confidential customer information."],
      ["Customer capability", "Train champions, document decisions and hand over ownership instead of creating avoidable dependency."],
      ["European project diligence", "Review data roles, transfers, retention, accessibility and applicable AI Act obligations for the actual use case. No blanket GDPR or AI Act certification is claimed."],
    ].map(([title, detail]) => <article key={title}><MarketingIcon name="decision" /><h3>{title}</h3><p>{detail}</p></article>)}</div>
  </section>;
}

export default function ConsultingContent({ path, disabled, onDiscover, onBook }: DiscoveryAction & { path: string }) {
  const offering = CONSULTING_OFFERINGS.find(item => item.path === path);
  if (path !== "/consulting" && !offering) throw new Error(`Unknown consulting offering: ${path}`);
  return <>
    {offering ? <OfferingDetail offering={offering} /> : <>
      <section className="consulting-section landing-container" aria-labelledby="consulting-definition-title">
        <div className="consulting-definition"><span className="premium-category-label">What AI-native means here</span>
          <h2 id="consulting-definition-title">Better ways of working.<br />People still accountable.</h2>
          <p>An AI-native organization considers AI when designing work, equips its people to use it responsibly and measures the result. It does not automate every decision or replace every process with an agent.</p></div>
        <div className="consulting-offers-heading"><p className="landing-eyebrow">Four connected offerings</p><h2>Start where you are. Build what comes next.</h2></div>
        <OfferingCards />
      </section>
    </>}
    {(path === "/consulting" || path === "/consulting/workspace-launch") && <ProviderChoices />}
    <section className="consulting-section consulting-responsibilities landing-container" aria-labelledby="consulting-responsibilities-title">
      <div className="premium-section-heading"><div><p className="landing-eyebrow">One brand. Clear responsibilities.</p>
        <h2 id="consulting-responsibilities-title">Consulting and software.<br /><span>Complementary, not interchangeable.</span></h2></div>
        <p>Engagement scope, deliverables, access and commercial terms are agreed before delivery. No automatic onboarding, deployment or business action is implied.</p></div>
      <div className="consulting-role-grid">{[
        ["AgentSpark Consulting", "Facilitates discovery, advises on provider selection and can support agreed onboarding, training and pilot delivery."],
        ["AgentSpark Platform", "Structures source-linked discovery and assessment. Existing blueprint candidates cover Azure and AWS, not Google Cloud generation."],
        ["Your organization", "Owns provider accounts, contracts, data access, budget and approvals. Human owners authorize implementation and operating responsibilities."],
      ].map(([title, detail]) => <article key={title}><h3>{title}</h3><p>{detail}</p></article>)}</div>
    </section>
    {path === "/consulting" && <><DeliveryPrinciples /><BuyerConfidence disabled={disabled} onDiscover={onDiscover} /></>}
    <section className="consulting-section consulting-next landing-container" aria-labelledby="consulting-next-title">
      <div><p className="landing-eyebrow">Your next decision</p><h2 id="consulting-next-title">Bring one business question.</h2>
        <p>Book a consultation through Cal.com, or ask your AI assistant to help coordinate. Prefer to explore first? Platform discovery remains a separate, signed-in action. Consulting scope is agreed before delivery.</p></div>
      <div className="landing-actions"><button className="landing-button landing-button-primary" onClick={onBook}>Book a consultation <span aria-hidden="true">↗</span></button>
        <button className="landing-button landing-button-secondary" disabled={disabled} onClick={onDiscover}>Start in the platform <span aria-hidden="true">↗</span></button></div>
    </section>
  </>;
}

function OfferingDetail({ offering }: { offering: ConsultingOffering }) {
  return <>
    <section className="consulting-section consulting-detail landing-container" aria-labelledby="consulting-outcomes-title">
      <div className="consulting-outcome"><span className="premium-category-label">{offering.format}</span><MarketingIcon name={offering.icon} />
        <h2 id="consulting-outcomes-title">{offering.outcome}</h2><p>{offering.audience}</p>
        <Link className="consulting-text-link" to="/consulting">All consulting offerings <span aria-hidden="true">↗</span></Link></div>
      <div className="consulting-deliverables"><p className="landing-eyebrow">What the engagement can include</p><h2>Concrete outputs.<br />An agreed scope.</h2>
        <ul>{offering.deliverables.map(item => <li key={item}><MarketingIcon name="evidence" /><span>{item}</span></li>)}</ul>
        <p className="consulting-note">{offering.boundary}</p></div>
    </section>
    <section className="consulting-section landing-container" aria-labelledby="consulting-method-title">
      <div className="consulting-offers-heading"><p className="landing-eyebrow">How we approach the work</p><h2 id="consulting-method-title">Four stages. A decision at each step.</h2></div>
      <ol className="consulting-method">{offering.steps.map(([title, detail], index) => <li key={title}>
        <span className="consulting-step-number">0{index + 1}</span><h3>{title}</h3><p>{detail}</p></li>)}</ol>
    </section>
    <nav className="consulting-related landing-container" aria-label="Other consulting offerings">
      {CONSULTING_OFFERINGS.filter(item => item.path !== offering.path).map(item =>
        <Link key={item.path} to={item.path}><MarketingIcon name={item.icon} /><span>{item.name}</span><span aria-hidden="true">↗</span></Link>)}
    </nav>
  </>;
}

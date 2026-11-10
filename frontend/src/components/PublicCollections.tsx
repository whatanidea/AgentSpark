import { Link } from "react-router-dom";
import { MarketingIcon, publicVisual } from "./MarketingVisuals";
import { PUBLIC_PAGES, type PublicPage } from "./publicPages";

const featured = new Set(["/platform/alignment", "/platform/assessment", "/platform/architecture", "/platform/workspaces"]);
const featureCopy: Record<string, readonly [string, string, string]> = {
  "/platform/alignment": ["Agree priorities", "Make goals, differences and responsibilities clear before choosing a tool.", "Explore team agreement"],
  "/platform/assessment": ["Review an opportunity", "Understand the likely benefits, missing information and sensible next step.", "Explore opportunity reviews"],
  "/platform/architecture": ["See a practical plan", "Review how a proposed improvement could work and where people stay in control.", "Explore proposed plans"],
  "/platform/workspaces": ["Work with your team", "Keep each team's discussions and assessments in the right workspace.", "Explore team workspaces"],
};

export function FeaturedCapabilities() {
  return <section className="public-capabilities landing-container" aria-labelledby="public-capabilities-title">
    <div className="public-section-heading"><div><p className="landing-eyebrow">Software that supports the conversation</p>
      <h2 id="public-capabilities-title">Get your team together.<br /><span>Make a clearer decision.</span></h2></div>
      <Link className="public-text-link" to="/platform">Explore the platform <span aria-hidden="true">→</span></Link></div>
    <div className="public-capability-grid">{PUBLIC_PAGES.filter(page => featured.has(page.path)).map(page =>
      <Link key={page.path} to={page.path} className="public-capability-card">
        <div><MarketingIcon name={publicVisual(page).icon} /></div>
        <h3>{featureCopy[page.path][0]}</h3><p>{featureCopy[page.path][1]}</p><span className="public-card-action">{featureCopy[page.path][2]} <span aria-hidden="true">→</span></span>
      </Link>)}</div>
  </section>;
}

const cases: Record<string, { example: string; challenge: string; deliverable: string }> = {
  "/solutions/transformation": { example: "A shared-services transformation", challenge: "Many AI ideas. Different priorities. No accepted owners.", deliverable: "An explainable shortlist and an accountable next step." },
  "/solutions/operations": { example: "An invoice exception review", challenge: "Repeat checks, unclear handoffs and payment decisions that must stay human.", deliverable: "A bounded improvement hypothesis, evidence gaps and a proposed controlled workflow." },
  "/solutions/advisory": { example: "A client discovery engagement", challenge: "Different stakeholder accounts and a recommendation nobody can trace.", deliverable: "Source-linked findings, an executive brief and a visual proposal for client review." },
};

export function SolutionStory({ page }: { page: PublicPage }) {
  const example = cases[page.path];
  if (!example) throw new Error(`No solution scenario configured for ${page.path}`);
  return <section className="public-solution-story landing-container" aria-labelledby="solution-story-title">
    <div className="public-section-heading"><div><p className="landing-eyebrow">An illustrative engagement</p>
      <h2 id="solution-story-title">{example.example}</h2></div><p>Start with the work. Leave with a clearer decision, not a promise of automated delivery.</p></div>
    <div className="public-solution-outcome"><div><span>THE STARTING QUESTION</span><p>{example.challenge}</p></div>
      <span className="public-outcome-arrow" aria-hidden="true">→</span><div><span>THE REVIEWABLE OUTPUT</span><p>{example.deliverable}</p></div></div>
    <ol className="public-solution-steps">{page.details.map(([heading, text], index) =>
      <li key={heading}><span>0{index + 1}</span><h3>{heading}</h3><p>{text}</p></li>)}</ol>
    <Link className="public-text-link" to="/resources/decision-guide">Prepare your decision review <span aria-hidden="true">→</span></Link>
  </section>;
}

const resourceFormats: Record<string, string> = {
  "/resources/how-it-works": "Product walkthrough",
  "/resources/example-assessment": "Interactive example",
  "/resources/decision-guide": "Review guide",
  "/resources/whats-new": "Capability collection",
  "/resources/trust": "Product boundaries",
};

export function PublicCollection({ page }: { page: PublicPage }) {
  const pages = PUBLIC_PAGES.filter(item => item.section === page.section && item.path !== page.path);
  return <section className={`public-collection public-collection-${page.section.toLowerCase()} landing-container`} aria-label={`${page.section} directory`}>
    <div className="public-collection-grid">{pages.map(item => <Link key={item.path} to={item.path} className="public-directory-card">
      <div className="public-directory-cover"><MarketingIcon name={publicVisual(item).icon} />
        <span>{page.section === "Resources" ? resourceFormats[item.path] : "A business-first evaluation"}</span>
        <div aria-hidden="true" className="public-cover-lines"><span /><span /><span /></div></div>
      <div className="public-directory-copy"><h2>{item.name}</h2><p>{item.summary}</p>
        <span className="public-card-action">{page.section === "Resources" ? "Read" : "Explore"} {item.name} <span aria-hidden="true">→</span></span></div>
    </Link>)}</div>
  </section>;
}

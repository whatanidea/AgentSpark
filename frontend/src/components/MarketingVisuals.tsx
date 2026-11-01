import type { PublicPage } from "./publicPages";

export type MarketingIconName = "process" | "people" | "evidence" | "readiness" | "blueprint" | "decision" | "cloud" | "lock";
const paths: Record<MarketingIconName, string> = {
  process: "M3 4h6v6H3V4Zm12 10h6v6h-6v-6ZM9 7h8v7M6 10v7h9",
  people: "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-5a3 3 0 0 1 0 6m0 3a4 4 0 0 1 4 4v2",
  evidence: "M6 3h9l4 4v14H6V3Zm8 0v5h5M9 12h7M9 16h5",
  readiness: "M4 5h16v15H4V5Zm4-3v5m8-5v5M8 11h3m-3 5h3m3-5h2m-2 5h2",
  blueprint: "M9 3h6v5H9V3ZM3 16h6v5H3v-5Zm12 0h6v5h-6v-5ZM12 8v4m-6 4v-4h12v4",
  decision: "m4 7 2 2 3-4m-5 12 2 2 3-4M12 7h8M12 17h8",
  cloud: "M7 18a5 5 0 1 1 .5-10A6 6 0 0 1 19 9a4.5 4.5 0 0 1-1 9H7Z",
  lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 4v3",
};

export function MarketingIcon({ name }: { name: MarketingIconName }) {
  return <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}

type Visual = { icon: MarketingIconName; title: string; label: string; items: readonly (readonly [string, string])[] };
const visuals: Record<string, Visual> = {
  "/about": { icon: "decision", title: "Business first. Evidence throughout.", label: "Our decision principles",
    items: [["Start with the work", "Not a preferred model"], ["Question the evidence", "Unknowns stay visible"], ["Keep people accountable", "A reviewed next step"]] },
  "/platform/discovery": { icon: "people", title: "One process. Different perspectives.", label: "Fictional process discovery",
    items: [["Receive invoice", "Operator: repeated entry"], ["Check details", "Technical owner: access unknown"], ["Review exception", "Process owner: clarify ownership"], ["Human decision", "Authority stays with people"]] },
  "/platform/prioritization": { icon: "evidence", title: "The reasoning belongs beside the shortlist.", label: "Fictional opportunity review",
    items: [["Duplicate checks", "Sources S1, S3"], ["Exception routing", "Ownership unresolved"], ["Compare alternatives", "Process change / rules / AI"], ["Review the shortlist", "Unknowns are not zero"]] },
  "/platform/assessment": { icon: "readiness", title: "An attractive idea is not a ready pilot.", label: "Fictional assessment snapshot",
    items: [["Workflow suitability", "Assess the work"], ["Data access", "Needs validation"], ["Human oversight", "Owner to confirm"], ["Pilot measures", "Baseline needed"]] },
  "/platform/architecture": { icon: "blueprint", title: "Reasoning. Orchestration. Human authority.", label: "Conceptual blueprint preview",
    items: [["Business inputs", "Access to validate"], ["AI assistance", "Proposals, not actions"], ["Workflow controls", "State / retries / escalation"], ["Human approval", "Customer-authorized action"]] },
  "/solutions/transformation": { icon: "decision", title: "Build the investment case before the backlog.", label: "Illustrative transformation engagement",
    items: [["Business objective", "A bounded question"], ["Opportunity shortlist", "Source-linked hypotheses"], ["Readiness review", "Evidence and owners"], ["Investment decision", "A reviewed next step"]] },
  "/solutions/operations": { icon: "process", title: "Follow the work. Find the friction.", label: "Fictional operations workflow",
    items: [["Receive", "Existing business input"], ["Re-enter", "Reported manual handoff"], ["Resolve exception", "Evidence to validate"], ["Approve", "Human authority"]] },
  "/solutions/advisory": { icon: "evidence", title: "A recommendation your client can inspect.", label: "Illustrative advisory deliverables",
    items: [["Stakeholder perspectives", "Submitted sources"], ["Opportunity rationale", "Assumptions visible"], ["Proposed blueprint", "Customer delivery required"], ["Executive brief", "Versioned advisory decision"]] },
  "/resources/how-it-works": { icon: "process", title: "Four stages. Four different decisions.", label: "The AgentSpark evaluation path",
    items: [["Discover", "How does work happen?"], ["Prioritize", "Which opportunities deserve review?"], ["Prepare", "What needs validation?"], ["Decide", "What is the next step?"]] },
  "/resources/example-assessment": { icon: "evidence", title: "Open the example. Follow the evidence.", label: "Fictional assessment, not a customer result",
    items: [["Workflow facts", "Explore three examples"], ["Readiness gaps", "Owners and evidence"], ["Cloud candidates", "Azure / AWS proposals"], ["Executive output", "Illustrative, not approved"]] },
  "/resources/trust": { icon: "lock", title: "Clear boundaries are part of the product.", label: "Product boundaries, not a certification",
    items: [["Scoped access", "Signed-in team membership"], ["Visible provenance", "Submitted sources are unverified"], ["Bounded retention", "Explicit expiry and renewal"], ["Human authority", "No autonomous business actions"]] },
};

export function publicVisual(page: PublicPage): Visual {
  const visual = visuals[page.path];
  if (!visual) throw new Error(`No public illustration configured for ${page.path}`);
  return visual;
}

export function PageVisual({ page }: { page: PublicPage }) {
  const visual = publicVisual(page);
  return <figure className={`premium-page-visual premium-visual-${visual.icon}`} aria-label={visual.label}>
    <div className="premium-visual-top"><MarketingIcon name={visual.icon} /><span>{visual.label}</span></div>
    <h2>{visual.title}</h2>
    <ol className="premium-visual-nodes">{visual.items.map(([title, detail], index) =>
      <li key={title}><span className="premium-node-number">0{index + 1}</span>
        <div><strong>{title}</strong><small>{detail}</small></div><span aria-hidden="true">↗</span></li>)}</ol>
    <figcaption>{page.section === "About" || page.path === "/resources/trust" || page.path === "/resources/how-it-works"
      ? "Explore the product below. No connected systems or saved records."
      : "Illustrative only. Not measured customer data, verified evidence or a deployed workflow."}</figcaption>
  </figure>;
}

export function SignatureJourney() {
  return <figure className="signature-journey" aria-label="Fictional invoice opportunity, from process friction to a reviewed next step">
    <div className="signature-grid" aria-hidden="true" />
    <div className="signature-top"><span className="premium-live-mark" aria-hidden="true" /><span>OPPORTUNITY WORKSPACE</span><span>Fictional example</span></div>
    <div className="signature-question"><MarketingIcon name="process" /><div><small>THE BUSINESS QUESTION</small>
      <strong>Where are invoice checks repeated?</strong></div></div>
    <div className="signature-process" aria-label="Illustrative process steps">
      <span>Receive</span><span data-friction="true">Re-enter<small>Reported friction</small></span><span>Review</span>
    </div>
    <div className="signature-contributions">
      <div><span className="signature-avatar">BO</span><p><strong>Business operator</strong><span>“We enter the same details twice.”</span></p><small>S1</small></div>
      <div><span className="signature-avatar">TO</span><p><strong>Technical owner</strong><span>“Access still needs validation.”</span></p><small>S3</small></div>
    </div>
    <div className="signature-opportunity"><div><MarketingIcon name="evidence" /><span>SOURCE-LINKED HYPOTHESIS</span></div>
      <strong>Investigate duplicate checks</strong><p>Compare process change, rules and AI assistance.</p>
      <div className="signature-source-tags"><span>Source S1</span><span>Source S3</span><span>Human review required</span></div>
    </div>
    <figcaption><MarketingIcon name="decision" />A reviewed next step, not an automatic deployment.</figcaption>
  </figure>;
}

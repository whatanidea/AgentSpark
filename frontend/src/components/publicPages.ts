export type PublicPage = {
  path: string; name: string; section: "Overview" | "About" | "Platform" | "Solutions" | "Resources";
  title: string; summary: string; details: readonly (readonly [string, string])[];
  stage?: "Discover" | "Synthesize" | "Prioritize" | "Assess";
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", name: "Home", section: "Overview", title: "Choose the right AI opportunities. Before you build anything.",
    summary: "Discover opportunities with your team, prioritize with evidence, and assess before you build.", details: [] },
  { path: "/about", name: "About", section: "About", title: "Better decisions before bigger commitments.",
    summary: "AgentSpark helps teams decide where AI belongs in their business. Start with the work, question the assumptions, and keep people accountable.",
    details: [
      ["Business first", "A business objective and the people doing the work come before a model or an architecture."],
      ["Evidence throughout", "Sources, disagreements and missing information remain visible. Generated recommendations are hypotheses to review, not independently verified facts."],
      ["People accountable", "Predictable rules stay deterministic. Human judgment, permissions and approval boundaries remain explicit."],
    ] },
  { path: "/platform/discovery", name: "Discovery & stakeholder input", section: "Platform", stage: "Discover",
    title: "Hear the people who know the work.", summary: "Bring a business brief and different stakeholder perspectives into one structured discovery engagement.",
    details: [
      ["Define the conversation", "Record the business objective, sponsor, scope, required topics and exclusions before collecting input."],
      ["Invite the right perspectives", "Assign active signed-in team members as business operators, process owners or technical owners using existing team access."],
      ["Separate drafts from evidence", "Participants own their responses. Drafts stay out of synthesis; submitted statements remain unverified source material."],
    ] },
  { path: "/platform/prioritization", name: "Synthesis & prioritization", section: "Platform", stage: "Prioritize",
    title: "Build a shortlist you can explain.", summary: "Connect hypotheses to source statements and compare explicit assumptions instead of hiding the decision in a score.",
    details: [
      ["Keep the differences", "Synthesis surfaces themes, opportunities, disagreements and open questions. Source edits mark existing snapshots stale."],
      ["Show the weighting", "Priority uses value 30%, feasibility 25%, confidence 20%, risk 15% and effort 10%. Higher risk and effort reduce priority."],
      ["Leave unknowns unranked", "Missing ratings or source references withhold a score. Ratings are assessor judgments, not verified confidence, suitability or measured savings."],
    ] },
  { path: "/platform/assessment", name: "Assessment & executive decisions", section: "Platform", stage: "Assess",
    title: "Turn a hypothesis into a reviewed decision.", summary: "Select an opportunity for a separate workflow assessment. Confirm the facts before deciding what a responsible pilot would need.",
    details: [
      ["Review the handoff", "Choose the assessment model and target cloud. Carry the reviewed source snapshot forward without treating it as confirmed workflow facts."],
      ["Assess the whole picture", "Use a bounded interview, suitability criteria, readiness checks, evidence and illustrative business-case assumptions."],
      ["Prepare the decision", "Review the executive brief, gaps and proposed next action. Advisory approval does not grant permissions or authorize deployment."],
    ] },
  { path: "/platform/architecture", name: "Architecture & review", section: "Platform",
    title: "A reviewable architecture. Not automatic execution.", summary: "Explore a cloud-aligned blueprint that separates AI reasoning, predictable orchestration and human-authorized decisions.",
    details: [
      ["Choose the solution cloud", "Assessment outputs can propose Azure or AWS service candidates. AgentSpark itself remains Azure-hosted."],
      ["Separate reasoning from execution", "Runtime recommendations distinguish model reasoning from durable workflow execution, retries, state and human checkpoints."],
      ["Validate before delivery", "Check availability, integration access, identity, data residency and operating controls. Generated scaffolds and diagrams are starting points for review."],
    ] },
  { path: "/solutions/transformation", name: "Transformation teams", section: "Solutions",
    title: "Build the shortlist before the backlog.", summary: "Give stakeholders a shared basis for identifying opportunities before committing implementation resources.",
    details: [
      ["Start with the objective", "Define the business problem and scope, rather than beginning with a list of tools to deploy."],
      ["Compare the assumptions", "Review source-linked opportunities using transparent ratings. Resolve disagreements and gaps before accepting the shortlist."],
      ["Choose a bounded next step", "Hand a selected hypothesis into assessment and review what evidence a pilot would need. A ranked opportunity is not pilot-ready."],
    ] },
  { path: "/solutions/operations", name: "Finance & operations", section: "Solutions",
    title: "Start with the friction people recognize.", summary: "Investigate repeated work, exception handling and decisions that must stay human-controlled.",
    details: [
      ["Follow an item through the work", "Capture the steps, systems, volume, exceptions and decision points that shape the existing workflow."],
      ["Keep authority explicit", "Document who approves payments, coverage or access. An assistant can propose information without taking those decisions."],
      ["Measure before making promises", "Validate baseline handling time, data quality and access. Capacity illustrations exclude delivery, adoption and operating costs."],
    ] },
  { path: "/solutions/advisory", name: "Consultancies & advisory teams", section: "Solutions",
    title: "Structure the conversation with your clients.", summary: "Organize stakeholder discovery and prepare evidence-led recommendations using existing signed-in team access.",
    details: [
      ["Bring different roles together", "Collect structured operator, process-owner and technical-owner perspectives within an engagement."],
      ["Make recommendations traceable", "Keep submitted sources, generated hypotheses, open questions and rating assumptions connected."],
      ["Hand over a reviewable assessment", "Export the assessment or executive brief with its provenance and limitations. This is not a white-label offering or a formal partner program."],
    ] },
  { path: "/resources/how-it-works", name: "How it works", section: "Resources",
    title: "From business question to clearer next step.", summary: "Discover, prioritize, assess and review. Each stage makes a different decision visible instead of assuming everything should be autonomous.",
    details: [] },
  { path: "/resources/example-assessment", name: "Illustrative assessment", section: "Resources",
    title: "Explore the work before signing in.", summary: "Try fictional claims, invoice and onboarding examples. Explore human boundaries, readiness gaps, capacity assumptions and cloud candidates without model calls or saved records.",
    details: [] },
  { path: "/resources/trust", name: "Trust & limitations", section: "Resources",
    title: "Know what is supported. Know what is still unknown.", summary: "AgentSpark supports a responsible decision process. It does not independently verify your evidence, certify compliance or execute your business workflow.",
    details: [] },
];

export function publicPage(pathname: string) {
  const path = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  return PUBLIC_PAGES.find(page => page.path === path);
}

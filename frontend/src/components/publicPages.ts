import { CONSULTING_OFFERINGS, CONSULTING_OVERVIEW } from "./consultingContent";

export type PublicPage = {
  path: string; name: string; section: "Overview" | "About" | "Consulting" | "Platform" | "Solutions" | "Resources";
  title: string; summary: string; details: readonly (readonly [string, string])[];
  stage?: "Discover" | "Synthesize" | "Prioritize" | "Assess";
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", name: "Home", section: "Overview", title: "One claim. Three places to look.",
    summary: "AgentSpark helps SMEs choose where AI belongs, test a workflow and train the people who use it. Follow one claim from a business question to a team decision.", details: [] },
  { ...CONSULTING_OVERVIEW, section: "Consulting", details: [] },
  ...CONSULTING_OFFERINGS.map(offering => ({
    path: offering.path, name: offering.name, title: offering.title, summary: offering.summary,
    section: "Consulting" as const, details: [],
  })),
  { path: "/about", name: "About", section: "About", title: "The firm behind the assessment.",
    summary: "We help smaller businesses decide what to change in the way they work. Our advisers work alongside your team; our software records the evidence behind the decision.",
    details: [
      ["Business first", "A business objective and the people doing the work come before a model or an architecture."],
      ["Evidence throughout", "Sources, disagreements and missing information remain visible. Generated recommendations are hypotheses to review, not independently verified facts."],
      ["People accountable", "Predictable rules stay deterministic. Human judgment, permissions and approval boundaries remain explicit."],
      ["Two complementary roles", "The platform structures discovery and assessment. Consulting can support adoption and delivery through a separately agreed engagement; it does not add automatic provisioning to the software."],
    ] },
  { path: "/platform", name: "Platform overview", section: "Platform",
    title: "Bring one workflow into focus.",
    summary: "Collect the accounts of people doing the work, compare improvements and hand a decision brief to the person responsible. Use the platform with or without an adviser.", details: [] },
  { path: "/platform/discovery", name: "Discovery & stakeholder input", section: "Platform", stage: "Discover",
    title: "Where does the work slow down?", summary: "Ask operators to describe a recent case. Attach their accounts to the steps, systems and handoffs they know.",
    details: [
      ["Define the process", "Record its owner, goal, scope, steps, systems and baseline pain. Link contributions and opportunities to the work being assessed."],
      ["Request the right perspectives", "Ask active signed-in operators, process owners and technical owners for specific process or step contributions, with a due date and visible status."],
      ["Review the evidence", "Keep drafts out of synthesis, distinguish estimates from reviewed evidence and resolve clarifications. Stakeholder submissions do not become verified facts automatically."],
    ] },
  { path: "/platform/alignment", name: "Stakeholder alignment & decisions", section: "Platform",
    title: "Who agrees, and who will own it?",
    summary: "Record where people agree, what conditions they attach and which responsibilities they accept.",
    details: [
      ["Define the shared outcome", "Make the business objective, success measures and constraints explicit. Keep different stakeholder positions and conditions visible."],
      ["Ask people to accept responsibility", "Nominate active team members as stakeholders, accountable owners or decision holders. A nomination is not acceptance; members act through their own signed-in identities."],
      ["Keep the decision current", "Record decision rationale, referenced sources, next actions and due dates. Scope changes can invalidate current alignment; silence never establishes consensus."],
    ] },
  { path: "/platform/prioritization", name: "Synthesis & prioritization", section: "Platform", stage: "Prioritize",
    title: "Build a shortlist you can explain.", summary: "Connect hypotheses to source statements and compare explicit assumptions instead of hiding the decision in a score.",
    details: [
      ["Keep the differences", "Synthesis surfaces themes, opportunities, disagreements and open questions. Source edits mark existing snapshots stale."],
      ["Show the weighting", "Priority uses value 30%, feasibility 25%, confidence 20%, risk 15% and effort 10%. Higher risk and effort reduce priority."],
      ["Leave unknowns unranked", "Missing ratings or source references withhold a score. Ratings are assessor judgments, not verified confidence, suitability or measured savings."],
      ["Consider non-AI paths", "Compare leaving the process unchanged, process improvement, deterministic automation, AI assistance and a hybrid approach with explicit rationale. More AI is not the predetermined answer."],
    ] },
  { path: "/platform/assessment", name: "Assessment & executive decisions", section: "Platform", stage: "Assess",
    title: "Is this workflow ready for a pilot?", summary: "Review where AI fits, what still needs testing and who makes the final decision. Add a business case if you have evidence for it.",
    details: [
      ["Review the handoff", "Choose the assessment model and target cloud. Carry the reviewed source snapshot forward without treating it as confirmed workflow facts."],
      ["Assess the whole picture", "Use document-supported intake, role-based interviews, suitability criteria and readiness checks. Capacity, cash savings, avoided hiring and service outcomes are separate optional assumptions, not guaranteed returns."],
      ["Prepare the decision", "Review concise, outcome-first recommendations and a source-linked executive brief. Export a decision PDF or Markdown; advisory approval does not authorize a pilot or deployment."],
    ] },
  { path: "/platform/architecture", name: "Architecture & review", section: "Platform",
    title: "See how the design fits together.", summary: "Review a visual plan and downloadable report. See what each part would do, how work would move between systems and where people make the decisions.",
    details: [
      ["Choose the solution cloud", "Assessment outputs can propose Azure or AWS service candidates. AgentSpark itself remains Azure-hosted."],
      ["Separate reasoning from execution", "Runtime recommendations distinguish model reasoning from durable workflow execution, retries, state and human checkpoints."],
      ["Review the visual blueprint", "Connected diagrams and structured sections connect the proposed components to their purpose, evidence and controls. The assessment PDF carries the proposal and its limitations into review."],
      ["Validate before delivery", "Check availability, integration access, identity, data residency and operating controls. Generated scaffolds and diagrams are starting points, not deployed resources."],
    ] },
  { path: "/platform/workspaces", name: "Organizations & team workspaces", section: "Platform",
    title: "Keep each team’s work together.",
    summary: "Choose your organization and team directly on Home. See their assessments and discoveries without navigating through administration.",
    details: [
      ["Choose the scope before creating work", "Selecting an organization loads its teams; selecting a team changes the active workspace. Personal workspace remains separate. Records are not moved or copied when you switch."],
      ["Keep access intentional", "Invitation-only admission and existing team permissions remain server-enforced. Readers can inspect accessible records; creation and review require the appropriate permissions."],
      ["Protect inactive sessions", "Signed-in tabs warn after four idle minutes and normally sign out after five. Unsaved drafts and active operations can delay inactivity sign-out; real token expiry still ends access."],
    ] },
  { path: "/solutions", name: "Solutions overview", section: "Solutions",
    title: "Find a case like yours.",
    summary: "Start with the decision your team needs to make, not a preferred model. Explore transformation, operations and advisory use cases.", details: [] },
  { path: "/solutions/transformation", name: "Transformation teams", section: "Solutions",
    title: "Which proposal deserves a closer look?", summary: "Compare competing suggestions with the sponsors and process owners who would have to act on them.",
    details: [
      ["Start with the objective", "Define the business problem and scope, rather than beginning with a list of tools to deploy."],
      ["Compare the assumptions", "Record stakeholder positions and accepted ownership, then review source-linked opportunities using transparent ratings. Disagreements remain visible."],
      ["Choose a bounded next step", "Review an outcome-led brief with the next action and evidence gaps. A ranked opportunity is not pilot-ready, and an advisory decision is not investment authorization."],
    ] },
  { path: "/solutions/operations", name: "Finance & operations", section: "Solutions",
    title: "Why is this invoice checked twice?", summary: "Trace an exception from receipt to approval. Look for checks you can remove before considering automation.",
    details: [
      ["Follow an item through the work", "Capture the steps, systems, volume, exceptions and decision points that shape the existing workflow."],
      ["Keep authority explicit", "Document who approves payments, coverage or access. An assistant can propose information without taking those decisions."],
      ["Measure before making promises", "Validate baseline handling time, data quality and access. Optional value planning separates released capacity, cash savings, avoided hiring and service outcomes; none is a measured benefit by default."],
    ] },
  { path: "/solutions/advisory", name: "Consultancies & advisory teams", section: "Solutions",
    title: "Give the client a recommendation they can check.", summary: "Show whose account supports a finding, where people disagree and what the client must verify before acting.",
    details: [
      ["Bring different roles together", "Collect structured operator, process-owner and technical-owner perspectives within an engagement."],
      ["Make recommendations traceable", "Keep submitted sources, generated hypotheses, open questions and rating assumptions connected."],
      ["Hand over a reviewable assessment", "Export discovery findings, the assessment or executive brief with provenance and limitations. Team selection keeps engagements in their chosen workspace; this is not a white-label offering or partner program."],
    ] },
  { path: "/resources", name: "Resources overview", section: "Resources",
    title: "Try an example or prepare for a review.",
    summary: "Try fictional examples, understand the workflow and bring better questions to your next discovery or decision review.", details: [] },
  { path: "/resources/how-it-works", name: "How it works", section: "Resources",
    title: "Follow a workflow through the platform.", summary: "See how a team moves from an operator’s observation to a proposed improvement and a decision brief.",
    details: [] },
  { path: "/resources/example-assessment", name: "Illustrative assessment", section: "Resources",
    title: "Explore a sample assessment.", summary: "Choose a claim, invoice or onboarding case. Change a step to see the evidence, the human decision and what still needs testing. Nothing is saved.",
    details: [] },
  { path: "/resources/decision-guide", name: "Decision review guide", section: "Resources",
    title: "Five questions before the next commitment.",
    summary: "A practical review guide for shared outcomes, evidence, ownership, readiness and human decision boundaries.",
    details: [
      ["What outcome are we trying to change?", "Name the business problem, affected process and success measure. A model choice is not a business outcome."],
      ["Where do people disagree?", "Review current positions, conditions and source references. Missing replies are not support; a summary is not consensus."],
      ["Who has accepted responsibility?", "Check accountable owner acceptance and the basis for decision responsibility. Nominated names alone do not establish ownership or authority."],
      ["What is still unconfirmed?", "Review baseline, source quality, integration access and readiness gaps. Keep optional capacity assumptions separate from cash benefits."],
      ["What happens next, and who decides?", "Record a bounded next action and due date. Investigate further, improve the process, use conventional automation or stop when justified; advisory approval is not execution permission."],
    ] },
  { path: "/resources/whats-new", name: "Platform capabilities", section: "Resources",
    title: "What can your team do in the platform?",
    summary: "Explore the platform's expanded alignment, recommendation, blueprint and team-workspace capabilities. Available features, not a roadmap.", details: [] },
  { path: "/resources/trust", name: "Trust & limitations", section: "Resources",
    title: "What AgentSpark does and does not do.", summary: "Check how evidence, permissions and retention work before you share information or rely on a recommendation.",
    details: [] },
];

export function publicPage(pathname: string) {
  const path = pathname.replace(/\/+$/, "").replace(/\/index\.html$/, "") || "/";
  return PUBLIC_PAGES.find(page => page.path === path);
}

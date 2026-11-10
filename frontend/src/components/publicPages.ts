import { CONSULTING_OFFERINGS, CONSULTING_OVERVIEW } from "./consultingContent";

export type PublicPage = {
  path: string; name: string; section: "Overview" | "About" | "Consulting" | "Platform" | "Solutions" | "Resources";
  title: string; summary: string; details: readonly (readonly [string, string])[];
  stage?: "Discover" | "Synthesize" | "Prioritize" | "Assess";
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", name: "Home", section: "Overview", title: "Less busywork. Better ways to work.",
    summary: "Practical AI consulting for small and medium-sized businesses. Find useful improvements, reduce repetitive work and choose a sensible first project.", details: [] },
  { ...CONSULTING_OVERVIEW, section: "Consulting", details: [] },
  ...CONSULTING_OFFERINGS.map(offering => ({
    path: offering.path, name: offering.name, title: offering.title, summary: offering.summary,
    section: "Consulting" as const, details: [],
  })),
  { path: "/about", name: "About", section: "About", title: "Better decisions before bigger commitments.",
    summary: "AgentSpark combines SME AI consulting with an evidence-led discovery and assessment platform. Start with the work, question the assumptions, and keep people accountable.",
    details: [
      ["Business first", "A business objective and the people doing the work come before a model or an architecture."],
      ["Evidence throughout", "Sources, disagreements and missing information remain visible. Generated recommendations are hypotheses to review, not independently verified facts."],
      ["People accountable", "Predictable rules stay deterministic. Human judgment, permissions and approval boundaries remain explicit."],
      ["Two complementary roles", "The platform structures discovery and assessment. Consulting can support adoption and delivery through a separately agreed engagement; it does not add automatic provisioning to the software."],
    ] },
  { path: "/platform", name: "Platform overview", section: "Platform",
    title: "Shared intent. Clear evidence. A better next decision.",
    summary: "One connected discovery and assessment workspace: stakeholder alignment, explainable priorities, outcome-led recommendations and visual blueprints.", details: [] },
  { path: "/platform/discovery", name: "Discovery & stakeholder input", section: "Platform", stage: "Discover",
    title: "Hear the people who know the work.", summary: "Map processes, request role-specific input and turn submitted perspectives into source-linked opportunities.",
    details: [
      ["Define the process", "Record its owner, goal, scope, steps, systems and baseline pain. Link contributions and opportunities to the work being assessed."],
      ["Request the right perspectives", "Ask active signed-in operators, process owners and technical owners for specific process or step contributions, with a due date and visible status."],
      ["Review the evidence", "Keep drafts out of synthesis, distinguish estimates from reviewed evidence and resolve clarifications. Stakeholder submissions do not become verified facts automatically."],
    ] },
  { path: "/platform/alignment", name: "Stakeholder alignment & decisions", section: "Platform",
    title: "Agreement is not a meeting note.",
    summary: "Record stakeholder positions, conditions, accepted responsibilities and decisions needed before choosing technology.",
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
    title: "Less text. More decision value.", summary: "See the proposed outcome, key reasons, human boundaries and next action. Keep suitability, readiness and optional business value separate.",
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
    title: "The right work. In the right workspace.",
    summary: "Choose your organization and team directly on Home. See their assessments and discoveries without navigating through administration.",
    details: [
      ["Choose the scope before creating work", "Selecting an organization loads its teams; selecting a team changes the active workspace. Personal workspace remains separate. Records are not moved or copied when you switch."],
      ["Keep access intentional", "Invitation-only admission and existing team permissions remain server-enforced. Readers can inspect accessible records; creation and review require the appropriate permissions."],
      ["Protect inactive sessions", "Signed-in tabs warn after four idle minutes and normally sign out after five. Unsaved drafts and active operations can delay inactivity sign-out; real token expiry still ends access."],
    ] },
  { path: "/solutions", name: "Solutions overview", section: "Solutions",
    title: "Different teams. The same need for clarity.",
    summary: "Start with the decision your team needs to make, not a preferred model. Explore transformation, operations and advisory use cases.", details: [] },
  { path: "/solutions/transformation", name: "Transformation teams", section: "Solutions",
    title: "Build the shortlist before the backlog.", summary: "Align sponsors and owners, compare opportunity assumptions and define what deserves a closer look.",
    details: [
      ["Start with the objective", "Define the business problem and scope, rather than beginning with a list of tools to deploy."],
      ["Compare the assumptions", "Record stakeholder positions and accepted ownership, then review source-linked opportunities using transparent ratings. Disagreements remain visible."],
      ["Choose a bounded next step", "Review an outcome-led brief with the next action and evidence gaps. A ranked opportunity is not pilot-ready, and an advisory decision is not investment authorization."],
    ] },
  { path: "/solutions/operations", name: "Finance & operations", section: "Solutions",
    title: "Start with the friction people recognize.", summary: "Investigate repeat checks and exception handling. Separate potential capacity from cash savings and keep financial authority human.",
    details: [
      ["Follow an item through the work", "Capture the steps, systems, volume, exceptions and decision points that shape the existing workflow."],
      ["Keep authority explicit", "Document who approves payments, coverage or access. An assistant can propose information without taking those decisions."],
      ["Measure before making promises", "Validate baseline handling time, data quality and access. Optional value planning separates released capacity, cash savings, avoided hiring and service outcomes; none is a measured benefit by default."],
    ] },
  { path: "/solutions/advisory", name: "Consultancies & advisory teams", section: "Solutions",
    title: "A client recommendation they can inspect.", summary: "Bring stakeholder input, alignment records, executive decisions and visual proposals into one reviewable engagement.",
    details: [
      ["Bring different roles together", "Collect structured operator, process-owner and technical-owner perspectives within an engagement."],
      ["Make recommendations traceable", "Keep submitted sources, generated hypotheses, open questions and rating assumptions connected."],
      ["Hand over a reviewable assessment", "Export discovery findings, the assessment or executive brief with provenance and limitations. Team selection keeps engagements in their chosen workspace; this is not a white-label offering or partner program."],
    ] },
  { path: "/resources", name: "Resources overview", section: "Resources",
    title: "Explore the product. Prepare the conversation.",
    summary: "Try fictional examples, understand the workflow and bring better questions to your next discovery or decision review.", details: [] },
  { path: "/resources/how-it-works", name: "How it works", section: "Resources",
    title: "From business question to clearer next step.", summary: "Discover, align, prioritize, assess and review. Each stage makes a different decision visible instead of assuming everything should be autonomous.",
    details: [] },
  { path: "/resources/example-assessment", name: "Illustrative assessment", section: "Resources",
    title: "Explore the work before signing in.", summary: "Try fictional claims, invoice and onboarding examples. Explore human boundaries, readiness gaps, capacity assumptions and cloud candidates without model calls or saved records.",
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
    title: "A clearer path from discovery to decision.",
    summary: "Explore the platform's expanded alignment, recommendation, blueprint and team-workspace capabilities. Available features, not a roadmap.", details: [] },
  { path: "/resources/trust", name: "Trust & limitations", section: "Resources",
    title: "Know what is supported. Know what is still unknown.", summary: "AgentSpark supports a responsible decision process. It does not independently verify your evidence, certify compliance or execute your business workflow.",
    details: [] },
];

export function publicPage(pathname: string) {
  const path = pathname.replace(/\/+$/, "").replace(/\/index\.html$/, "") || "/";
  return PUBLIC_PAGES.find(page => page.path === path);
}

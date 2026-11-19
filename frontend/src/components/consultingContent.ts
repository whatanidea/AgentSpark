import type { MarketingIconName } from "./MarketingVisuals";

export type ConsultingOffering = {
  path: string; name: string; title: string; summary: string; icon: MarketingIconName;
  question: string; format: string; outcome: string; audience: string;
  deliverables: readonly string[];
  steps: readonly (readonly [string, string])[];
  boundary: string;
};

export const CONSULTING_OFFERINGS: readonly ConsultingOffering[] = [
  {
    path: "/consulting/readiness", name: "AI Opportunity & Readiness",
    title: "Choose one problem worth solving.",
    summary: "Walk through the work with an adviser. Compare a process change, fixed rules and AI; leave with a shortlist and a proposed 90-day plan.",
    icon: "readiness", question: "Where should we start?", format: "Fixed-scope discovery sprint",
    outcome: "An evidence-led starting point", audience: "Leaders deciding where AI could improve work before committing to tools or implementation.",
    deliverables: ["Business objectives, process map and stakeholder perspectives", "Opportunity shortlist comparing process change, automation and AI", "Readiness gaps, accountable owners and evidence still needed", "A proposed 90-day roadmap and business-case assumptions"],
    steps: [["Frame", "Agree the business question, scope and decision owner."], ["Discover", "Hear operators, process owners and technical stakeholders."], ["Compare", "Evaluate alternatives without assuming AI is the answer."], ["Recommend", "Review the shortlist and agree a bounded next step."]],
    boundary: "A roadmap is advisory. It is not a readiness certification, verified savings or permission to deploy.",
  },
  {
    path: "/consulting/workspace-launch", name: "Secure AI Workspace Launch",
    title: "Give people a workspace they can use safely.",
    summary: "Choose a business AI product, agree which data belongs there and train staff on their own tasks. Your administrators own the accounts and approve access.",
    icon: "cloud", question: "How do we equip our team?", format: "Scoped onboarding and enablement",
    outcome: "A customer-owned adoption foundation", audience: "SMEs moving from individual experimentation to an intentionally managed team workspace.",
    deliverables: ["Product and plan recommendation based on the team's work", "Account ownership, billing and supported access-control checklist", "Data-use, retention, connector and regional-availability review", "Role-specific training, acceptable-use guidance and handover"],
    steps: [["Select", "Compare workplace and developer requirements separately."], ["Prepare", "Confirm customer administrators, procurement and data constraints."], ["Onboard", "Assist authorized administrators with agreed setup tasks."], ["Enable", "Train champions and hand over documented responsibilities."]],
    boundary: "Customer administrators retain ownership and approve access. Provider approval, plan features, quotas and availability are not guaranteed. Never submit passwords or API keys to discovery.",
  },
  {
    path: "/consulting/workflow-pilot", name: "Workflow Pilot & Implementation",
    title: "Test one workflow before expanding it.",
    summary: "Compare the current method with a reviewed pilot on authorized examples. Record time, corrections and failures so the owner can stop, revise or expand the work.",
    icon: "blueprint", question: "Will it improve this process?", format: "Milestone-based delivery",
    outcome: "A pilot with a reviewable decision", audience: "Teams with a selected opportunity, a process owner and authorized access to suitable test data.",
    deliverables: ["Agreed baseline, pilot scope and acceptance criteria", "Provider or model evaluation on authorized representative examples", "Prototype, agreed integrations and human-review checkpoints", "Quality, cost and failure findings with a production recommendation"],
    steps: [["Baseline", "Define what to measure and how success will be judged."], ["Build", "Implement only the authorized pilot scope."], ["Evaluate", "Test quality, exceptions, costs and escalation paths."], ["Decide", "Review evidence before any production commitment."]],
    boundary: "A pilot is not a production service. Deployment authorization, operational support and service commitments require a separately agreed scope.",
  },
  {
    path: "/consulting/adoption", name: "AI Adoption & Optimization",
    title: "Help the team use AI after launch.",
    summary: "Bring difficult cases to office hours. We coach the people using the tool, update the review guide with your champion and check whether the work is actually improving.",
    icon: "people", question: "How do we keep improving?", format: "Defined-capacity advisory retainer",
    outcome: "An owned improvement rhythm", audience: "Organizations that have introduced AI and need a repeatable way to learn, govern and improve.",
    deliverables: ["Role-based coaching, champion support and agreed office hours", "Adoption and workflow reviews with clearly labelled measurement sources", "Usage and cost review where authorized data is available", "Prioritized improvements, operating guidance and quarterly outcome review"],
    steps: [["Listen", "Gather feedback from the people using the tools."], ["Measure", "Separate reported activity from measured outcomes."], ["Improve", "Review provider changes and prioritize bounded improvements."], ["Repeat", "Maintain owners, controls and the next decision backlog."]],
    boundary: "Retainers have defined capacity and response times. They do not include unlimited implementation, 24/7 operations or access to usage telemetry by default.",
  },
];

export const CONSULTING_OVERVIEW = {
  path: "/consulting", name: "Consulting overview",
  title: "Where does your team need help?",
  summary: "Start with the decision in front of you: choose a use case, equip your team, test a workflow or improve adoption. Each service has its own scope; you need not buy all four.",
};

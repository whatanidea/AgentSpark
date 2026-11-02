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
    title: "Find the right starting point. Not just another AI tool.",
    summary: "Turn business priorities and process knowledge into a source-linked opportunity shortlist, readiness review and a practical adoption roadmap.",
    icon: "readiness", question: "Where should we start?", format: "Fixed-scope discovery sprint",
    outcome: "An evidence-led starting point", audience: "Leaders deciding where AI could improve work before committing to tools or implementation.",
    deliverables: ["Business objectives, process map and stakeholder perspectives", "Opportunity shortlist comparing process change, automation and AI", "Readiness gaps, accountable owners and evidence still needed", "A proposed 90-day roadmap and business-case assumptions"],
    steps: [["Frame", "Agree the business question, scope and decision owner."], ["Discover", "Hear operators, process owners and technical stakeholders."], ["Compare", "Evaluate alternatives without assuming AI is the answer."], ["Recommend", "Review the shortlist and agree a bounded next step."]],
    boundary: "A roadmap is advisory. It is not a readiness certification, verified savings or permission to deploy.",
  },
  {
    path: "/consulting/workspace-launch", name: "Secure AI Workspace Launch",
    title: "Give your team a considered start with AI.",
    summary: "Choose an appropriate business AI product, plan customer-owned onboarding and prepare your people to use it with clear access and data-handling boundaries.",
    icon: "cloud", question: "How do we equip our team?", format: "Scoped onboarding and enablement",
    outcome: "A customer-owned adoption foundation", audience: "SMEs moving from individual experimentation to an intentionally managed team workspace.",
    deliverables: ["Product and plan recommendation based on the team's work", "Account ownership, billing and supported access-control checklist", "Data-use, retention, connector and regional-availability review", "Role-specific training, acceptable-use guidance and handover"],
    steps: [["Select", "Compare workplace and developer requirements separately."], ["Prepare", "Confirm customer administrators, procurement and data constraints."], ["Onboard", "Assist authorized administrators with agreed setup tasks."], ["Enable", "Train champions and hand over documented responsibilities."]],
    boundary: "Customer administrators retain ownership and approve access. Provider approval, plan features, quotas and availability are not guaranteed. Never submit passwords or API keys to discovery.",
  },
  {
    path: "/consulting/workflow-pilot", name: "Workflow Pilot & Implementation",
    title: "Prove the workflow before scaling the investment.",
    summary: "Design a bounded pilot around real work, representative evaluation and human oversight. Decide what deserves production investment using evidence, not a demo alone.",
    icon: "blueprint", question: "Will it improve this process?", format: "Milestone-based delivery",
    outcome: "A pilot with a reviewable decision", audience: "Teams with a selected opportunity, a process owner and authorized access to suitable test data.",
    deliverables: ["Agreed baseline, pilot scope and acceptance criteria", "Provider or model evaluation on authorized representative examples", "Prototype, agreed integrations and human-review checkpoints", "Quality, cost and failure findings with a production recommendation"],
    steps: [["Baseline", "Define what to measure and how success will be judged."], ["Build", "Implement only the authorized pilot scope."], ["Evaluate", "Test quality, exceptions, costs and escalation paths."], ["Decide", "Review evidence before any production commitment."]],
    boundary: "A pilot is not a production service. Deployment authorization, operational support and service commitments require a separately agreed scope.",
  },
  {
    path: "/consulting/adoption", name: "AI Adoption & Optimization",
    title: "Make adoption a capability. Not a launch event.",
    summary: "Support champions, review outcomes and maintain an improvement backlog as your organization's tools, people and priorities evolve.",
    icon: "people", question: "How do we keep improving?", format: "Defined-capacity advisory retainer",
    outcome: "An owned improvement rhythm", audience: "Organizations that have introduced AI and need a repeatable way to learn, govern and improve.",
    deliverables: ["Role-based coaching, champion support and agreed office hours", "Adoption and workflow reviews with clearly labelled measurement sources", "Usage and cost review where authorized data is available", "Prioritized improvements, operating guidance and quarterly outcome review"],
    steps: [["Listen", "Gather feedback from the people using the tools."], ["Measure", "Separate reported activity from measured outcomes."], ["Improve", "Review provider changes and prioritize bounded improvements."], ["Repeat", "Maintain owners, controls and the next decision backlog."]],
    boundary: "Retainers have defined capacity and response times. They do not include unlimited implementation, 24/7 operations or access to usage telemetry by default.",
  },
];

export const CONSULTING_OVERVIEW = {
  path: "/consulting", name: "Consulting overview",
  title: "Build an AI-native business. One deliberate step at a time.",
  summary: "AgentSpark Consulting helps SMEs connect AI strategy, platform adoption, workflow delivery and workforce skills. Our assessment platform supports the decisions; consulting delivery is separately scoped.",
};

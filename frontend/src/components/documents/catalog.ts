import type { PublicPage } from "../publicPages";
const base = "/solutions/agent-implementation/";
export const documents: PublicPage[] = [
  ["solutions", "Agent implementation", "Compare four platforms for a human-reviewed pilot."],
  ["cowork", "Claude Cowork implementation", "Build an account brief from approved evidence."],
  ["dots", "OpenAI dots implementation", "Prepare a weekly project digest for review."],
  ["grok", "Grok Bot implementation", "Triage a queue without handing over routing authority."],
  ["openbot", "OpenBot implementation", "Turn approved release notes into a launch announcement."],
].map(([slug, name, summary]) => ({ path: `${base}${slug}.html`, name, summary, title: name, details: [], section: "Solutions" }));
documents.push({path: "/briefs/claim-intake.html", name: "Claims intake decision brief", section: "Resources",
  title: "Should we fund an AI pilot for claims intake?", summary: "An illustrative workflow review for an operations lead.", details: []});

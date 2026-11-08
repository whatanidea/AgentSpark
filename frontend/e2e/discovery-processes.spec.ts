import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { join } from "node:path";

type Identity = { identity: string; token: string };
type Fixture = {
  owner: Identity; operator: Identity; reviewer: Identity; organization: string; team: string; engagement: string;
  headers: Record<string, string>; initialExpiry: string;
};
async function json(request: APIRequestContext, method: "post" | "put", path: string, headers: Record<string, string>, data: unknown) {
  const response = await request[method]("/api/v1" + path, { headers, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function fixture(request: APIRequestContext): Promise<Fixture> {
  const identities = await (await request.get("/test-fixture/tokens")).json();
  const ownerHeaders = { Authorization: "Bearer " + identities.owner.token };
  const organization = (await json(request, "post", "/organizations", ownerHeaders,
    { name: "Browser process organization " + crypto.randomUUID() })).organization_id;
  const team = (await json(request, "post", `/organizations/${organization}/teams`, ownerHeaders,
    { name: "Process team" })).team_id;
  for (const subject of ["operator", "reviewer"]) {
    await json(request, "put", `/organizations/${organization}/members/${identities[subject].identity}`, ownerHeaders, { role: "member" });
    await json(request, "put", `/organizations/${organization}/teams/${team}/members/${identities[subject].identity}`, ownerHeaders,
      { roles: subject === "operator" ? ["viewer"] : ["viewer", "reviewer"] });
  }
  const headers = { ...ownerHeaders, "X-Organization-ID": organization, "X-Team-ID": team };
  const record = await json(request, "post", "/engagements", headers, { engagement: {
    title: "Browser process discovery", objective: "Understand invoice checks", business_units: "Finance",
    sponsor: "Sponsor", engagement_owner: "Lead",
  } });
  return { ...identities, organization, team, engagement: record.id, headers, initialExpiry: record.expires_at };
}
async function open(page: Page, identity: Identity, value: Fixture, startFromPublic = false) {
  await page.goto(startFromPublic ? "/" : "/workspace");
  if (startFromPublic) await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Access token", { exact: true })).toBeVisible();
  await page.getByLabel("Access token", { exact: true }).fill(identity.token);
  await page.getByRole("button", { name: "Connect securely", exact: true }).click();
  await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
  await page.getByRole("combobox", { name: "Organization", exact: true }).selectOption(value.organization);
  await page.getByRole("button", { name: "Use Process team", exact: true }).click();
  await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
  await page.getByRole("button", { name: "Browser process discovery", exact: true }).click();
  await expect(page.getByRole("region", { name: "Process discovery", exact: true })).toBeVisible();
}
async function createProcess(page: Page) {
  await page.getByRole("button", { name: "Add process card", exact: true }).click();
  for (const [name, value] of Object.entries({
    "Process title": "Invoice checks", "Process owner": "Finance lead", "Process goal": "Reduce rework",
    "Bounded process scope": "Receipt to review; no payment authorization", "Process systems": "SAP",
    "Process volume / period": "100 invoices per day, self-reported", "Baseline pain / effort / delay": "Duplicate checks",
    "Step 1 title": "Check totals", "Step 1 work": "Compare invoice totals manually", "Step 1 systems": "SAP",
  })) await page.getByRole("textbox", { name, exact: true }).fill(value);
  await page.getByRole("button", { name: "Save process card", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
}
async function requestStep(page: Page, assignee: string, role = "business_operator") {
  await page.getByRole("button", { name: "Request step contribution", exact: true }).click();
  await page.getByRole("combobox", { name: "Request process", exact: true }).selectOption({ label: "Invoice checks" });
  await page.getByRole("combobox", { name: "Request step", exact: true }).selectOption({ label: "Check totals" });
  await page.getByRole("button", { name: "Load request assignees", exact: true }).click();
  await page.getByRole("combobox", { name: "Request assignee", exact: true }).selectOption(assignee);
  await page.getByRole("combobox", { name: "Requested step role", exact: true }).selectOption(role);
  await page.getByRole("textbox", { name: "Requested information / evidence", exact: true }).fill("Describe work and supply baseline references");
  await page.getByLabel("Request due date", { exact: true }).fill("2026-11-10");
  await page.getByRole("button", { name: "Save contribution request", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
}
async function cleanup(request: APIRequestContext, value: Fixture, child = "") {
  if (child) expect((await request.delete(`/api/v1/sessions/${child}`, { headers: value.headers })).ok()).toBe(true);
  const record = await (await request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
  expect((await request.delete(`/api/v1/engagements/${value.engagement}?version=${encodeURIComponent(record.version)}`,
    { headers: value.headers })).ok()).toBe(true);
}

async function nominateAlignment(page: Page, kind: "stakeholder" | "owner" | "decision", identity: string) {
  await page.getByRole("button", { name: kind === "stakeholder" ? "Nominate stakeholder" :
    kind === "owner" ? "Nominate accountable owner" : "Record decision needed", exact: true }).click();
  await page.getByRole("button", { name: "Load alignment team members", exact: true }).click();
  await page.getByRole("combobox", { name: "Assigned person", exact: true }).selectOption(identity);
  await page.getByRole("textbox", { name: "Recorded person label", exact: true }).fill("Fictional claims lead");
  if (kind === "decision") {
    await page.getByRole("textbox", { name: "Decision needed", exact: true }).fill("Who owns pilot support?");
    await page.getByRole("textbox", { name: "Basis for decision responsibility", exact: true }).fill("Workshop nomination for discovery only");
    await page.getByRole("textbox", { name: "Decision next action", exact: true }).fill("Review the support model");
  }
  await page.getByRole("button", { name: "Save alignment record", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Alignment saved." })).toBeVisible();
}

test("stakeholder alignment records self-attributed conditions, ownership and decisions without consensus", async ({ page, browser }, testInfo) => {
  const value = await fixture(page.request);
  const actorContext = await browser.newContext({ viewport: page.viewportSize() || { width: 1280, height: 720 },
    isMobile: testInfo.project.name === "mobile-safari", hasTouch: testInfo.project.name === "mobile-safari" });
  try {
    await open(page, value.owner, value);
    await page.getByRole("button", { name: "Start stakeholder alignment", exact: true }).click();
    await expect(page.getByRole("region", { name: "Alignment brief", exact: true })).toBeVisible();
    await nominateAlignment(page, "stakeholder", value.operator.identity);
    await nominateAlignment(page, "owner", value.operator.identity);
    await nominateAlignment(page, "decision", value.operator.identity);
    const actor = await actorContext.newPage();
    await open(actor, value.operator, value);
    await expect(actor.getByRole("button", { name: "Nominate stakeholder", exact: true })).toBeDisabled();
    await expect(actor.getByRole("button", { name: "Record owner decision", exact: true })).toBeDisabled();
    await actor.getByRole("button", { name: "Accept Business owner responsibility", exact: true }).click();
    await expect(actor.getByRole("region", { name: "Alignment brief", exact: true })).toContainText("Accepted for current scope");
    await actor.getByRole("button", { name: "Accept decision responsibility", exact: true }).click();
    await actor.getByRole("button", { name: "Record owner decision", exact: true }).click();
    await actor.getByRole("textbox", { name: "Owner decision outcome", exact: true }).fill("Investigate a support model; do not launch yet");
    await actor.getByRole("textbox", { name: "Decision rationale", exact: true }).fill("Operational support has not been agreed");
    await actor.getByRole("textbox", { name: "Agreed next action", exact: true }).fill("Gather operational evidence");
    await actor.getByRole("button", { name: "Save alignment record", exact: true }).click();
    await expect(actor.getByRole("region", { name: "Alignment brief", exact: true })).toContainText("Owner decision recorded");
    await actor.getByRole("button", { name: "Record Business position", exact: true }).click();
    await actor.getByRole("combobox", { name: "My stakeholder position", exact: true }).selectOption("conditional");
    await actor.getByRole("textbox", { name: "Position rationale", exact: true }).fill("Support discovery, not production approval");
    await actor.getByRole("textbox", { name: "Conditions / objections to address", exact: true }).fill("No autonomous payment; validate data access");
    await actor.getByRole("button", { name: "Save alignment record", exact: true }).click();
    const brief = actor.getByRole("region", { name: "Alignment brief", exact: true });
    await expect(brief).toContainText("Support with conditions");
    await expect(brief).toContainText("No autonomous payment; validate data access");
    await expect(brief).toContainText("No current position recorded");
    const saved = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    expect(saved.alignment.missing_functions).toHaveLength(4);
    expect(saved.alignment.accepted_owners).toHaveLength(1);
    expect(saved.alignment.current_decisions).toHaveLength(1);
    expect(saved.expires_at).toBe(value.initialExpiry);
    expect(await actor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (process.env.AGENTSPARK_ALIGNMENT_RESULTS) {
      await actor.locator("#discovery-alignment").screenshot({
        path: join(process.env.AGENTSPARK_ALIGNMENT_RESULTS, `alignment-${testInfo.project.name}.png`),
      });
    }
  } finally { await actorContext.close(); await cleanup(page.request, value); }
});

test("stakeholder alignment retains stale drafts, guards navigation and freezes conditions at handoff", async ({ page, browser }) => {
  const value = await fixture(page.request);
  const actorContext = await browser.newContext({ viewport: page.viewportSize() || { width: 1280, height: 720 } });
  let child = "";
  try {
    let record = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    record = await json(page.request, "post", `/engagements/${value.engagement}/alignment`, value.headers, { version: record.version });
    record = await json(page.request, "post", `/engagements/${value.engagement}/alignment/stakeholders`, value.headers,
      { version: record.version, identity_id: value.operator.identity, function: "business" });
    const actor = await actorContext.newPage();
    await open(actor, value.operator, value);
    await actor.getByRole("button", { name: "Record Business position", exact: true }).click();
    await actor.getByRole("textbox", { name: "Position rationale", exact: true }).fill("A draft that must survive a conflict");
    await expect(actor.getByRole("textbox", { name: "Business objective", exact: true })).toBeDisabled();
    record = await json(page.request, "put", `/engagements/${value.engagement}`, value.headers,
      { version: record.version, engagement: { ...record.engagement, objective: "Changed business outcome" } });
    await actor.getByRole("button", { name: "Save alignment record", exact: true }).click();
    await expect(actor.getByRole("alert").filter({ hasText: "Discovery changed" }).first()).toBeVisible();
    await expect(actor.getByRole("textbox", { name: "Position rationale", exact: true })).toHaveValue("A draft that must survive a conflict");
    actor.once("dialog", dialog => dialog.dismiss());
    await actor.getByRole("button", { name: "Home", exact: true }).click();
    await expect(actor.getByRole("textbox", { name: "Position rationale", exact: true })).toHaveValue("A draft that must survive a conflict");
    await actor.getByRole("button", { name: "Discard alignment draft", exact: true }).click();
    await actor.getByRole("button", { name: "Browser process discovery", exact: true }).click();
    await actor.getByRole("button", { name: "Record Business position", exact: true }).click();
    await actor.getByRole("combobox", { name: "My stakeholder position", exact: true }).selectOption("conditional");
    await actor.getByRole("textbox", { name: "Position rationale", exact: true }).fill("Investigate only");
    await actor.getByRole("textbox", { name: "Conditions / objections to address", exact: true }).fill("No external publication without a separate decision");
    const positionSaved = actor.waitForResponse(response => response.url().endsWith("/position") && response.request().method() === "POST");
    await actor.getByRole("button", { name: "Save alignment record", exact: true }).click();
    expect((await positionSaved).ok()).toBe(true);
    await expect(actor.getByRole("status").filter({ hasText: "Alignment saved." })).toBeVisible();
    record = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    const opportunity = crypto.randomUUID();
    record = await json(page.request, "put", `/engagements/${value.engagement}`, value.headers,
      { version: record.version, engagement: { ...record.engagement, opportunities: [
        { id: opportunity, title: "Investigate claims assistance", problem: "Understand rework",
          status: "selected", source_ids: [], ratings: null },
      ] } });
    await open(page, value.owner, value);
    await page.getByRole("combobox", { name: "Opportunity to review", exact: true }).selectOption(opportunity);
    await page.getByRole("combobox", { name: "Assessment target cloud", exact: true }).selectOption("azure");
    await page.getByRole("checkbox", { name: /I reviewed this hypothesis, sources and organisational alignment/ }).check();
    const completion = page.waitForResponse(response => response.url().endsWith(`/opportunities/${opportunity}/handoff`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create or resume assessment handoff", exact: true }).click();
    const handoff = await (await completion).json();
    child = handoff.session_id;
    await page.getByText(/^Discovery origin:/).click();
    const frozen = page.getByRole("region", { name: "Alignment brief", exact: true });
    await expect(frozen).toContainText("No external publication without a separate decision");
    expect(handoff.engagement.handoffs[0].origin.alignment.missing_functions).toHaveLength(4);
    const childState = await (await page.request.get(`/api/v1/sessions/${child}`, { headers: value.headers })).json();
    expect(childState.discovery_origin.alignment.record.stakeholders[0].positions).toHaveLength(1);
    expect(childState.workflow_intelligence).toBeNull();
    expect(childState.interview_answers).toEqual({});
  } finally { await actorContext.close(); await cleanup(page.request, value, child); }
});

test("authenticated step drafts persist, reviewers resolve sources, and five alternatives retain process handoff provenance", async ({ page, browser }) => {
  const value = await fixture(page.request);
  const operatorContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  let child = "";
  try {
    await open(page, value.owner, value);
    await createProcess(page);
    await requestStep(page, value.operator.identity);
    await requestStep(page, value.reviewer.identity, "technical_owner");
    const operator = await operatorContext.newPage();
    await open(operator, value.operator, value);
    await expect(operator.getByRole("button", { name: "Add process card", exact: true })).toBeDisabled();
    await expect(operator.getByRole("button", { name: "Review sources or resolve disagreement", exact: true })).toBeDisabled();
    await operator.getByRole("button", { name: "Respond to step request", exact: true }).click();
    await operator.getByRole("textbox", { name: "Describe manual work at this step.", exact: true }).fill("Compare invoice totals");
    await operator.getByRole("button", { name: "Save step response draft", exact: true }).click();
    await expect(operator.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    let saved = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    expect(saved.tasks[0].status).toBe("draft");
    expect(saved.sources.some((source: { task_id: unknown }) => source.task_id)).toBe(false);
    await operator.getByRole("button", { name: "Respond to step request", exact: true }).click();
    await expect(operator.getByRole("textbox", { name: "Describe manual work at this step.", exact: true })).toHaveValue("Compare invoice totals");
    await operator.getByRole("textbox", { name: "Describe exceptions and rework.", exact: true }).fill("Duplicate invoices");
    await operator.getByRole("textbox", { name: "Describe effort, delay and frequency; say unconfirmed if unknown.", exact: true }).fill("Unconfirmed");
    await operator.getByRole("button", { name: "Add baseline evidence", exact: true }).click();
    await operator.getByRole("textbox", { name: "Baseline statement 1", exact: true }).fill("12 minutes per invoice");
    await operator.getByRole("textbox", { name: "Evidence source reference 1", exact: true }).fill("Finance timed sample, October 2026");
    await operator.getByRole("combobox", { name: "Evidence basis 1", exact: true }).selectOption("measured");
    await operator.getByRole("button", { name: "Submit step contribution", exact: true }).click();
    await expect(operator.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    const reviewer = await reviewerContext.newPage();
    await open(reviewer, value.reviewer, value);
    await reviewer.getByRole("button", { name: "Respond to step request", exact: true }).click();
    for (const label of ["What data and quality/access limitations apply?", "What APIs or integrations exist or need validation?",
      "Describe privacy, residency, security and operating constraints."]) await reviewer.getByRole("textbox", { name: label, exact: true }).fill("Unconfirmed");
    await reviewer.getByRole("button", { name: "Submit step contribution", exact: true }).click();
    await expect(reviewer.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    await reviewer.getByRole("button", { name: "Review sources or resolve disagreement", exact: true }).click();
    const evidence = reviewer.getByRole("checkbox", { name: /task\..*evidence\.0/ });
    await evidence.check();
    await reviewer.getByRole("combobox", { name: "Source review outcome", exact: true }).selectOption("clarification_needed");
    await reviewer.getByRole("textbox", { name: "Source review rationale", exact: true }).fill("Please clarify sample period");
    await reviewer.getByRole("button", { name: "Save source review", exact: true }).click();
    await expect(reviewer.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    await reviewer.getByRole("button", { name: "Review sources or resolve disagreement", exact: true }).click();
    for (const source of await reviewer.getByRole("checkbox", { name: /^task\./ }).all()) await source.check();
    await reviewer.getByRole("combobox", { name: "Source review outcome", exact: true }).selectOption("reviewer_checked");
    await reviewer.getByRole("textbox", { name: "Source review rationale", exact: true }).fill("Checked October sample period manually");
    await reviewer.getByRole("button", { name: "Save source review", exact: true }).click();
    await expect(reviewer.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    await page.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await page.getByRole("button", { name: "Generate discovery synthesis", exact: true }).click();
    const accepted = page.waitForResponse(response => response.url().endsWith("/accept") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Add candidate for review", exact: true }).click();
    expect((await accepted).ok()).toBe(true);
    saved = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    expect(saved.expires_at).toBe(value.initialExpiry);
    expect(saved.tasks.map((task: { status: string }) => task.status)).toEqual(["submitted", "submitted"]);
    expect(saved.synthesis.sources.find((source: { basis: string }) => source.basis === "measured").review_status).toBe("reviewer_checked");
    const opportunity = saved.engagement.opportunities[0];
    await page.getByRole("combobox", { name: "Opportunity to review", exact: true }).selectOption(opportunity.id);
    for (const name of ["Business value", "Feasibility", "Evidence confidence", "Risk (1 low, 5 high)", "Delivery effort (1 low, 5 high)"])
      await page.getByRole("combobox", { name, exact: true }).selectOption("3");
    await page.getByRole("textbox", { name: "Priority rating rationale", exact: true }).fill("Human comparison of current source facts");
    await page.getByRole("button", { name: "Save priority assumptions", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Priority assumptions saved." })).toBeVisible();
    await operator.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await operator.getByRole("button", { name: "Respond to step request", exact: true }).click();
    await operator.getByRole("textbox", { name: "Baseline statement 1", exact: true }).fill("14 minutes per invoice");
    await operator.getByRole("button", { name: "Submit step contribution", exact: true }).click();
    await expect(operator.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    await page.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "This snapshot is stale" })).toBeVisible();
    await expect(page.getByText(/Outstanding:.*current rating assumptions/)).toBeVisible();
    await page.getByRole("button", { name: "Generate discovery synthesis", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "This snapshot is stale" })).toHaveCount(0);
    await expect(page.getByText(/Outstanding:.*current rating assumptions/)).toBeVisible();
    await reviewer.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await reviewer.getByRole("button", { name: "Review sources or resolve disagreement", exact: true }).click();
    for (const source of await reviewer.getByRole("checkbox", { name: /^task\./ }).all()) await source.check();
    await reviewer.getByRole("combobox", { name: "Source review outcome", exact: true }).selectOption("reviewer_checked");
    await reviewer.getByRole("textbox", { name: "Source review rationale", exact: true }).fill("Rechecked amended source manually");
    await reviewer.getByRole("button", { name: "Save source review", exact: true }).click();
    await expect(reviewer.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    await page.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await page.getByRole("button", { name: "Generate discovery synthesis", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "This snapshot is stale" })).toHaveCount(0);
    await page.getByRole("button", { name: "Save priority assumptions", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Priority assumptions saved." })).toBeVisible();
    await expect(page.getByText(/Outstanding:.*current rating assumptions/)).toHaveCount(0);
    await page.getByRole("button", { name: "Compare alternatives for " + opportunity.title, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Preferred delivery alternative", exact: true })).toHaveValue("");
    for (const name of ["Leave unchanged", "Process improvement", "Deterministic automation", "AI assistance", "Hybrid"])
      await page.getByRole("textbox", { name: name + " rationale", exact: true }).fill("Human evaluation of " + name);
    await page.getByRole("combobox", { name: "Preferred delivery alternative", exact: true }).selectOption("process_improvement");
    await page.getByRole("button", { name: "Save alternatives comparison", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Process discovery saved." })).toBeVisible();
    await page.getByRole("combobox", { name: "Opportunity to review", exact: true }).selectOption(opportunity.id);
    await page.getByRole("button", { name: "Select opportunity for assessment", exact: true }).click();
    await page.getByRole("combobox", { name: "Assessment target cloud", exact: true }).selectOption("azure");
    await page.getByRole("checkbox", { name: /^I reviewed this hypothesis/ }).check();
    const handoff = page.waitForResponse(response => response.url().endsWith("/handoff") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create or resume assessment handoff", exact: true }).click();
    const response = await handoff;
    expect(response.ok()).toBe(true);
    child = (await response.json()).session_id;
    await expect(page.getByText(/^Discovery origin:/)).toBeVisible();
    await page.getByText(/^Discovery origin:/).click();
    const provenance = page.getByRole("region", { name: "Reviewed discovery provenance", exact: true });
    await expect(provenance.getByRole("heading", { name: "Process: Invoice checks", exact: true })).toBeVisible();
    await expect(provenance.getByText("Preferred approach: Process improvement", { exact: true })).toBeVisible();
    await expect(provenance.getByText("Human evaluation of AI assistance", { exact: true })).toBeVisible();
    await expect(provenance.getByText(/Process Invoice checks \/ step Check totals \/ authenticated/)).toBeVisible();
    const snapshot = await (await page.request.get(`/api/v1/sessions/${child}`, { headers: value.headers })).json();
    expect(snapshot.discovery_origin.processes[0].steps[0].title).toBe("Check totals");
    expect(snapshot.discovery_origin.preferred_alternative).toBe("process_improvement");
    expect(snapshot.discovery_origin.alternatives).toHaveLength(5);
    expect(snapshot.discovery_origin.source_reviews.length).toBeGreaterThan(0);
    expect(snapshot.workflow_intelligence).toBeNull();
    expect(snapshot.interview_answers).toEqual({});
  } finally { await operatorContext.close(); await reviewerContext.close(); await cleanup(page.request, value, child); }
});

test("failed/conflicting process writes preserve editor drafts and synchronous Back navigation blocks discard", async ({ page }) => {
  const value = await fixture(page.request);
  const pattern = "**/api/v1/engagements/*/processes/*";
  try {
    await open(page, value.owner, value, true);
    await page.getByRole("button", { name: "Add process card", exact: true }).click();
    for (const name of ["Process title", "Process owner", "Process goal", "Bounded process scope", "Process systems",
      "Process volume / period", "Baseline pain / effort / delay", "Step 1 title", "Step 1 work", "Step 1 systems"])
      await page.getByRole("textbox", { name, exact: true }).fill("Fictional " + name);
    await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toBeDisabled();
    let navigationDialogs = 0;
    page.once("dialog", dialog => { navigationDialogs += 1; return dialog.dismiss(); });
    await page.goBack();
    await expect.poll(() => navigationDialogs).toBe(1);
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByRole("textbox", { name: "Process title", exact: true })).toHaveValue("Fictional Process title");
    await page.route(pattern, route => route.fulfill({ status: 503, json: { detail: "Simulated storage failure" } }));
    await page.getByRole("button", { name: "Save process card", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("503");
    await expect(page.getByRole("textbox", { name: "Process title", exact: true })).toHaveValue("Fictional Process title");
    await page.unroute(pattern);
    let record = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    record.engagement.objective = "Concurrent saved edit";
    await json(page.request, "put", `/engagements/${value.engagement}`, value.headers, { version: record.version, engagement: record.engagement });
    await page.getByRole("button", { name: "Save process card", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("409");
    await expect(page.getByRole("textbox", { name: "Process title", exact: true })).toHaveValue("Fictional Process title");
    page.once("dialog", dialog => { navigationDialogs += 1; return dialog.dismiss(); });
    await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
    await expect.poll(() => navigationDialogs).toBe(2);
    await expect(page.getByRole("textbox", { name: "Process title", exact: true })).toHaveValue("Fictional Process title");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Discard process discovery draft", exact: true }).click();
    await page.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await createProcess(page);
    record = await (await page.request.get(`/api/v1/engagements/${value.engagement}`, { headers: value.headers })).json();
    expect(record.engagement.processes).toHaveLength(1);
    expect(record.engagement.objective).toBe("Concurrent saved edit");
    expect(record.expires_at).toBe(value.initialExpiry);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await page.unroute(pattern); await cleanup(page.request, value); }
});

test("Home discovery library isolates identities and workspace changes and opens viewer records read-only", async ({ page, browser }) => {
  const value = await fixture(page.request);
  const ownerHeaders = { Authorization: "Bearer " + value.owner.token };
  const operatorHeaders = { Authorization: "Bearer " + value.operator.token };
  const personal = await json(page.request, "post", "/engagements", ownerHeaders, { engagement: {
    title: "Owner personal Home discovery", objective: "Personal scope", business_units: "Fictional SRE",
    sponsor: "Fictional sponsor", engagement_owner: "Fictional lead",
  } });
  const other = await json(page.request, "post", "/engagements", operatorHeaders, { engagement: {
    title: "Other identity Home discovery", objective: "Other personal scope", business_units: "Fictional operations",
    sponsor: "Fictional sponsor", engagement_owner: "Fictional lead",
  } });
  const viewerContext = await browser.newContext();
  try {
    await open(page, value.owner, value);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
    let panel = page.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
    await expect(panel.locator("tbody tr")).toHaveCount(1);
    await expect(panel).toContainText("Browser process discovery");
    await expect(panel).not.toContainText("Owner personal Home discovery");
    await expect(panel).not.toContainText("Other identity Home discovery");
    await page.getByRole("combobox", { name: "Workspace organization", exact: true }).selectOption("");
    panel = page.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
    await expect(panel.locator("tbody tr")).toHaveCount(1);
    await expect(panel).toContainText("Owner personal Home discovery");
    await expect(panel).not.toContainText("Browser process discovery");
    await expect(panel).not.toContainText("Other identity Home discovery");
    await panel.getByRole("button", { name: "Open discovery Owner personal Home discovery", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("Owner personal Home discovery");
    const viewer = await viewerContext.newPage();
    await open(viewer, value.operator, value);
    await viewer.getByRole("button", { name: "Home", exact: true }).click();
    await viewer.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
    const viewerPanel = viewer.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
    await expect(viewerPanel.locator("tbody tr")).toHaveCount(1);
    await expect(viewer.getByRole("button", { name: /^New discovery engagement/ })).toBeDisabled();
    await viewerPanel.getByRole("button", { name: "Open discovery Browser process discovery", exact: true }).click();
    await expect(viewer.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("Browser process discovery");
    await expect(viewer.getByRole("textbox", { name: "Engagement title", exact: true })).toBeDisabled();
    await expect(viewer.getByRole("button", { name: "Save discovery engagement", exact: true })).toBeDisabled();
    expect((await viewer.request.get(`/api/v1/engagements/${personal.id}`, { headers: operatorHeaders })).status()).toBe(404);
  } finally {
    await viewerContext.close();
    for (const [record, headers] of [[personal, ownerHeaders], [other, operatorHeaders]] as const) {
      const current = await (await page.request.get(`/api/v1/engagements/${record.id}`, { headers })).json();
      expect((await page.request.delete(`/api/v1/engagements/${record.id}?${new URLSearchParams({ version: current.version })}`, { headers })).ok()).toBe(true);
    }
    await cleanup(page.request, value);
  }
});

test("Home workspace filter selects real membership after sign-in, scopes new discovery and enforces viewer access", async ({ page, browser }) => {
  const value = await fixture(page.request);
  const viewerContext = await browser.newContext();
  let created = "";
  async function selectTeam(target: Page, subject: Identity) {
    await target.goto("/workspace");
    await target.getByLabel("Access token", { exact: true }).fill(subject.token);
    await target.getByRole("button", { name: "Connect securely", exact: true }).click();
    await expect(target.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await target.getByRole("combobox", { name: "Workspace organization", exact: true }).selectOption(value.organization);
    await target.getByRole("combobox", { name: "Workspace team", exact: true }).selectOption(value.team);
    await target.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
    await expect(target.getByRole("tabpanel", { name: "Discovery engagements", exact: true })).toContainText("Browser process discovery");
  }
  try {
    await selectTeam(page, value.owner);
    await page.getByRole("button", { name: /^New discovery engagement/ }).click();
    await page.getByRole("textbox", { name: "Engagement title", exact: true }).fill("Home-selected team discovery");
    await page.getByRole("textbox", { name: "Business objective", exact: true }).fill("Validate selected team scope");
    await page.getByRole("textbox", { name: "Business units in scope", exact: true }).fill("Fictional banking operations");
    await page.getByRole("textbox", { name: "Sponsor", exact: true }).fill("Fictional sponsor");
    await page.getByRole("textbox", { name: "Engagement owner", exact: true }).fill("Fictional discovery lead");
    const response = page.waitForResponse(result => result.url().endsWith("/api/v1/engagements") && result.request().method() === "POST");
    await page.getByRole("button", { name: "Save discovery engagement", exact: true }).click();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    const record = await saved.json();
    created = record.id;
    expect(saved.request().headers()["x-organization-id"]).toBe(value.organization);
    expect(saved.request().headers()["x-team-id"]).toBe(value.team);
    expect((await page.request.get(`/api/v1/engagements/${created}`, { headers: value.headers })).ok()).toBe(true);
    expect((await page.request.get(`/api/v1/engagements/${created}`,
      { headers: { Authorization: "Bearer " + value.owner.token } })).status()).toBe(404);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "Discovery engagements", exact: true })).toContainText("Home-selected team discovery");
    await page.getByRole("combobox", { name: "Workspace organization", exact: true }).selectOption("");
    await expect(page.getByRole("tabpanel", { name: "Discovery engagements", exact: true })).not.toContainText("Home-selected team discovery");
    expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
    const viewer = await viewerContext.newPage();
    await selectTeam(viewer, value.operator);
    await expect(viewer.getByRole("button", { name: /^New discovery engagement/ })).toBeDisabled();
    await viewer.getByRole("tab", { name: "Workflow library", exact: true }).click();
    await expect(viewer.getByRole("button", { name: /^Create workflow/ })).toBeDisabled();
  } finally {
    await viewerContext.close();
    if (created) {
      const record = await (await page.request.get(`/api/v1/engagements/${created}`, { headers: value.headers })).json();
      expect((await page.request.delete(`/api/v1/engagements/${created}?version=${encodeURIComponent(record.version)}`,
        { headers: value.headers })).ok()).toBe(true);
    }
    await cleanup(page.request, value);
  }
});

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

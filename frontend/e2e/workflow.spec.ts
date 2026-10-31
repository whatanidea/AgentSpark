import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function intake(page: Page, sample?: string, cloud = "azure") {
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await page.getByLabel("Target cloud", { exact: true }).selectOption(cloud);
  await expect(page).toHaveTitle("AgentSpark — Enterprise AI Transformation Advisor");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.getByRole("main")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByText("AgentSpark", { exact: true })).toBeVisible();
  await expect(page.getByText("AgentSense", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tell AgentSpark about a workflow", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enterprise Context", exact: true })).toBeVisible();
  if (sample) await page.getByRole("button", { name: sample, exact: true }).click();
  else await page.getByLabel("Business Domain", { exact: true }).fill("Fictional incomplete workflow");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
}

async function analyze(page: Page) {
  await page.getByRole("button", { name: "3 · Workflow Analysis", exact: true }).click();
  const button = page.getByRole("button", { name: "▶ Run Multi-Agent Analysis", exact: true });
  await expect(button).toBeEnabled();
  const response = page.waitForResponse(r => r.url().includes("/analyze/") && r.request().method() === "POST");
  await button.click();
  const result = await (await response).json();
  await expect(button).toBeEnabled();
  return result;
}

test.afterEach(async ({ page }) => {
  // Each test owns one isolated browser tab and deletes its own fictional server document.
  const pointer = await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"));
  if (pointer) {
    const { session, workspace } = JSON.parse(pointer);
    const response = await page.request.delete(`/api/v1/sessions/${session}`, {
      headers: workspace ? { "X-Organization-ID": workspace.organization_id, "X-Team-ID": workspace.team_id } : {},
    });
    expect([200, 404]).toContain(response.status());
  }
});

test("incomplete demo input withholds scores and estimates", async ({ page }) => {
  await intake(page);
  const result = await analyze(page);
  expect(result.status).toBe("needs_clarification");
  expect(result.score).toBeNull();
  expect(result.roi).toBeNull();
  expect(result.analysis_id).toBeNull();
  await expect(page.getByText("Clarification required — score, ROI and blueprint are withheld.", { exact: true })).toBeVisible();
});

test("guided interview stops at ten rounds and completes via a saved checklist", async ({ page }) => {
  await intake(page, undefined, "aws");
  for (let round = 1; round <= 10; round += 1) {
    await page.getByRole("textbox", { name: "Describe your workflow", exact: true }).fill(`Fictional answer ${round}`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(`Interview rounds: ${round} / 10`, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("textbox", { name: "Describe your workflow", exact: true })).toBeDisabled();
  await expect(page.getByText("The 10-round interview limit is reached.", { exact: false }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "2 · Diagnostic Interview", exact: true }).click();
  await expect(page.getByText("Interview rounds: 10 / 10", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Editable interview checklist", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const response = await page.request.get(`/api/v1/sessions/${pointer.session}/interview`);
  const progress = await response.json();
  const facts: Record<string, string> = {
    workflow_name: "Fictional insurance claims", summary: "Summarize evidence for a human examiner.",
    steps: "8", departments: "Claims Operations, Finance", decision_points: "3", systems: "Claims portal, Policy system",
    exceptions_per_week: "30", volume_per_day: "100", compliance_sensitivity: "High",
    data_availability: "Medium", rule_stability: "Evolving", human_judgment: "High",
    unstructured_content: "High", error_cost: "High",
  };
  for (const field of progress.fields.filter((item: { id: string }) => progress.missing_fields.includes(item.id))) {
    const value = field.id.startsWith("fact.") ? facts[field.id.slice(5)] :
      field.id.startsWith("runtime.") && field.kind === "select" ? "unknown" :
      field.id === "context.preferred_region" ? "us-east-1" : "Fictional proposed control; validation is outstanding.";
    const input = page.getByRole(field.kind === "select" ? "combobox" : field.kind === "number" ? "spinbutton" : "textbox",
      { name: new RegExp(`^${field.label}`) });
    if (field.kind === "select") await input.selectOption(value);
    else await input.fill(value);
  }
  await page.getByRole("button", { name: "Save interview answers", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Answers saved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Analysis →", exact: true })).toBeEnabled();
  const result = await analyze(page);
  expect(result.diagnosis.missing_facts).toEqual([]);
  expect(result.readiness_report.decision).toBe("ready_with_conditions");
  expect(result.readiness_report.checks.every((check: { status: string }) => check.status === "needs_validation")).toBe(true);
  expect(result.enterprise_context.preferred_region).toBe("us-east-1");
  expect(result.enterprise_context.data_residency_requirements).toContain("validation is outstanding");
});

test("guided interview skips fixture facts and rejects a stale checklist without losing edits", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)", "aws");
  await expect(page.getByText("0 required workflow facts", { exact: false })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const path = `/api/v1/sessions/${pointer.session}/interview`;
  const initial = await (await page.request.get(path)).json();
  expect(initial.questions.length).toBeLessThanOrEqual(3);
  expect(initial.questions.some((question: string) => question.includes("workflow called"))).toBe(false);
  await page.getByRole("button", { name: "Review answers / complete checklist", exact: true }).click();
  await page.getByRole("textbox", { name: /^Pilot scope/ }).fill("Unsaved fictional pilot draft");
  const external = await page.request.put(path, { data: {
    version: initial.version, answers: { "pilot.success_metrics": "Externally updated fictional metric" },
  } });
  expect(external.status()).toBe(200);
  await page.getByRole("button", { name: "Save interview answers", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("reload before saving");
  await expect(page.getByRole("textbox", { name: /^Pilot scope/ })).toHaveValue("Unsaved fictional pilot draft");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reload interview", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^Pilot scope/ })).toHaveValue("");
});

test("PDF reports download for provisional and approved blueprints without replacing Markdown export", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)", "aws");
  const analysis = await analyze(page);
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled();
  async function downloadPdf(status: string) {
    const downloading = page.waitForEvent("download");
    const responding = page.waitForResponse(response => response.url().includes("/pdf?"));
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const response = await responding;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(new URL(response.url()).searchParams.get("analysis_id")).toBe(analysis.analysis_id);
    expect(new URL(response.url()).searchParams.get("status")).toBe(status);
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("AgentSpark_Assessment.pdf");
    const stream = await download.createReadStream();
    if (!stream) throw new Error("PDF download stream unavailable");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const document = Buffer.concat(chunks);
    expect(document.subarray(0, 5).toString()).toBe("%PDF-");
    expect(document.toString("latin1").trimEnd()).toMatch(/%%EOF$/);
    expect(document.length).toBeGreaterThan(10000);
    await expect(page.getByRole("button", { name: "⬇ Export .md", exact: true })).toBeEnabled();
  }
  await downloadPdf("awaiting_human_review");
  await page.getByLabel("Reviewer", { exact: true }).fill("Fictional PDF browser reviewer");
  await page.getByLabel("Review rationale", { exact: true }).fill("Approved advisory design with unresolved pilot prerequisites");
  await page.getByRole("button", { name: "Approve recommendation", exact: true }).click();
  await expect(page.getByText("Recommendation approved by a human reviewer", { exact: true })).toBeVisible();
  await downloadPdf("completed");
});

test("PDF export refreshes stale analyses and reports download failures instead of saving JSON", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)");
  const original = await analyze(page);
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const response = await page.request.post(`/api/v1/analyze/${pointer.session}`);
  expect(response.status()).toBe(200);
  const updated = await response.json();
  expect(updated.analysis_id).not.toBe(original.analysis_id);
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Recommendation changed");
  expect(downloads).toBe(0);
  const pattern = "**/blueprint/*/pdf?**";
  for (const failure of [
    { status: 200, body: { unexpected: "not a PDF" }, message: "unexpected response" },
    { status: 409, body: { detail: "Recommendation changed during PDF generation" }, message: "changed during PDF generation" },
    { status: 503, body: { detail: "PDF renderer unavailable" }, message: "PDF renderer unavailable" },
  ]) {
    await page.route(pattern, route => route.fulfill({
      status: failure.status, contentType: "application/json", body: JSON.stringify(failure.body),
    }));
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(failure.message);
    expect(downloads).toBe(0);
    await page.unroute(pattern);
    await page.getByRole("button", { name: "Generate / Fetch", exact: true }).click();
    await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled();
  }
});

test("implementation readiness persists blockers, exports and retains the reviewed snapshot", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)", "aws");
  await page.getByRole("button", { name: "Implementation readiness", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Implementation readiness", exact: true })).toBeVisible();
  const report = page.locator(".surface-card").filter({
    has: page.getByRole("heading", { name: "Implementation Readiness Report", exact: true }),
  });
  await expect(report.getByText("Not assessed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AWS prerequisites", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Status — Integration access", exact: true }).selectOption("blocked");
  await page.getByRole("textbox", { name: "Finding — Integration access", exact: true }).fill("SAP sandbox access unavailable");
  await page.getByRole("textbox", { name: "Owner — Integration access", exact: true }).fill("SAP administrator");
  await page.getByRole("textbox", { name: "Next action — Integration access", exact: true }).fill("Confirm supported SAP API and test access");
  await page.getByRole("textbox", { name: "Completion evidence — Integration access", exact: true }).fill("Successful authorized sandbox connection");
  await page.getByRole("textbox", { name: "Pilot scope", exact: true }).fill("Invoice triage in sandbox only");
  await page.getByRole("textbox", { name: "Success metrics and acceptance thresholds", exact: true }).fill("95% routing accuracy across 100 cases");
  await page.getByRole("textbox", { name: "Failure handling and rollback tests", exact: true }).fill("Timeout falls back to the manual queue");
  await page.getByRole("textbox", { name: "Authorization boundaries and prohibited actions", exact: true }).fill("Finance alone releases payments");
  await page.getByRole("button", { name: "Save readiness assessment", exact: true }).click();
  await expect(page.getByText("Readiness saved.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Owner — Integration access", exact: true })).toHaveValue("SAP administrator");
  await expect(page.getByRole("combobox", { name: "Owner assignment — Integration access", exact: true })).toHaveValue("proposed");
  const standalone = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export readiness .md", exact: true }).click();
  const standaloneStream = await (await standalone).createReadStream();
  if (!standaloneStream) throw new Error("Readiness export unavailable");
  let reportMarkdown = "";
  for await (const chunk of standaloneStream) reportMarkdown += chunk.toString("utf8");
  for (const text of ["Implementation Readiness Report", "P0", "SAP administrator", "95% routing accuracy",
    "Finance alone releases payments", "Not attached to a current analysis"]) expect(reportMarkdown).toContain(text);
  const analysis = await analyze(page);
  expect(analysis.readiness_report.decision).toBe("blocked");
  expect(analysis.readiness_report.blockers).toEqual(["integration_access"]);
  expect(analysis.readiness_report.actions[0].priority).toBe("P0");
  await expect(page.getByRole("heading", { name: "Implementation Readiness Report", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Implementation Readiness Report", exact: true })).toBeVisible();
  await page.getByLabel("Reviewer", { exact: true }).fill("Fictional readiness reviewer");
  await page.getByLabel("Review rationale", { exact: true }).fill("Architecture only; resolve pilot blockers before implementation");
  await page.getByRole("button", { name: "Approve recommendation", exact: true }).click();
  await expect(page.getByText("Recommendation approved by a human reviewer", { exact: true })).toBeVisible();
  const blueprint = page.waitForEvent("download");
  await page.getByRole("button", { name: "⬇ Export .md", exact: true }).click();
  const stream = await (await blueprint).createReadStream();
  if (!stream) throw new Error("Blueprint export unavailable");
  let markdown = "";
  for await (const chunk of stream) markdown += chunk.toString("utf8");
  for (const text of ["Implementation Readiness Report", "SAP sandbox access unavailable", "95% routing accuracy",
    "Fictional readiness reviewer", "not compliance certification"]) expect(markdown).toContain(text);
  await page.getByRole("button", { name: "Implementation readiness", exact: true }).click();
  await page.getByRole("textbox", { name: "Finding — Integration access", exact: true }).fill("New access approval is required");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Save readiness assessment", exact: true }).click();
  await expect(page.getByText("Readiness saved.", { exact: false })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const current = await (await page.request.get(`/api/v1/sessions/${pointer.session}`)).json();
  expect(current.analysis_id).toBeNull();
  expect(current.human_review).toBeNull();
  const archive = await (await page.request.get(`/api/v1/decisions/${pointer.session}/${analysis.analysis_id}`)).json();
  expect(archive.details.readiness_report).toEqual(analysis.readiness_report);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Approved", exact: true }).click();
  await expect(page.getByText("SAP sandbox access unavailable", { exact: true })).toBeVisible();
});

test("stale readiness form cannot overwrite updates and read-only readiness remains inspectable", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)");
  await page.getByRole("button", { name: "Implementation readiness", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Azure prerequisites", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const path = `/api/v1/sessions/${pointer.session}/implementation-readiness`;
  expect((await page.request.put(path, { data: {
    revision: 0, evidence_revision: 0, assessment: { checks: [
      { id: "integration_access", status: "blocked", finding: "Concurrent access blocker" },
    ] },
  } })).status()).toBe(200);
  await page.getByRole("textbox", { name: "Finding — Integration access", exact: true }).fill("Stale local finding");
  await page.getByRole("button", { name: "Save readiness assessment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Readiness or evidence changed");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reload readiness", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Finding — Integration access", exact: true })).toHaveValue("Concurrent access blocker");
  await page.route(`**${path}`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, permissions: { ...body.permissions, write: false } } });
  });
  await page.getByRole("button", { name: "Reload readiness", exact: true }).click();
  await expect(page.getByText("Read-only: a contributor must update this assessment.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Finding — Integration access", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save readiness assessment", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export readiness .md", exact: true })).toBeEnabled();
});

test("removed readiness evidence links can be cleared without losing the assessment", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)");
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const base = `/api/v1/sessions/${pointer.session}`;
  const identifier = randomUUID();
  expect((await page.request.put(`${base}/evidence`, { data: { revision: 0, entries: [
    { id: identifier, kind: "client_fact", statement: "Sandbox access requires approval" },
  ] } })).status()).toBe(200);
  expect((await page.request.put(`${base}/implementation-readiness`, { data: {
    revision: 0, evidence_revision: 1, assessment: { checks: [
      { id: "integration_access", status: "blocked", finding: "Access unavailable", evidence_ids: [identifier] },
    ] },
  } })).status()).toBe(200);
  expect((await page.request.put(`${base}/evidence`, { data: { revision: 1, entries: [] } })).status()).toBe(200);
  await page.getByRole("button", { name: "Implementation readiness", exact: true }).click();
  await expect(page.getByText(`Evidence ${identifier} was removed; update this link.`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear evidence links — Integration access", exact: true }).click();
  await page.getByRole("button", { name: "Save readiness assessment", exact: true }).click();
  await expect(page.getByText("Readiness saved.", { exact: false })).toBeVisible();
  const current = await (await page.request.get(`${base}/implementation-readiness`)).json();
  expect(current.assessment.checks.find((check: { id: string }) => check.id === "integration_access").evidence_ids).toEqual([]);
  expect(current.report.decision).toBe("blocked");
});

test("evidence register links findings, records confirmation, exports and preserves approved snapshots", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)", "aws");
  await page.getByRole("button", { name: "Evidence & assumptions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence & assumptions", exact: true })).toBeVisible();
  const entries = [
    ["client_fact", "500 invoices per business day", "", "volume_per_day"],
    ["supported_finding", "25 exceptions weekly from Finance report", "Fictional Finance report, page 3", "exceptions_per_week"],
    ["assumption", "30% of supporting documents are incomplete", "", "unstructured_content"],
    ["open_question", "Can SAP expose goods receipt status?", "", "systems"],
  ];
  for (const [kind, statement, source, fact] of entries) {
    await page.getByLabel("Entry type", { exact: true }).selectOption(kind);
    await page.getByLabel("Statement or question", { exact: true }).fill(statement);
    await page.getByLabel("Source reference", { exact: true }).fill(source);
    await page.getByLabel("Reporting period", { exact: true }).fill("September 2026");
    await page.getByLabel("Related diagnostic inputs", { exact: true }).selectOption([fact]);
    await page.getByRole("button", { name: "Save evidence entry", exact: true }).click();
    await expect(page.getByLabel("Statement or question", { exact: true })).toHaveValue("");
    await expect(page.getByText(statement, { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Evidence register (4/50)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm finding", exact: true }).click();
  await page.getByLabel("Confirmation method", { exact: true }).fill("Inspected fictional report page 3 and checked sample totals.");
  await page.getByRole("button", { name: "Save confirmation", exact: true }).click();
  await expect(page.getByText("Reviewer-confirmed by", { exact: false })).toBeVisible();
  const result = await analyze(page);
  expect(result.evidence_report.entries).toHaveLength(4);
  expect(result.evidence_report.validation_checklist).toHaveLength(3);
  const finding = result.evidence_report.findings.find((item: { fact: string }) => item.fact === "exceptions_per_week");
  const supported = result.evidence_report.entries.find((item: { kind: string }) => item.kind === "supported_finding");
  expect(finding.evidence_ids).toContain(supported.id);
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence-backed assessment", exact: true })).toBeVisible();
  await page.getByLabel("Reviewer", { exact: true }).fill("Fictional evidence reviewer");
  await page.getByLabel("Review rationale", { exact: true }).fill("Checked source attestation and remaining assumptions.");
  await page.getByRole("button", { name: "Approve recommendation", exact: true }).click();
  await expect(page.getByText("Recommendation approved by a human reviewer", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "⬇ Export .md", exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  if (!stream) throw new Error("Evidence export stream unavailable");
  let markdown = "";
  for await (const chunk of stream) markdown += chunk.toString("utf8");
  for (const text of ["Evidence register, findings and outstanding validation", supported.id,
    "Inspected fictional report page 3", "Can SAP expose goods receipt status?", "September 2026",
    "not independently checked"]) expect(markdown).toContain(text);
  await page.getByRole("button", { name: "Evidence & assumptions", exact: true }).click();
  const supportedSection = page.locator("section").filter({ has: page.getByText(entries[1][1], { exact: true }) });
  await supportedSection.getByRole("button", { name: "Edit entry", exact: true }).click();
  await page.getByLabel("Statement or question", { exact: true }).fill("Updated finding needing new confirmation");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Save evidence entry", exact: true }).click();
  await expect(page.getByLabel("Statement or question", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Confirm finding", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const current = await (await page.request.get(`/api/v1/sessions/${pointer.session}`)).json();
  expect(current.analysis_id).toBeNull();
  expect(current.human_review).toBeNull();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Approved", exact: true }).click();
  await expect(page.getByText(entries[1][1], { exact: true })).toBeVisible();
  await expect(page.getByText("Reviewer-confirmed by", { exact: false })).toBeVisible();
  await expect(page.getByText("Updated finding needing new confirmation", { exact: true })).toHaveCount(0);
});

test("stale evidence form shows a conflict and reloads without overwriting another update", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)");
  await page.getByRole("button", { name: "Evidence & assumptions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence register (0/50)", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  const entry = { id: randomUUID(), kind: "assumption", statement: "Another tab saved this assumption",
    source_reference: "", reporting_period: "", related_facts: [] };
  expect((await page.request.put(`/api/v1/sessions/${pointer.session}/evidence`,
    { data: { revision: 0, entries: [entry] } })).ok()).toBe(true);
  await page.getByLabel("Statement or question", { exact: true }).fill("Stale draft must not overwrite");
  await page.getByRole("button", { name: "Save evidence entry", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Evidence changed; reload");
  await expect(page.getByLabel("Statement or question", { exact: true })).toHaveValue("Stale draft must not overwrite");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reload evidence", exact: true }).click();
  await expect(page.getByText(entry.statement, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Statement or question", { exact: true })).toHaveValue("");
});

test("human review survives reload and exports current evidence and scenarios", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)");
  await page.getByRole("textbox", { name: "Describe your workflow", exact: true }).fill("Contact fictional@example.com about this sample.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).not.toContainText("fictional@example.com");
  const result = await analyze(page);
  expect(result.status).toBe("awaiting_human_review");
  expect(result.recommendation.strategy.pattern_ids).toContain("p04");
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await page.getByLabel("Reviewer", { exact: true }).fill("Fictional CI reviewer");
  await page.getByLabel("Review rationale", { exact: true }).fill("Validated fictional fixture and required controls.");
  await page.getByRole("button", { name: "Approve recommendation", exact: true }).click();
  await expect(page.getByText("Recommendation approved by a human reviewer", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Workflow restored from the server.", { exact: true })).toBeVisible();
  await expect(page.getByText("Recommendation approved by a human reviewer", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "⬇ Export .md", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("AgentSpark_Blueprint.md");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Markdown export stream is unavailable");
  let markdown = "";
  for await (const chunk of stream) markdown += chunk.toString("utf8");
  expect(markdown).toMatch(/^# AgentSpark Blueprint\n/);
  for (const text of ["demo_fixture", "conservative", "optimistic", "SHA256", "not deployment-ready"]) {
    expect(markdown).toContain(text);
  }
  expect(markdown).not.toContain("PROVISIONAL: NOT APPROVED");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Approved", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Decision details", exact: true })).toBeVisible();
  await expect(page.getByText("Approved by Fictional CI reviewer", { exact: true })).toBeVisible();
  await expect(page.getByText("Validated fictional fixture and required controls.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve recommendation", exact: true })).toHaveCount(0);
});

test("no-agent outcome stays rejected and confirmed deletion removes restoration pointer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await intake(page, "Payroll Calculation (standard software)");
  const result = await analyze(page);
  expect(result.status).toBe("rejected");
  expect(result.roi.implementation_cost).toBe(0);
  expect(result.roi.payback_months).toBeNull();
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByText("Rejected — no agentic blueprint", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve recommendation", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Rejected", exact: true }).click();
  await page.getByRole("button", { name: "Open Payroll Calculation Rejected", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Automated policy decision", exact: true })).toBeVisible();
  await expect(page.getByText("This is a policy outcome, not a human review. No approver comments were submitted.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Delete workflow", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Confirm workflow deletion" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete workflow", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("light workspace supports keyboard focus, sample selection and readable primary actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  const domain = page.getByLabel("Business Domain", { exact: true });
  await domain.focus();
  await expect(domain).toHaveCSS("border-color", "rgb(13, 148, 136)");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Team Size", exact: true })).toBeFocused();
  const sample = page.getByRole("button", { name: "🧾 Invoice Approval (Finance)", exact: true });
  await expect(sample).toBeEnabled();
  await expect(sample.locator("svg")).toBeVisible();
  await sample.click();
  await expect(sample).toHaveAttribute("aria-pressed", "true");
  await expect(domain).toHaveValue("Financial Services — Accounts Payable");
  const submit = page.getByRole("button", { name: "Submit Intake", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("background-color", "rgb(15, 118, 110)");
  await expect(submit).toHaveCSS("color", "rgb(255, 255, 255)");
  const contrast = await submit.evaluate((element) => {
    const luminance = (color: string) => {
      const channels = color.match(/\d+/g);
      if (!channels || channels.length !== 3) throw new Error(`Expected opaque RGB color: ${color}`);
      return channels.map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("portfolio shows an empty state, reports failures and supports retry on mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("button", { name: "Sample Portfolio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compare opportunities in one place", exact: true })).toBeVisible();
  await page.route("**/api/v1/portfolio", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Portfolio temporarily unavailable." }),
  }), { times: 1 });
  await page.getByRole("button", { name: "Score Backlog", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Portfolio temporarily unavailable.");
  await page.getByRole("button", { name: "Score Backlog", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sample workflow comparison", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("mobile analysis and provisional review stay within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await intake(page, "🧾 Invoice Approval (Finance)");
  const result = await analyze(page);
  expect(result.status).toBe("awaiting_human_review");
  await expect(page.getByRole("table")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByLabel("Reviewer", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve recommendation", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Home opens drafts in their saved workflow context", async ({ page }) => {
  await intake(page);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Draft / clarification", exact: true }).click();
  await page.getByRole("button", { name: "Open Fictional incomplete workflow Draft / clarification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enterprise Context", exact: true })).toBeVisible();
  await expect(page.getByLabel("Business Domain", { exact: true })).toHaveValue("Fictional incomplete workflow");
});

test("Home retains human rejection comments and cascade deletion removes the decision", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)");
  await analyze(page);
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await page.getByLabel("Reviewer", { exact: true }).fill("Fictional rejection reviewer");
  await page.getByLabel("Review rationale", { exact: true }).fill("Fictional review: require manual controls.");
  await page.getByRole("button", { name: "Reject recommendation", exact: true }).click();
  await expect(page.getByText("Rejected — no agentic blueprint", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Rejected", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Rejected", exact: true }).click();
  await expect(page.getByText("Rejected by Fictional rejection reviewer", { exact: true })).toBeVisible();
  await expect(page.getByRole("blockquote").filter({ hasText: "Fictional review: require manual controls." })).toBeVisible();
  await page.getByRole("button", { name: "Delete workflow & history", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm workflow and archive deletion", exact: true });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("blockquote").filter({ hasText: "Fictional review: require manual controls." })).toBeVisible();
  await page.getByRole("button", { name: "Delete workflow & history", exact: true }).click();
  await confirmation.getByRole("button", { name: "Delete workflow & history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Invoice Approval Rejected", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("Home reports listing failure and refresh recovers", async ({ page }) => {
  await page.route("**/api/v1/home?*", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Workflow library temporarily unavailable." }),
  }), { times: 1 });
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Workflow library temporarily unavailable.");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No workflows in this view", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("team workspace restores its scope, prevents self-review and stays separate from personal Home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  const administration = page.getByRole("button", { name: "Organizations & teams", exact: true });
  await administration.click();
  await expect(page.getByText("Shared local demo: everyone uses the same identity.", { exact: false })).toBeVisible();
  await page.getByLabel("Organization name", { exact: true }).fill("Fictional browser organization");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Browser finance");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await page.getByRole("button", { name: "Manage Browser finance roles", exact: true }).click();
  await page.getByLabel("Team member identity ID", { exact: true }).fill("local-demo");
  await page.getByLabel("reviewer", { exact: true }).check();
  await page.getByRole("button", { name: "Save team roles", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Team roles saved." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Use Browser finance", exact: true }).click();
  await page.getByRole("button", { name: "Create workflow", exact: false }).click();
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  await page.getByRole("button", { name: "🧾 Invoice Approval (Finance)", exact: true }).click();
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const result = await analyze(page);
  expect(result.status).toBe("awaiting_human_review");
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.getByText("Your identity cannot review this workflow.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve recommendation", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Workflow restored from the server.", { exact: true })).toBeVisible();
  await expect(page.getByText("Fictional browser organization / Browser finance", { exact: true })).toBeVisible();
  await expect(page.getByText("Your identity cannot review this workflow.", { exact: false })).toBeVisible();
  const pointer = await page.evaluate(() => JSON.parse(sessionStorage.getItem("agentsense.session.v1")!));
  expect(pointer.workspace.organization_id).toBeTruthy();
  expect(pointer.workspace.team_id).toBeTruthy();
  const personalRead = await page.request.get(`/api/v1/sessions/${pointer.session}`);
  expect(personalRead.status()).toBe(404);
  await administration.click();
  await page.getByRole("button", { name: "Use personal workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Invoice Approval Pending review", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
  await administration.click();
  await page.getByRole("combobox", { name: "Organization", exact: true }).selectOption({ label: "Fictional browser organization (owner)" });
  await page.getByRole("button", { name: "Use Browser finance", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Pending review", exact: true }).click();
  await expect(page.getByText("Your identity cannot review this workflow.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Delete workflow", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Invoice Approval Pending review", exact: true })).toHaveCount(0);
});

test("team member can delete an own draft and open reviews without a global reviewer role", async ({ page }) => {
  const organizationResponse = await page.request.post("/api/v1/organizations", { data: { name: "Member permissions test" } });
  expect(organizationResponse.status()).toBe(201);
  const organization = (await organizationResponse.json()).organization_id;
  const teamResponse = await page.request.post(`/api/v1/organizations/${organization}/teams`, { data: { name: "Member finance" } });
  expect(teamResponse.status()).toBe(201);
  const team = (await teamResponse.json()).team_id;
  const headers = { "X-Organization-ID": organization, "X-Team-ID": team };
  const draft = randomUUID();
  const pending = randomUUID();
  for (const session of [draft, pending]) {
    const response = await page.request.post("/api/v1/intake", { headers, data: {
      session_id: session, business_domain: session === draft ? "Own draft" : "Other creator review", team_size: "1-50",
      existing_systems: "Sample", pain_points: "Sample", compliance_requirements: "High", demo_scenario: "invoice",
    } });
    expect(response.status()).toBe(200);
  }
  expect((await page.request.post(`/api/v1/analyze/${pending}`, { headers })).status()).toBe(200);
  // Simulate an independent team member in the shared-demo browser fixture.
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { identity: "local-demo", can_review: false } }));
  await page.route("**/api/v1/organizations?*", route => route.fulfill({ json: {
    items: [{ organization_id: organization, name: "Member permissions test", role: "member" }], next_cursor: null,
  } }));
  await page.route(`**/api/v1/organizations/${organization}/teams?*`, route => route.fulfill({ json: {
    items: [{ team_id: team, name: "Member finance", permissions: ["read", "write", "review"] }], next_cursor: null,
  } }));
  await page.route("**/api/v1/home?*", async route => {
    const response = await route.fetch();
    const result = await response.json();
    await route.fulfill({ json: { ...result, items: result.items.map((item: { session_id: string }) => ({
      ...item, can_delete: item.session_id === draft,
    })) } });
  });
  for (const path of [`sessions/${pending}`, `blueprint/${pending}`]) {
    await page.route(`**/api/v1/${path}`, async route => {
      const response = await route.fetch();
      await route.fulfill({ json: { ...await response.json(),
        permissions: { read: true, write: true, review: true, delete: false } } });
    });
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
  await page.getByRole("button", { name: "Use Member finance", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Own draft and history", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete Invoice Approval and history", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Delete Own draft and history", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete workflow & history", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Own draft and history", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Pending review", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Pending review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve recommendation", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete workflow", exact: true })).toBeDisabled();
});

test("AWS assessment restores, exports, archives and invalidates approval when cloud changes", async ({ page }) => {
  await intake(page, "🧾 Invoice Approval (Finance)", "aws");
  const result = await analyze(page);
  expect(result.cloud_mapping.target_cloud).toBe("aws");
  expect(result.cloud_mapping.ai).toBe("Amazon Bedrock");
  await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
  await expect(page.locator("dd").filter({ hasText: /^Amazon Bedrock$/ })).toBeVisible();
  await page.getByLabel("Reviewer", { exact: true }).fill("Fictional AWS reviewer");
  await page.getByLabel("Review rationale", { exact: true }).fill("Reviewed AWS assessment and human gates.");
  await page.getByRole("button", { name: "Approve recommendation", exact: true }).click();
  await expect(page.getByText("Recommendation approved by a human reviewer", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Workflow restored from the server.", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "⬇ Export .md", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Export stream missing");
  let markdown = "";
  for await (const chunk of stream) markdown += chunk.toString();
  expect(markdown).toContain("**Target cloud:** AWS");
  expect(markdown).toContain("Amazon Bedrock");
  expect(markdown).toContain("Azure-hosted");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Approved", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviewed deployment target", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await expect(page.getByLabel("Target cloud", { exact: true })).toHaveValue("aws");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm deployment preference change", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm preferences and save intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = await page.evaluate(() => JSON.parse(sessionStorage.getItem("agentsense.session.v1")!));
  const snapshot = await (await page.request.get(`/api/v1/sessions/${pointer.session}`)).json();
  expect(snapshot.enterprise_context.target_cloud).toBe("azure");
  expect(snapshot.analysis_id).toBeNull();
  expect(snapshot.human_review).toBeNull();
});

test("invite links join a team without exchanging identity IDs and are single-use", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
  await page.getByLabel("Organization name", { exact: true }).fill("Fictional invite organization");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Invite claims");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use Invite claims", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Team access", exact: true }).selectOption({ label: "Invite claims" });
  await page.getByRole("checkbox", { name: "contributor", exact: true }).last().uncheck();
  await page.getByRole("checkbox", { name: "reviewer", exact: true }).last().check();
  await page.getByRole("button", { name: "Create invite link", exact: true }).click();
  const linkField = page.getByLabel("New invite link (copy it now; it is not shown again)", { exact: true });
  await expect(linkField).toHaveValue(/#invite=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const link = await linkField.inputValue();
  await expect(page.getByText("Used 0/1", { exact: false })).toBeVisible();

  await page.goto(link);
  await expect(page.getByText("You opened an invite link.", { exact: false })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByLabel("Invite link or code", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "Join organization", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Joined Fictional invite organization as owner with team access." })).toBeVisible();
  await expect(page.getByText("Used 1/1", { exact: false })).toBeVisible();
  await expect(page.getByText("used", { exact: true })).toBeVisible();

  await page.getByLabel("Invite link or code", { exact: true }).fill(link);
  await page.getByRole("button", { name: "Join organization", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid, expired, revoked, or already used");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

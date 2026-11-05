import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { processingResult, watchProcessing } from "./responses";

function fixture(kind: "pdf" | "docx", scenario: "partial" | "complete" | "conflict" | "scan") {
  const script = [
    "import sys; sys.path.insert(0, 'tests')",
    "from test_document_intake import pdf, docx, FACTS",
    "kind, scenario = sys.argv[1:3]",
    "lines = [] if scenario == 'scan' else ['Workflow name: Fictional Azure SRE enrichment', 'Summary: Enrich the same PagerDuty incident for human responders.', 'Target cloud: azure']",
    "if scenario == 'complete': lines = [f'{key}: {value}' for key, value in FACTS.items()] + ['Business domain: Fictional Azure SRE', 'Team size: 51-200', 'Target cloud: azure']",
    "if scenario == 'conflict': lines += ['Steps: 7', 'Steps: 9']",
    "sys.stdout.buffer.write(pdf(lines) if kind == 'pdf' else docx(lines, table=True))",
  ].join("\n");
  return execFileSync("python", ["-c", script, kind, scenario], { cwd: resolve(process.cwd(), ".."),
    env: { ...process.env, AGENTSENSE_MODE: "demo", AGENTSENSE_AUTH_MODE: "local-demo" },
    stdio: ["ignore", "pipe", "pipe"] });
}

async function start(page: Page) {
  await page.goto("/workspace");
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await expect(page.getByLabel("Assessment model", { exact: true })).toHaveValue("demo");
}

async function upload(page: Page, kind: "pdf" | "docx", scenario: "partial" | "complete" | "conflict" | "scan") {
  const buffer = fixture(kind, scenario);
  const sent = page.waitForRequest(request => request.url().includes("/intake/document-preview?"));
  await page.getByLabel("Upload a PDF or DOCX", { exact: true }).setInputFiles({
    name: `fictional-${scenario}.${kind}`, mimeType: kind === "pdf" ? "application/pdf" :
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer,
  });
  const request = await sent;
  return new URL(request.url()).searchParams.get("session_id")!;
}

async function acknowledge(page: Page) {
  await page.getByRole("checkbox", { name: /^I reviewed the selected context/ }).check();
  await expect(page.getByRole("button", { name: "Approve context and continue", exact: true })).toBeEnabled();
}

test.afterEach(async ({ page }) => {
  const pointer = await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"));
  if (pointer) {
    const { session } = JSON.parse(pointer);
    expect((await page.request.delete(`/api/v1/sessions/${session}`)).ok()).toBe(true);
  }
});

test("document intake PDF review preserves unknowns, requires approval and asks only missing facts", async ({ page }) => {
  await start(page);
  const session = await upload(page, "pdf", "partial");
  await expect(page.getByRole("heading", { name: "Review: fictional-partial.pdf", exact: true })).toBeVisible();
  expect((await page.request.get(`/api/v1/sessions/${session}`)).status()).toBe(404);
  await expect(page.getByRole("combobox", { name: /^Team Size/ })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: /^Compliance Requirements/ })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Approve context and continue", exact: true })).toBeDisabled();
  await expect(page.getByText("Page 1 / exact redacted source excerpt").first()).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review: fictional-partial.pdf", exact: true })).toBeVisible();
  await acknowledge(page);
  await page.getByRole("button", { name: "Approve context and continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const progress = await (await page.request.get(`/api/v1/sessions/${session}/interview`)).json();
  expect(progress.missing_facts).not.toContain("workflow_name");
  expect(progress.missing_facts).not.toContain("summary");
  expect(progress.missing_facts).toContain("steps");
  const saved = await (await page.request.get(`/api/v1/sessions/${session}`)).json();
  expect(saved.analysis_id).toBeNull();
  expect(saved.demo_scenario).toBeNull();
  expect(saved.document_intake.verification).toBe("human_reviewed_unverified");
});

test("document intake full-width layout and Select file button work on desktop and mobile", async ({ page }) => {
  await start(page);
  const documentCard = page.locator(".surface-card").filter({
    has: page.getByRole("heading", { name: "Start from a document", exact: true }),
  });
  const workflowCard = page.locator(".surface-card").filter({
    has: page.getByRole("heading", { name: "Workflow details", exact: true }),
  });
  for (const width of [1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 956 });
    const documentBox = await documentCard.boundingBox();
    const workflowBox = await workflowCard.boundingBox();
    const domainBox = await page.getByRole("textbox", { name: "Business Domain", exact: true }).boundingBox();
    if (!documentBox || !workflowBox || !domainBox) throw new Error("Intake layout is not visible.");
    expect(Math.abs(documentBox.x - workflowBox.x)).toBeLessThan(1);
    expect(Math.abs(documentBox.width - workflowBox.width)).toBeLessThan(1);
    expect(workflowBox.y).toBeGreaterThanOrEqual(documentBox.y + documentBox.height + 20);
    if (width >= 1280) expect(domainBox.width).toBeGreaterThanOrEqual(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const buffer = fixture("pdf", "partial");
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Select file", exact: true }).click();
  await (await choosing).setFiles({ name: "fictional-layout.pdf", mimeType: "application/pdf", buffer });
  await expect(page.getByRole("heading", { name: "Review: fictional-layout.pdf", exact: true })).toBeVisible();
  await expect(page.getByText("fictional-layout.pdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve context and continue", exact: true })).toBeDisabled();
});

test("document intake DOCX tables continue once to blueprint and retain unverified readiness on mobile", async ({ page }) => {
  await start(page);
  let analyses = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/analyze/")) analyses += 1; });
  const session = await upload(page, "docx", "complete");
  await expect(page.getByRole("heading", { name: "Review: fictional-complete.docx", exact: true })).toBeVisible();
  await expect(page.getByText("Table 1, row 1 / exact redacted source excerpt")).toBeVisible();
  for (const width of [320, 390, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 956 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await acknowledge(page);
  await watchProcessing(page, "/analyze/");
  await page.getByRole("button", { name: "Approve context and continue", exact: true }).click();
  const result = await processingResult(page);
  expect(result.diagnosis.missing_facts).toEqual([]);
  expect(result.score).not.toBeNull();
  await expect(page.getByRole("heading", { name: /Blueprint/ }).first()).toBeVisible();
  expect(analyses).toBe(1);
  expect(result.readiness_report.decision).not.toBe("ready");
  expect(result.diagnosis.evidence.steps.source).toBe("document");
  expect(result.diagnosis.evidence.steps.reference).toContain("Table 1");
  const snapshot = await (await page.request.get(`/api/v1/sessions/${session}`)).json();
  expect(snapshot.human_review).toBeNull();
  await expect(page.getByRole("region", { name: "Processing activity" })).toContainText("Complete");
  await page.getByText("Completed activity", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Processing activity" })).toContainText("Generating the advisory blueprint");
});

test("document intake conflicts require selection, edits require fresh acknowledgement and counts remain unverified", async ({ page }) => {
  await start(page);
  const session = await upload(page, "docx", "conflict");
  await expect(page.getByText("Conflicting values were found.", { exact: false })).toBeVisible();
  const stepProposals = page.getByRole("checkbox", { name: /^Use Steps proposal/ });
  await expect(stepProposals).toHaveCount(2);
  await expect(stepProposals.first()).not.toBeChecked();
  await expect(stepProposals.last()).not.toBeChecked();
  await stepProposals.first().check();
  const count = page.getByRole("textbox", { name: "Reviewed Steps", exact: true }).first();
  await count.fill("8");
  await acknowledge(page);
  await page.getByRole("textbox", { name: "Reviewed Summary", exact: true }).fill("An explicitly human-edited fictional summary");
  await expect(page.getByRole("button", { name: "Approve context and continue", exact: true })).toBeDisabled();
  await acknowledge(page);
  await page.getByRole("button", { name: "Approve context and continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const saved = await (await page.request.get(`/api/v1/sessions/${session}`)).json();
  expect(saved.interview_answers.steps).toBe("8");
  expect(saved.document_intake.fields.find((field: { field_id: string }) => field.field_id === "fact.steps").edited).toBe(true);
});

test("document intake scanned PDF and interrupted processing show actionable errors without saved success", async ({ page }) => {
  await start(page);
  const session = await upload(page, "pdf", "scan");
  await expect(page.getByText(/No searchable text was found/).first()).toBeVisible();
  expect((await page.request.get(`/api/v1/sessions/${session}`)).status()).toBe(404);
  await expect(page.getByRole("region", { name: "Processing activity" })).toContainText("Failed");
  await page.route("**/api/v1/intake/document-preview?*", route => route.fulfill({
    contentType: "application/x-ndjson",
    body: '{"kind":"stage","label":"Reading PDF text"}\n{"kind":"activity","active":true}\n',
  }));
  await upload(page, "pdf", "partial");
  await expect(page.getByText(/Processing was interrupted/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Processing activity" })).toContainText("Failed");
  await expect(page.getByRole("heading", { name: "Review: fictional-partial.pdf", exact: true })).toHaveCount(0);
});

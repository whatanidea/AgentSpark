import { expect, test, type Page } from "@playwright/test";

let disposableEngagement = "";
test.afterEach(async ({ request }) => {
  if (!disposableEngagement) return;
  const current = await request.get(`/api/v1/engagements/${disposableEngagement}`);
  if (current.ok()) {
    const version = encodeURIComponent((await current.json()).version);
    expect((await request.delete(`/api/v1/engagements/${disposableEngagement}?version=${version}`)).ok()).toBe(true);
  }
  disposableEngagement = "";
});

async function intake(page: Page, fixture = false) {
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  if (fixture) await page.getByRole("button", { name: "🧾 Invoice Approval (Finance)", exact: true }).click();
  else await page.getByLabel("Business Domain", { exact: true }).fill("Fictional discovery");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  return pointer.session as string;
}

test("discovery starts before intake, persists notes and recovers from stale saves without changing assessments", async ({ page }) => {
  let id = "";
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
    await page.getByRole("button", { name: "New discovery engagement", exact: true }).click();
    for (const [label, value] of Object.entries({
      "Engagement title": "Fictional Finance discovery", "Business objective": "Find manual bottlenecks",
      "Business units in scope": "Finance", Sponsor: "Fictional CFO", "Engagement owner": "Fictional lead",
    })) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Add contribution note", exact: true }).click();
    await page.getByLabel("Contribution statement", { exact: true }).fill("Fictional manual review delays.");
    await page.getByRole("button", { name: "Add candidate opportunity", exact: true }).click();
    await page.getByLabel("Opportunity title", { exact: true }).fill("Invoice review");
    await page.getByLabel("Opportunity problem", { exact: true }).fill("Fictional duplicate checks.");
    const creating = page.waitForResponse(r => r.url().endsWith("/engagements") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Save discovery engagement", exact: true }).click();
    const response = await creating;
    expect(response.ok()).toBe(true);
    const created = await response.json();
    id = created.id;
    await expect(page.getByRole("status").filter({ hasText: "Discovery saved." })).toBeVisible();
    await expect(page.getByText("Saved progress:", { exact: false })).toContainText("1 notes / 1 opportunities / 0 available assessments");
    await expect(page.getByText("Discovery notes are visible", { exact: false })).toContainText("not anonymous");
    const updated = await page.request.put(`/api/v1/engagements/${id}`, {
      data: { version: created.version, engagement: { ...created.engagement, status: "active" } },
    });
    expect(updated.ok()).toBe(true);
    await page.getByRole("textbox", { name: "Engagement title", exact: true }).fill("Unsaved stale proposal");
    await page.getByRole("button", { name: "Save discovery engagement", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("409");
    await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("Unsaved stale proposal");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("active");
    await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("Fictional Finance discovery");
    await page.reload();
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
    await page.getByRole("button", { name: "Fictional Finance discovery", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Contribution statement", exact: true })).toHaveValue("Fictional manual review delays.");
    await page.getByRole("button", { name: "Delete engagement", exact: true }).click();
    await page.getByRole("button", { name: "Confirm engagement deletion", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Linked assessments were not deleted." })).toBeVisible();
    id = "";
  } finally {
    disposableEngagement = id;
  }
});

test("business interview defers technical questions and restores explicit unconfirmed answers", async ({ page }) => {
  const session = await intake(page);
  try {
    await page.getByRole("combobox", { name: "Interview role", exact: true }).selectOption("business_operator");
    await expect(page.getByText("questions outstanding for this role.", { exact: false })).toBeVisible();
    await page.getByRole("textbox", { name: "Describe your workflow", exact: true }).fill("Unconfirmed");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Interview rounds: 1 / 10", { exact: true })).toBeVisible();
    const progress = await (await page.request.get(`/api/v1/sessions/${session}/interview`)).json();
    expect(progress.unconfirmed_fields).toContain("fact.workflow_name");
    expect(progress.missing_facts).toContain("workflow_name");
    expect(progress.deferred_fields).toContain("context.preferred_region");
    await expect(page.getByRole("button", { name: "Run Analysis →", exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Interview role", exact: true })).toHaveValue("business_operator");
    await page.getByRole("button", { name: "Review answers / complete checklist", exact: true }).click();
    await expect(page.getByLabel("Workflow name unconfirmed", { exact: true })).toBeChecked();
    await expect(page.getByText("Deployment preferences", { exact: true })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Interview role", exact: true }).selectOption("technical_owner");
    await expect(page.getByText("Deployment preferences", { exact: true })).toBeVisible();
  } finally {
    expect((await page.request.delete(`/api/v1/sessions/${session}`)).ok()).toBe(true);
  }
});

test("executive brief keeps provenance in UI and exports and blocks a stale summary", async ({ page }) => {
  const session = await intake(page, true);
  try {
    await page.getByRole("button", { name: "3 · Workflow Analysis", exact: true }).click();
    await page.getByRole("button", { name: "▶ Run Multi-Agent Analysis", exact: true }).click();
    const card = page.locator(".surface-card").filter({
      has: page.getByRole("heading", { name: "Executive decision brief", exact: true }),
    });
    await expect(card).toContainText("Investigate further before authorizing a pilot");
    await expect(card).toContainText("not realized cash savings");
    await card.getByText("Risks, gaps and source evidence", { exact: true }).click();
    await expect(card).toContainText("roi.assumptions");
    const downloading = page.waitForEvent("download");
    await card.getByRole("button", { name: "Export brief Markdown", exact: true }).click();
    const stream = await (await downloading).createReadStream();
    if (!stream) throw new Error("Brief Markdown stream unavailable");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const markdown = Buffer.concat(chunks).toString("utf8");
    expect(markdown).toContain("### Sources and assumptions");
    expect(markdown).toContain("not realized cash savings");
    const pdfDownload = page.waitForEvent("download");
    await card.getByRole("button", { name: "Export one-page brief PDF", exact: true }).click();
    expect((await pdfDownload).suggestedFilename()).toBe("AgentSpark_Executive_Brief.pdf");
    await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
    await expect(card).toContainText("Investigate further before authorizing a pilot");
    const progress = await (await page.request.get(`/api/v1/sessions/${session}/interview`)).json();
    expect((await page.request.put(`/api/v1/sessions/${session}/interview`, {
      data: { version: progress.version, answers: { "fact.steps": "9" } },
    })).ok()).toBe(true);
    await card.getByRole("button", { name: "Export one-page brief PDF", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText("Executive brief changed");
  } finally {
    expect((await page.request.delete(`/api/v1/sessions/${session}`)).ok()).toBe(true);
  }
});

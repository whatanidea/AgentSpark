import { expect, test, type Page } from "@playwright/test";

async function intake(page: Page, sample?: string) {
  await page.goto("/");
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
    const { session } = JSON.parse(pointer);
    const response = await page.request.delete(`/api/v1/sessions/${session}`);
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
  expect(download.suggestedFilename()).toBe("AgentSense_Blueprint.md");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Markdown export stream is unavailable");
  let markdown = "";
  for await (const chunk of stream) markdown += chunk.toString("utf8");
  for (const text of ["demo_fixture", "conservative", "optimistic", "SHA256", "not deployment-ready"]) {
    expect(markdown).toContain(text);
  }
  expect(markdown).not.toContain("PROVISIONAL: NOT APPROVED");
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
  await page.getByRole("button", { name: "Delete workflow", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Confirm workflow deletion" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete workflow", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enterprise Context", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

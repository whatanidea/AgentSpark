import { expect, test, type Page } from "@playwright/test";

async function intake(page: Page, sample?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
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
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
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
  await expect(page.getByText("Fictional review: require manual controls.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete workflow & history", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm workflow and archive deletion", exact: true });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Fictional review: require manual controls.", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("alert")).toContainText("Workflow library temporarily unavailable.");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No workflows in this view", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("team workspace restores its scope, prevents self-review and stays separate from personal Home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
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
  await page.getByRole("button", { name: "Use Browser finance", exact: true }).click();
  await page.getByRole("button", { name: "Open Invoice Approval Pending review", exact: true }).click();
  await expect(page.getByText("Your identity cannot review this workflow.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Delete workflow", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Invoice Approval Pending review", exact: true })).toHaveCount(0);
});

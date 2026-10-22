import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function intake(page: Page, sample?: string, cloud = "azure") {
  await page.goto("/");
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
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

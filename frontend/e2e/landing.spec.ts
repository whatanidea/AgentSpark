import { expect, test } from "@playwright/test";

test("public examples explain workflow boundaries without authentication, writes or readiness probes", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") || request.url().endsWith("/ready"))
      calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find where AI agents fit. Before you build.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  const picker = page.getByRole("group", { name: "Example workflow", exact: true });
  await picker.getByRole("button", { name: "Invoice processing", exact: true }).click();
  await page.getByRole("button", { name: "Step 4: Authorize payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Authorize payment", exact: true })).toBeVisible();
  await expect(page.getByText("Finance approves exceptions and payment release.", { exact: false })).toBeVisible();
  await picker.getByRole("button", { name: "Employee onboarding", exact: true }).click();
  await page.getByRole("button", { name: "Step 4: Approve access", exact: true }).click();
  await expect(page.getByText("Authorized managers approve access.", { exact: false })).toBeVisible();
  expect(calls.filter(call => !call.startsWith("GET /api/v1/auth/config"))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Organization access", exact: true })).toBeVisible();
  await expect(page.getByLabel("Access token", { exact: true })).toBeVisible();
});

test("deliverables follow the selected workflow and expose cloud and capacity assumptions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Example workflow" }).getByRole("button", { name: "Invoice processing", exact: true }).click();
  await page.getByRole("button", { name: "Step 2: Extract the details", exact: true }).click();
  const previews = page.getByRole("group", { name: "Deliverable preview", exact: true });
  await previews.getByRole("button", { name: "Readiness", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Test accuracy across invoice layouts, currencies and languages.", exact: true })).toBeVisible();
  await expect(page.getByText("Owner: Unassigned · Evidence: Not supplied", { exact: true })).toBeVisible();
  await previews.getByRole("button", { name: "Blueprint", exact: false }).click();
  await expect(page.locator(".landing-cloud-diagram")).toContainText("Azure AI Document Intelligence");
  await page.getByRole("group", { name: "Example target cloud", exact: true }).getByRole("button", { name: "AWS", exact: true }).click();
  await expect(page.locator(".landing-cloud-diagram")).toContainText("Amazon Textract");
  await expect(page.getByText("AgentSpark itself remains Azure-hosted.", { exact: false })).toBeVisible();
  await previews.getByRole("button", { name: "Business case", exact: false }).click();
  await expect(page.getByText("$44,000", { exact: true })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Illustrative workflows per day", exact: false });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("110");
  await expect(page.getByText("$48,400", { exact: true })).toBeVisible();
  await expect(page.getByText("Excludes delivery costs, adoption and operating costs", { exact: false })).toBeVisible();
  await previews.getByRole("button", { name: "Suitability", exact: false }).click();
  await expect(page.getByText("No score is calculated in this preview.", { exact: false })).toBeVisible();
  await expect(page.getByRole("article", { name: "Illustrative report cover" })).toContainText("Invoice processing");
});

test("landing supports keyboard operation, narrow viewports and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
  const example = page.getByRole("group", { name: "Example workflow" }).getByRole("button", { name: "Employee onboarding", exact: true });
  expect((await example.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await example.focus();
  await page.keyboard.press("Enter");
  await expect(example).toHaveAttribute("aria-pressed", "true");
  const step = page.getByRole("button", { name: "Step 4: Approve access", exact: true });
  await step.focus();
  await page.keyboard.press("Space");
  await expect(step).toHaveAttribute("aria-pressed", "true");
  await expect(step).toHaveCSS("transition-duration", "0s");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("workspace entry and returning to overview preserve the active assessment", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional landing regression");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("aws");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  try {
    await page.getByRole("button", { name: "Product overview", exact: false }).click();
    await expect(page.getByRole("heading", { name: "Find where AI agents fit. Before you build.", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open your workspace", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!).session).toBe(pointer.session);
    await page.getByRole("button", { name: "2 · Diagnostic Interview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("agentsense.session.v1")!).view)).toBe("diagnose");
    await page.reload();
    await expect(page.getByText("Workflow restored from the server.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
    await expect(page.getByText("Assessment target:", { exact: false })).toContainText("AWS");
  } finally {
    const removed = await page.request.delete(`/api/v1/sessions/${pointer.session}`);
    expect([200, 404]).toContain(removed.status());
  }
});

test("public workspace sign-in retains the destination and displays access errors", async ({ page }) => {
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({
    status: 401, json: { detail: "Fictional access denied." },
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organization access", exact: true })).toBeVisible();
  await page.getByLabel("Access token", { exact: true }).fill("fictional-invalid-token");
  await page.getByRole("button", { name: "Connect securely", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fictional access denied." })).toBeVisible();
  expect(await page.evaluate(() => Object.values(sessionStorage).some(value => String(value).includes("fictional-invalid-token")))).toBe(false);
  await page.getByRole("button", { name: "Product overview", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Find where AI agents fit. Before you build.", exact: true })).toBeVisible();
});

test("signing in from the assessment action opens intake without creating a workflow", async ({ page }) => {
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: {
    identity: "fictional-browser-identity", can_review: false,
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await page.getByLabel("Access token", { exact: true }).fill("fictional-browser-token");
  await page.getByRole("button", { name: "Connect securely", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enterprise Context", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Find where AI agents fit. Before you build.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

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
  await expect(page.getByRole("heading", { name: "Decide what to automate. Know where AI belongs.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByRole("group", { name: "Example workflow", exact: true })).toHaveCount(0);
  await page.goto("/platform/discovery");
  const showcase = page.getByRole("article", { name: "Illustrative discovery walkthrough" });
  await expect(showcase).toContainText("3 role contributions");
  await showcase.getByRole("button", { name: "02 Synthesize", exact: true }).click();
  await expect(showcase).toContainText("Sources: S1, S2");
  await expect(showcase).toContainText("Who owns exception decisions?");
  await showcase.getByRole("button", { name: "03 Prioritize", exact: true }).click();
  await expect(showcase).toContainText("80/100");
  await expect(showcase).toContainText("Not ranked");
  await showcase.getByText("See the illustrative rating assumptions", { exact: true }).click();
  await expect(showcase).toContainText("risk 2 (15%)");
  await expect(showcase).toContainText("not measured savings or verified confidence");
  await showcase.getByRole("button", { name: "04 Assess", exact: true }).click();
  await expect(showcase).toContainText("14 workflow facts still need confirmation");
  await expect(showcase).toContainText("not pilot readiness");
  await page.goto("/resources/example-assessment");
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
  await page.goto("/resources/example-assessment");
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
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeAttached();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
  await page.goto("/resources/example-assessment");
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
    await expect(page.getByRole("heading", { name: "Decide what to automate. Know where AI belongs.", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start discovery", exact: false }).first().click();
    await expect(page.getByRole("heading", { name: "Discovery engagements", exact: true })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!).session).toBe(pointer.session);
    await page.getByRole("button", { name: "Product overview", exact: false }).click();
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
  await expect(page.getByRole("heading", { name: "Decide what to automate. Know where AI belongs.", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Decide what to automate. Know where AI belongs.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("desktop dropdowns support keyboard dismissal, outside close and substantive destinations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  const platform = nav.getByRole("button", { name: "Platform", exact: true });
  await platform.focus(); await page.keyboard.press("Enter");
  await expect(platform).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: "Discovery & stakeholder input", exact: false })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(platform).toBeFocused();
  await expect(platform).toHaveAttribute("aria-expanded", "false");
  await platform.click();
  await nav.getByRole("button", { name: "Solutions", exact: true }).click();
  await expect(platform).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(nav.getByRole("button", { name: "Solutions", exact: true })).toHaveAttribute("aria-expanded", "false");
  for (const name of ["Platform", "Solutions", "Resources"]) {
    await nav.getByRole("button", { name, exact: true }).click();
    const links = nav.locator(".marketing-dropdown:visible a");
    for (const link of await links.all()) {
      const href = (await link.getAttribute("href"))!;
      expect(href).toMatch(/^\/(platform|solutions|resources)\/[a-z-]+$/);
      const response = await page.request.get(href);
      expect(response.status()).toBe(200);
    }
    await page.keyboard.press("Escape");
  }
  await nav.getByRole("button", { name: "Resources", exact: true }).click();
  await nav.getByRole("link", { name: "Trust & limitations", exact: false }).click();
  await expect(page).toHaveURL(/\/resources\/trust$/);
  await expect(page.getByRole("heading", { name: "Know what is supported. Know what is still unknown.", exact: true })).toBeVisible();
});

test("mobile navigation remains usable at 320px and closes after destination selection", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  await expect(nav).toBeHidden();
  await toggle.click();
  await nav.getByRole("button", { name: "Solutions", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await nav.getByRole("link", { name: "Finance & operations", exact: false }).click();
  await expect(page).toHaveURL(/\/solutions\/operations$/);
  await expect(nav).toBeHidden();
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(nav).toBeHidden();
  await page.goto("/platform/discovery");
  const stages = page.getByRole("group", { name: "Discovery preview stage" });
  for (const button of await stages.getByRole("button").all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("discovery sign-in retries retain the destination and the restored assessment without writes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional discovery entry regression");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("aws");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  try {
    await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
      mode: "oidc", retention_hours: 24, archive_retention_days: 30,
    } }));
    let attempts = 0;
    await page.route("**/api/v1/auth/me", route => {
      attempts++;
      return route.fulfill(attempts === 1 ? { status: 401, json: { detail: "Fictional retry required." } }
        : { json: { identity: pointer.identity, can_review: false } });
    });
    const writes: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.goto("/platform/discovery");
    await page.getByRole("button", { name: "Start discovery", exact: false }).first().click();
    await page.getByLabel("Access token", { exact: true }).fill("fictional-retry-token");
    await page.getByRole("button", { name: "Connect securely", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Fictional retry required." })).toBeVisible();
    await page.getByLabel("Access token", { exact: true }).fill("fictional-retry-token");
    await page.getByRole("button", { name: "Connect securely", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Discovery engagements", exact: true })).toBeVisible();
    await expect(page.getByText("Workflow restored from the server.", { exact: true })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!).session).toBe(pointer.session);
    expect(writes).toEqual([]);
    await page.getByRole("button", { name: "2 · Diagnostic Interview", exact: true }).click();
    await expect(page.getByText("Assessment target:", { exact: false })).toContainText("AWS");
  } finally {
    const removed = await page.request.delete(`/api/v1/sessions/${pointer.session}`);
    expect([200, 404]).toContain(removed.status());
  }
});

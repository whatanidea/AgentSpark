import { expect, test } from "@playwright/test";

test("public feature refresh surfaces shipped capabilities and connects them to dedicated pages", async ({ page }) => {
  await page.goto("/");
  const features = page.getByRole("region", { name: "Align the people. Connect the decisions.", exact: true });
  const cards = features.locator(".public-capability-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("h3")).toHaveText([
    "Stakeholder alignment & decisions", "Assessment & executive decisions",
    "Architecture & review", "Organizations & team workspaces",
  ]);
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute("href", /^\/platform\//);
    expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await features.locator('a[href="/platform/workspaces"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page).toHaveURL(/\/platform\/workspaces$/);
  const workspace = page.getByRole("figure", { name: "Fictional Home workspace filter" });
  await expect(workspace).toContainText("Workspace organization");
  await expect(workspace).toContainText("Workspace team");
  await expect(workspace).toContainText("Switching scope does not move records");
  await expect(page.getByText("Selecting an organization loads its teams", { exact: false })).toBeVisible();
});

test("public feature refresh previews alignment and outcome-led decisions without calls, writes or autoplay", async ({ page }) => {
  const calls: string[] = [];
  const external: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.pathname === "/ready") calls.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== "http://127.0.0.1:8767") external.push(url.origin);
  });
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  await page.goto("/platform");
  const tabs = page.getByRole("tablist", { name: "Product walkthrough stages" });
  await expect(tabs.getByRole("tab")).toHaveCount(5);
  await tabs.getByRole("tab", { name: /Align/ }).focus();
  await page.keyboard.press("Enter");
  const alignment = page.getByRole("tabpanel", { name: /Align/ });
  await expect(alignment).toContainText("Supports with conditions");
  await expect(alignment).toContainText("No current position");
  await expect(alignment).toContainText("Acceptance pending");
  await expect(alignment).toContainText("No consensus is assumed");
  await page.clock.install();
  await page.clock.fastForward(60000);
  await expect(tabs.getByRole("tab", { name: /Align/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  const decision = page.getByRole("tabpanel", { name: /Decide/ });
  await expect(decision).toContainText("Investigate further.");
  await expect(decision).toContainText("Baseline and integration access");
  await expect(decision).toContainText("Finance retains payment approval");
  await expect(decision).toContainText("No measured savings or pilot authorization");
  expect(calls.filter(call => call !== "GET /api/v1/auth/config")).toEqual([]);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("public feature refresh provides solution and resource collections with real internal destinations", async ({ page }) => {
  await page.goto("/solutions");
  const solutions = page.getByRole("region", { name: "Solutions directory" });
  await expect(solutions.getByRole("link")).toHaveCount(3);
  await solutions.locator('a[href="/solutions/operations"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  const story = page.getByRole("region", { name: "An invoice exception review", exact: true });
  await expect(story).toContainText("THE STARTING QUESTION");
  await expect(story).toContainText("THE REVIEWABLE OUTPUT");
  await expect(story.getByRole("listitem")).toHaveCount(3);
  await story.getByRole("link", { name: "Prepare your decision review", exact: false }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Five questions before the next commitment.");
  await expect(page.locator(".marketing-capabilities article")).toHaveCount(5);
  await page.goto("/resources");
  const resources = page.getByRole("region", { name: "Resources directory" });
  await expect(resources.getByRole("link")).toHaveCount(5);
  await expect(resources).toContainText("Interactive example");
  for (const link of await resources.getByRole("link").all()) {
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/resources\/[a-z-]+$/);
    expect((await page.request.get(href!)).status()).toBe(200);
  }
  await resources.locator('a[href="/resources/how-it-works"]').click();
  await expect(page.getByRole("figure", { name: "The AgentSpark evaluation path" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("tablist", { name: "Product walkthrough stages" }).getByRole("tab")).toHaveCount(5);
  await page.goBack();
  await expect(resources).toBeVisible();
  await resources.locator('a[href="/resources/whats-new"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A clearer path from discovery to decision.");
  await expect(page.locator(".public-capability-card")).toHaveCount(4);
  await expect(page.locator("#top").getByText("Available features, not a roadmap.", { exact: false })).toBeVisible();
  await page.goto("/resources/example-assessment");
  await expect(page.getByRole("article", { name: "Illustrative report cover" }).getByRole("listitem")).toHaveText([
    "01Executive decision & next action", "02Evidence & assumptions", "03Readiness & human boundaries",
    "04Optional business value", "05Visual blueprint & review",
  ]);
});

test("public feature refresh visual proofs and collections fit narrow screens and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/platform", "/platform/alignment", "/platform/assessment", "/platform/architecture", "/platform/workspaces", "/solutions", "/solutions/advisory", "/resources"]) {
    await page.goto(path);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 956 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(true);
      await expect(page.locator(".premium-page-visual")).toBeVisible();
    }
    expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
  }
  await page.goto("/platform/architecture");
  const flow = page.getByRole("list", { name: "Proposed invoice assistance architecture" });
  await expect(flow.getByRole("listitem")).toHaveCount(4);
  await expect(flow).toContainText("State · bounded retries");
  await expect(flow).toContainText("Authorized finance review");
  await expect(page.locator(".proof-blueprint")).toContainText("implementation and validation");
});

test("public feature refresh explains alignment, workspace scope and inactivity limitations honestly", async ({ page }) => {
  await page.goto("/resources/trust");
  const trust = page.locator("#trust");
  await trust.locator("summary").filter({ hasText: "Alignment is explicit, not inferred" }).click();
  await expect(trust).toContainText("Missing replies do not establish agreement");
  await trust.locator("summary").filter({ hasText: "Workspace access remains scoped" }).click();
  await expect(trust).toContainText("does not move records or grant membership");
  await trust.locator("summary").filter({ hasText: "Inactive tabs normally sign out after five minutes" }).click();
  await expect(trust).toContainText("potentially indefinitely for drafts");
  await expect(trust).toContainText("not global Microsoft logout or bearer-token revocation");
});

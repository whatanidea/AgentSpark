import { expect, test } from "@playwright/test";

const offers = [
  ["/consulting/readiness", "AI Opportunity & Readiness", "A roadmap is advisory."],
  ["/consulting/workspace-launch", "Secure AI Workspace Launch", "Never submit passwords or API keys"],
  ["/consulting/workflow-pilot", "Workflow Pilot & Implementation", "A pilot is not a production service."],
  ["/consulting/adoption", "AI Adoption & Optimization", "Retainers have defined capacity"],
] as const;

test("consulting is integrated without vendor or funding claims and scheduling remains opt-in", async ({ page }) => {
  const apiCalls: string[] = [];
  const schedulerRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") || request.url().endsWith("/ready"))
      apiCalls.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (/https:\/\/([^/]+\.)?(cal\.com|calendly\.com)\//.test(request.url()))
      schedulerRequests.push(request.url());
  });
  await page.goto("/");
  const home = page.getByRole("region", { name: "A deliberate journey. Not another AI experiment.", exact: true });
  await expect(home.getByRole("article")).toHaveCount(4);
  for (const [path] of offers) await expect(home.locator(`a[href="${path}"]`)).toBeVisible();
  await page.getByRole("link", { name: "Explore consulting", exact: false }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  const providers = page.getByRole("region", { name: "Choose for the work. Not for the logo.", exact: true });
  await expect(providers.getByRole("article")).toHaveCount(3);
  await expect(providers).toContainText("not a partner or reseller claim");
  await expect(providers).toContainText("Customer-owned accounts");
  await expect(providers).toContainText("No provider is connected");
  for (const link of await providers.getByRole("link").all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  await expect(page.getByRole("region", { name: "Consulting and software. Complementary, not interchangeable.", exact: true }))
    .toContainText("not Google Cloud generation");
  const diligence = page.getByRole("region", { name: "Ambition, with an evidence trail.", exact: true });
  await expect(diligence).toContainText("No blanket GDPR or AI Act certification is claimed");
  await expect(diligence).toContainText("Estimates remain estimates");
  await expect(page.getByRole("link", { name: "Book a consultation", exact: false }).first()).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(schedulerRequests).toEqual([]);
  expect(apiCalls.filter(call => !["GET /api/v1/auth/config", "GET /api/v1/auth/me"].includes(call))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("each offer exposes its scope, outputs, method, related services and real protected action", async ({ page }) => {
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.method());
  });
  for (const [path, name, boundary] of offers) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${name} | AgentSpark`);
    await expect(page.locator(".consulting-deliverables li")).toHaveCount(4);
    await expect(page.locator(".consulting-deliverables")).toContainText(boundary);
    await expect(page.locator(".consulting-method li")).toHaveCount(4);
    await expect(page.getByRole("navigation", { name: "Other consulting offerings" }).getByRole("link")).toHaveCount(3);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Consulting", exact: true }))
      .toHaveAttribute("href", "/consulting");
    await page.getByRole("button", { name: "Start in the platform", exact: false }).first().click();
    await expect(page.getByRole("heading", { name: "Organization access", exact: true })).toBeVisible();
  }
  expect(writes).toEqual([]);
});

test("consulting mega-menu is keyboard accessible, active on overview and closes on history navigation", async ({ page }) => {
  await page.goto("/consulting");
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  const consulting = nav.getByRole("button", { name: "Consulting", exact: true });
  await expect(consulting).toHaveAttribute("data-active", "true");
  await consulting.focus(); await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: "Find a starting point", exact: false })).toBeFocused();
  await expect(nav.locator(".marketing-dropdown:visible").getByRole("link")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(consulting).toBeFocused();
  await expect(consulting).toHaveAttribute("aria-expanded", "false");
  await consulting.click();
  await nav.getByRole("link", { name: "Test one improvement", exact: false }).click();
  await expect(page).toHaveURL(/\/consulting\/workflow-pilot$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(consulting).toHaveAttribute("aria-expanded", "false");
  await consulting.click();
  await expect(nav.getByRole("link", { name: "Test one improvement", exact: false })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/consulting$/);
  await expect(consulting).toHaveAttribute("aria-expanded", "false");
});

test("consulting pages and menu fit narrow through desktop viewports without hiding content or motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/consulting", ...offers.map(([path]) => path)]) {
    await page.goto(path);
    for (const width of [320, 390, 768, 981, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
      if (width > 980) {
        const nav = page.getByRole("navigation", { name: "Product navigation" });
        await nav.getByRole("button", { name: "Consulting", exact: true }).click();
        const box = (await nav.locator(".marketing-dropdown:visible").boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/consulting");
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  await nav.getByRole("button", { name: "Consulting", exact: true }).click();
  for (const link of await nav.locator(".marketing-dropdown:visible a").all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await nav.getByRole("link", { name: "Support your team", exact: false }).click();
  await expect(page).toHaveURL(/\/consulting\/adoption$/);
  await expect(nav).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

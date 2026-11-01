import { expect, test } from "@playwright/test";

test("signature, product stages and technology boundaries explain real capabilities without marketing API writes", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") || request.url().endsWith("/ready"))
      calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto("/");
  const hero = page.getByRole("figure", { name: "Fictional invoice opportunity, from process friction to a reviewed next step" });
  await expect(hero).toContainText("Reported friction");
  await expect(hero).toContainText("Source S1");
  await expect(hero).toContainText("Human review required");
  await page.getByRole("link", { name: "Explore the product", exact: false }).click();
  const showcase = page.getByRole("region", { name: "See the work. Then decide what changes.", exact: true });
  await expect(showcase.getByRole("tabpanel", { name: /Discover/ })).toContainText("Clarification needed");
  for (const name of ["Prioritize", "Prepare", "Decide"]) {
    await showcase.getByRole("tab", { name: new RegExp(name) }).click();
    await expect(showcase.getByRole("tabpanel", { name: new RegExp(name) })).toBeVisible();
    await expect(showcase).toContainText("fictional and unverified");
  }
  await expect(showcase).toContainText("Customer implementation and authorization remain separate");
  const technology = page.getByRole("region", { name: "Your decisions first. The stack follows.", exact: true });
  await expect(technology.getByRole("article")).toHaveCount(3);
  await expect(technology).toContainText("Not connected integrations");
  await expect(technology.getByLabel("Proposed target cloud options")).toHaveText("AzureAWS");
  expect(calls.filter(call => !["GET /api/v1/auth/config", "GET /api/v1/auth/me"].includes(call))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("product tabs expose consistent ARIA relationships and full keyboard navigation", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Product walkthrough stages" });
  await tabs.getByRole("tab", { name: /Discover/ }).focus();
  for (const [key, name] of [["ArrowRight", "Prioritize"], ["End", "Decide"], ["ArrowRight", "Discover"], ["ArrowLeft", "Decide"], ["Home", "Discover"]]) {
    await page.keyboard.press(key);
    const tab = tabs.getByRole("tab", { name: new RegExp(name) });
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toHaveAttribute("tabindex", "0");
    const controls = await tab.getAttribute("aria-controls");
    await expect(page.getByRole("tabpanel", { name: new RegExp(name) })).toHaveAttribute("id", controls!);
  }
  await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("End");
  await expect(page.locator(".premium-product-screen")).toHaveCSS("animation-name", "none");
});

test("premium layouts, menus and diagrams fit mobile, tablet and desktop without hiding meaningful content", async ({ page }) => {
  for (const path of ["/", "/platform/discovery", "/platform/prioritization", "/platform/assessment", "/platform/architecture", "/solutions/operations", "/resources/trust"]) {
    await page.goto(path);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(true);
      if (path === "/") {
        for (const tab of await page.getByRole("tab").all())
          expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      } else {
        await expect(page.locator(".premium-page-visual")).toBeVisible();
        await expect(page.locator(".premium-visual-nodes li")).toHaveCount(4);
      }
    }
  }
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  await nav.getByRole("button", { name: "Platform", exact: true }).click();
  const menu = nav.locator(".marketing-dropdown:visible");
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
  await expect(menu.locator(".premium-menu-feature")).toBeVisible();
  await expect(menu.getByRole("link")).toHaveCount(4);
});

test("workflow review opens the protected existing discovery flow without a fake booking or saved inquiry", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.method());
  });
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  await page.goto("/");
  const buyer = page.getByRole("region", { name: "A clearer investment decision. Not another AI promise.", exact: true });
  await expect(buyer).toContainText("not a booked consultation or a promise of follow-up");
  await buyer.getByRole("button", { name: "Start a workflow review", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Organization access", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
  expect(writes).toEqual([]);
});

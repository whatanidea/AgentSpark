import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES } from "../src/components/publicPages";
import { pageMetadata } from "../src/publicMetadata";

test.describe("public HTML without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const entry of PUBLIC_PAGES) {
    test(`public HTML contains the actual ${entry.name} page and metadata`, async ({ page }) => {
      const response = await page.goto(entry.path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("no-store");
      const raw = await response!.text();
      expect(raw).toContain('data-prerendered="true"');
      expect(raw).toContain("<main");
      expect(raw).not.toContain('src="/src/');
      const alias = await page.request.get(entry.path === "/" ? "/index.html" : `${entry.path}/index.html`);
      expect(alias.status()).toBe(200);
      expect(await alias.text()).toContain(`data-page="${entry.path}"`);
      const metadata = pageMetadata(entry);
      await expect(page).toHaveTitle(entry.path === "/"
        ? "AgentSpark | AI Consulting & Assessment for SMEs" : `${entry.name} | AgentSpark`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("h1")).toHaveText(entry.path === "/" ? "Less busywork.Better ways to work." : entry.title);
      expect((await page.locator("main").innerText()).length).toBeGreaterThan(250);
      for (const [key, content] of Object.entries(metadata.meta)) {
        await expect(page.locator(`meta[${key.startsWith("og:") ? "property" : "name"}="${key}"]`))
          .toHaveAttribute("content", content);
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", entry.path);
      await expect(page.locator("body > noscript")).toBeVisible();
      expect(await page.locator("body > noscript").textContent()).toContain("require JavaScript");
      const book = page.getByRole("link", { name: "Book a consultation", exact: true }).first();
      await expect(book).toHaveAttribute("href", "https://cal.com/vienna-now-rdnzte/agentspark-consulting");
      await expect(book).toHaveAttribute("referrerpolicy", "no-referrer");
      const misleadingArrows = await page.locator('a[href^="/"], a[href^="#"], button').evaluateAll(nodes =>
        nodes.filter(node => node.textContent?.includes("↗")).map(node => node.textContent));
      expect(misleadingArrows).toEqual([]);
      const assets = await page.locator('link[rel="stylesheet"], script[src], img[src]').evaluateAll(nodes =>
        nodes.map(node => node.getAttribute(node.tagName === "LINK" ? "href" : "src")!)
          .filter(path => path.startsWith("/")));
      expect(assets.filter(path => path.endsWith(".css")).length).toBeGreaterThanOrEqual(2);
      for (const path of new Set(assets)) expect((await page.request.get(path)).ok(), path).toBe(true);
    });
  }

  test("public HTML links navigate without JavaScript; workspace stays private", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Explore consulting/, exact: false }).first().click();
    await expect(page).toHaveURL("/consulting");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build an AI-native business. One deliberate step at a time.");
    const workspace = await request.get("/workspace");
    expect(workspace.status()).toBe(200);
    expect(workspace.headers()["cache-control"]).toContain("no-store");
    expect(await workspace.text()).toContain('<meta name="robots" content="noindex,nofollow"');
    expect(await workspace.text()).toContain('<div id="root"></div>');
    expect(await workspace.text()).not.toContain("<main");
    expect((await request.get("/api/not-a-real-endpoint")).status()).toBe(404);
    expect((await request.get("/%2e%2e/package.json")).status()).toBe(404);
    expect((await request.get("/assets/missing-file.js")).status()).toBe(404);
  });

  test("public HTML booking and category navigation work without JavaScript or leaking page state", async ({ page }) => {
    const destination = "https://cal.com/vienna-now-rdnzte/agentspark-consulting";
    const requests: { url: string; referrer: string | undefined }[] = [];
    await page.route("https://cal.com/**", async route => {
      requests.push({ url: route.request().url(), referrer: route.request().headers().referer });
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Test booking destination</h1>" });
    });
    await page.goto("/?token=private-test&invite=private-invite#private-workflow");
    const categories = page.getByRole("navigation", { name: "Public navigation without JavaScript" });
    await expect(page.locator("#marketing-navigation")).toBeHidden();
    await expect(page.locator(".marketing-mobile-toggle")).toBeHidden();
    await expect(categories.getByRole("link")).toHaveCount(4);
    await categories.getByRole("link", { name: "Platform", exact: true }).click();
    await expect(page).toHaveURL("/platform");
    await expect(page.getByRole("button", { name: "Start discovery", exact: true })).toBeDisabled();
    expect(await page.locator("body > noscript").textContent()).toContain("assessment tools require JavaScript");
    await page.getByRole("link", { name: "Book a consultation", exact: true }).first().click();
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole("heading", { name: "Test booking destination" })).toBeVisible();
    expect(requests).toEqual([{ url: destination, referrer: undefined }]);
  });

  test("public HTML keeps every public route reachable through initial document links", async ({ request }) => {
    const routes = new Set(PUBLIC_PAGES.map(entry => entry.path));
    const pending = ["/"];
    const reached = new Set<string>();
    while (pending.length) {
      const path = pending.pop()!;
      if (reached.has(path)) continue;
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      reached.add(path);
      for (const match of (await response.text()).matchAll(/href="([^"#?]+)(?:[#?][^"]*)?"/g)) {
        if (routes.has(match[1]) && !reached.has(match[1])) pending.push(match[1]);
      }
    }
    expect([...reached].sort()).toEqual([...routes].sort());
  });
});

test("public HTML conversion story has four concise menus, specific labels and one numbered journey", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  const mobile = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await mobile.isVisible()) await mobile.click();
  await expect(nav.getByRole("button")).toHaveText(["Consulting", "Platform", "Solutions", "Resources"]);
  expect(await nav.locator("a").count()).toBe(15);
  for (const summary of await nav.locator(".premium-menu-links li small").allTextContents()) {
    expect(summary.length).toBeLessThanOrEqual(60);
  }
  await expect(nav.getByRole("link", { name: "About", exact: true })).toHaveCount(0);
  const close = page.getByRole("button", { name: "Close navigation", exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "About", exact: true })).toBeVisible();
  await expect(page.locator("#top").getByRole("link", { name: "Book a consultation", exact: true })).toBeVisible();
  await expect(page.locator(".invitation-copy").getByRole("link", { name: "Book a consultation", exact: true })).toBeVisible();
  await expect(page.locator(".premium-technology")).toHaveCount(0);
  expect(await page.locator("main").textContent()).not.toMatch(/decision-first blueprint|orchestration|deterministic validation|source provenance/i);
  const actions = page.locator(".public-capability-card .public-card-action, .editorial-chapters a");
  const names = await actions.allTextContents();
  expect(names).toHaveLength(8);
  expect(new Set(names).size).toBe(8);
  expect(names.join(" ")).not.toMatch(/See the capability|Explore the offering/);
  await expect(page.locator(".public-capability-card > div > span")).toHaveCount(0);
  await expect(page.locator(".editorial-chapter-number")).toHaveText(["PLAN", "EQUIP", "TEST", "GROW"]);
  const showcase = page.locator("#product-showcase");
  await expect(showcase.locator(".premium-product-tabs small")).toHaveText(["01", "02", "03", "04", "05"]);
  for (const tab of await showcase.getByRole("tab").all()) {
    await tab.click();
    expect((await showcase.textContent())?.match(/fictional/gi)).toHaveLength(1);
    await expect(showcase.getByRole("link", { name: "Trust & limitations", exact: true })).toBeVisible();
  }
});

test("public HTML metadata stays consistent after client navigation and workspace entry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Assess my workflow", exact: true }).first()).toBeEnabled();
  await expect(page).toHaveTitle("AgentSpark | AI Consulting & Assessment for SMEs");
  await expect(page.locator("h1")).toHaveCount(1);
  await page.getByRole("link", { name: /Explore consulting/, exact: false }).first().click();
  await expect(page).toHaveURL("/consulting");
  await expect(page).toHaveTitle("Consulting overview | AgentSpark");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Consulting overview | AgentSpark");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "/consulting");
  await page.goBack();
  await expect(page).toHaveTitle("AgentSpark | AI Consulting & Assessment for SMEs");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await expect(page).toHaveURL("/workspace");
  await expect(page).toHaveTitle("Workspace | AgentSpark");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  expect((await page.goto("/this-page-does-not-exist"))?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | AgentSpark");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  expect(errors).toEqual([]);
});

test("public HTML stays readable during delayed startup and controls work at DOMContentLoaded", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("agentspark.appearance.v1", "light"));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/assets/public-*.js", async route => {
    requested = true;
    await pending;
    await route.continue();
  });
  const navigation = page.goto("/", { waitUntil: "domcontentloaded" });
  try {
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Less busywork.Better ways to work.");
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveTitle("AgentSpark | AI Consulting & Assessment for SMEs");
    await expect(page.getByText("Loading product overview", { exact: false })).toHaveCount(0);
  } finally {
    release();
    await navigation;
  }
  const appearance = page.getByRole("combobox", { name: "Appearance", exact: true });
  await expect(appearance).toHaveValue("light");
  await expect(page.locator(".concept-site")).toHaveCSS("background-color", "rgb(250, 249, 246)");
  await appearance.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("agentspark.appearance.v1"))).toBe("light");
  await page.getByRole("tab", { name: /Align/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel", { name: /Align/ })).toContainText("Supports with conditions");
  await expect(page.locator("h1")).toHaveCount(1);
});

test("public HTML document aliases keep the same content and canonical metadata after enhancement", async ({ page }) => {
  for (const path of ["/", "/platform", "/consulting/readiness"]) {
    const entry = PUBLIC_PAGES.find(candidate => candidate.path === path)!;
    await page.goto(path === "/" ? "/index.html" : `${path}/index.html`);
    await expect(page).toHaveTitle(pageMetadata(entry).title);
    await expect(page.locator(".concept-site")).toHaveAttribute("data-page", path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index,follow");
  }
});

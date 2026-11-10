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
      await expect(page.locator("h1")).toHaveText(entry.path === "/" ? "Your business.AI-native by design." : entry.title);
      expect((await page.locator("main").innerText()).length).toBeGreaterThan(250);
      for (const [key, content] of Object.entries(metadata.meta)) {
        await expect(page.locator(`meta[${key.startsWith("og:") ? "property" : "name"}="${key}"]`))
          .toHaveAttribute("content", content);
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", entry.path);
      await expect(page.locator("noscript")).toBeVisible();
      expect(await page.locator("noscript").textContent()).toContain("require JavaScript");
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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your business.AI-native by design.");
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

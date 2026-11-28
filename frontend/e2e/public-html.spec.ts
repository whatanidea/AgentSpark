import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES, publicPage } from "../src/components/publicPages";
import { MARKETING_ORIGIN, pageMetadata } from "../src/publicMetadata";
import { documents } from "../src/components/documents/catalog";

test("public HTML sitemap lists only canonical public pages and is advertised to crawlers", async ({ page, request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/xml/);
  const locations = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.documentElement.namespaceURI !== "http://www.sitemaps.org/schemas/sitemap/0.9") throw new Error("Invalid sitemap");
    return [...doc.querySelectorAll("urlset > url > loc")].map(loc => loc.textContent);
  }, await response.text());
  expect(locations.sort()).toEqual([...PUBLIC_PAGES, ...documents].map(p => MARKETING_ORIGIN + p.path).sort());
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${MARKETING_ORIGIN}/sitemap.xml`);
});

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
      await expect(page).toHaveTitle(metadata.title);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("h1")).toHaveText(entry.title);
      expect((await page.locator("main").innerText()).length).toBeGreaterThan(250);
      for (const [key, content] of Object.entries(metadata.meta)) {
        await expect(page.locator(`meta[${key.startsWith("og:") ? "property" : "name"}="${key}"]`))
          .toHaveAttribute("content", content);
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", MARKETING_ORIGIN + entry.path);
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
    await page.getByRole("contentinfo").getByRole("link", { name: "Consulting overview", exact: true }).click();
    await expect(page).toHaveURL("/consulting");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(publicPage("/consulting")!.title);
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
    const discoveryActions = page.getByRole("button", { name: "Start discovery", exact: true });
    await expect(discoveryActions.first()).toBeVisible();
    for (const action of await discoveryActions.all()) await expect(action).toBeDisabled();
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

test("public HTML has four concise menus, footer navigation and protected actions below the story", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  const mobile = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await mobile.isVisible()) await mobile.click();
  await expect(nav.getByRole("button")).toHaveText(["Platform", "Solutions", "Resources", "Consulting"]);
  expect(await nav.locator("a").count()).toBe(16);
  for (const summary of await nav.locator(".premium-menu-links li small").allTextContents()) {
    expect(summary.length).toBeLessThanOrEqual(60);
  }
  await expect(nav.getByRole("link", { name: "About", exact: true })).toHaveCount(0);
  const close = page.getByRole("button", { name: "Close navigation", exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "About", exact: true })).toBeVisible();
  const actions = page.locator(".story-start");
  await expect(actions.getByRole("button", { name: /Start discovery/ })).toBeVisible();
  await expect(actions.getByRole("button", { name: /Assess my workflow/ })).toBeVisible();
});

test("public HTML metadata stays consistent after client navigation and workspace entry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const assess = page.locator(".story-start").getByRole("button", { name: /Assess my workflow/ });
  await expect(assess).toBeEnabled();
  const homeTitle = pageMetadata(publicPage("/")).title;
  await expect(page).toHaveTitle(homeTitle);
  await expect(page.locator("h1")).toHaveCount(1);
  await page.getByRole("contentinfo").getByRole("link", { name: "Consulting overview", exact: true }).click();
  await expect(page).toHaveURL("/consulting");
  const consultingTitle = pageMetadata(publicPage("/consulting")).title;
  await expect(page).toHaveTitle(consultingTitle);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", consultingTitle);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", MARKETING_ORIGIN + "/consulting");
  await page.goBack();
  await expect(page).toHaveTitle(homeTitle);
  await assess.click();
  await expect(page).toHaveURL("/workspace");
  await expect(page).toHaveTitle("Workspace | Kaisersol");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  expect((await page.goto("/this-page-does-not-exist"))?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | Kaisersol");
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
    await expect(page.locator("#landing-title")).toHaveText("Where are you with AI?");
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveTitle("Kaisersol | AI Consulting & Assessment for SMEs");
    await expect(page.getByText("Loading product overview", { exact: false })).toHaveCount(0);
  } finally {
    release();
    await navigation;
  }
  const appearance = page.getByRole("combobox", { name: "Appearance", exact: true });
  await expect(appearance).toHaveValue("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await appearance.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("agentspark.appearance.v1"))).toBe("light");
  const motion = page.getByRole("button", { name: /Scroll motion/ });
  await expect(motion).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const ribbon = page.locator(".studio-plate animate");
  await expect(ribbon).toHaveCount(34);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(ribbon).toHaveCount(0);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("public HTML document aliases keep the same content and canonical metadata after enhancement", async ({ page }) => {
  for (const path of ["/", "/platform", "/consulting/readiness"]) {
    const entry = PUBLIC_PAGES.find(candidate => candidate.path === path)!;
    await page.goto(path === "/" ? "/index.html" : `${path}/index.html`);
    await expect(page).toHaveTitle(pageMetadata(entry).title);
    await expect(page.locator(".concept-site")).toHaveAttribute("data-page", path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", MARKETING_ORIGIN + path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index,follow");
  }
});

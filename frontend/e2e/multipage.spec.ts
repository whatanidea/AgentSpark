import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES, publicPage } from "../src/components/publicPages";
import { pageMetadata } from "../src/publicMetadata";

test("architecture illustration separates AI suggestions, human authority and customer delivery", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.method());
  });
  await page.goto("/platform/architecture");
  const figure = page.getByRole("figure", { name: "Invoice assistance, with people in control.", exact: true });
  await expect(figure).toBeVisible();
  const capabilities = page.getByRole("region", { name: "Architecture & review capabilities", exact: true });
  expect(await figure.evaluate(node => node.getBoundingClientRect().top))
    .toBeLessThan(await capabilities.evaluate(node => node.getBoundingClientRect().top));
  await expect(figure.getByRole("listitem")).toHaveCount(4);
  await expect(figure.locator('.architecture-connector[aria-hidden="true"]')).toHaveCount(3);
  await expect(figure.getByRole("heading", { name: "Human approval", exact: true })).toBeVisible();
  await expect(figure).toContainText("Suggestions, not actions");
  await expect(figure).toContainText("not Kaisersol's internal architecture or a connected, deployed workflow");
  await expect(figure).toContainText("it does not authorize actions in your business systems");
  await expect(figure.getByRole("heading", { name: "What your delivery team still does", exact: true })).toBeVisible();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await figure.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const positions = await figure.getByRole("listitem").evaluateAll(items => items.map(item => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y };
    }));
    for (let index = 1; index < positions.length; index++)
      expect(width === 1440 ? positions[index].x : positions[index].y)
        .toBeGreaterThan(width === 1440 ? positions[index - 1].x : positions[index - 1].y);
  }
  expect(writes).toEqual([]);
});

test("all 24 public URLs render their content and metadata and refresh safely", async ({ page }) => {
  expect(new Set(PUBLIC_PAGES.map(entry => entry.path)).size).toBe(24);
  for (const entry of PUBLIC_PAGES) {
    const response = await page.goto(entry.path);
    expect(response!.status()).toBe(200);
    const heading = page.getByRole("heading", { level: 1, name: entry.title, exact: true });
    await expect(heading).toBeVisible();
    await expect(page).toHaveTitle(pageMetadata(entry).title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", entry.summary);
    await page.reload();
    await expect(heading).toBeVisible();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("menu links navigate without document reloads and history restores heading focus", async ({ page }) => {
  const documents: string[] = [];
  page.on("request", request => { if (request.resourceType() === "document") documents.push(request.url()); });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  await page.getByRole("contentinfo").getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator(".concept-site")).toHaveAttribute("data-page", "/about");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await nav.getByRole("button", { name: "Solutions", exact: true }).click();
  await nav.getByRole("link", { name: "Finance & operations", exact: false }).click();
  await expect(page).toHaveURL(/\/solutions\/operations$/);
  await nav.getByRole("button", { name: "Solutions", exact: true }).click();
  await expect(nav.getByRole("link", { name: "Finance & operations", exact: false })).toHaveAttribute("aria-current", "page");
  expect(documents).toHaveLength(1);
});

test("public deep links remain public with a restored assessment and preserve its cloud", async ({ page }) => {
  await page.goto("/");
  await page.locator(".story-start").getByRole("button", { name: /Assess my workflow/ }).click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional multipage restoration");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("aws");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  try {
    await page.goto("/consulting/workflow-pilot");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(publicPage("/consulting/workflow-pilot")!.title);
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!).session).toBe(pointer.session);
    await page.goto("/solutions/operations");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(publicPage("/solutions/operations")!.title);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(publicPage("/solutions/operations")!.title);
    await page.getByRole("button", { name: "Open your workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.getByRole("button", { name: "2 · Diagnostic Interview", exact: true }).click();
    await expect(page.getByText("Assessment target:", { exact: false })).toContainText("AWS");
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!).session).toBe(pointer.session);
  } finally {
    const removed = await page.request.delete(`/api/v1/sessions/${pointer.session}`);
    expect([200, 404]).toContain(removed.status());
  }
});

test("unknown public pages are explicit and unknown API paths remain JSON 404s", async ({ page }) => {
  const response = await page.request.get("/api/v1/missing-public-routing-test");
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ detail: "Not found." });
  await page.goto("/missing-public-page");
  await expect(page.getByRole("heading", { name: "Page not found.", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Page not found | Kaisersol");
  await page.getByRole("link", { name: "Return to overview", exact: true }).click();
  await expect(page.locator("#landing-title")).toHaveText(publicPage("/")!.title);
});

test("browser Back protects an unsaved discovery draft without creating records", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.method());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start discovery", exact: false }).first().click();
  await expect(page.getByRole("heading", { name: "Discovery engagements", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New discovery engagement", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Engagement title", exact: true });
  await title.fill("Fictional unsaved navigation draft");
  const confirmations: string[] = [];
  page.once("dialog", dialog => { confirmations.push(dialog.message()); return dialog.dismiss(); });
  await page.goBack();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(title).toHaveValue("Fictional unsaved navigation draft");
  expect(confirmations).toEqual(["Discard unsaved discovery changes?"]);
  page.once("dialog", dialog => { confirmations.push(dialog.message()); return dialog.accept(); });
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#landing-title")).toHaveText(publicPage("/")!.title);
  expect(confirmations).toEqual(["Discard unsaved discovery changes?", "Discard unsaved discovery changes?"]);
  expect(writes).toEqual([]);
});

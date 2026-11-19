import { expect, test } from "@playwright/test";
import { expectReadable } from "./appearance";

const HOME = "/?design=pilot";
const READINESS = "/consulting/readiness?design=pilot";

test("design pilot changes composition, makes the product tangible and keeps the original site available", async ({ page }) => {
  const navigationWarnings: string[] = [];
  page.on("console", message => { if (/use a blocker on a POP navigation/.test(message.text())) navigationWarnings.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Big questions. Clear next moves.");
  await expect(page.locator(".public-capability-card, .editorial-signal, .premium-proof-strip")).toHaveCount(0);
  const demo = page.getByRole("region", { name: "Interactive fictional product experience" });
  await expect(demo.getByRole("tab")).toHaveCount(3);
  const box = (await page.locator(".pilot-app-window").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(1100);
  expect(box.height).toBeGreaterThanOrEqual(500);
  expect(1000 - box.y).toBeGreaterThanOrEqual(250);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(1);
  await page.getByRole("link", { name: "Explore the experience", exact: false }).click();
  await expect(page).toHaveURL(HOME + "#pilot-experience");
  await expect(demo).toBeFocused();
  const header = (await page.locator(".pilot-header").boundingBox())!;
  expect((await demo.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
  await page.getByRole("link", { name: "Compare current design", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator(".pilot-site")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Clarity before commitment.");
  await page.goto("/platform?design=pilot");
  await expect(page.locator(".pilot-site")).toHaveCount(0);
  expect(navigationWarnings).toEqual([]);
});

test("design pilot product can be explored by keyboard without autoplay, inference or writes", async ({ page }) => {
  const calls: string[] = [], external: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.pathname === "/ready") calls.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== "http://127.0.0.1:8767") external.push(url.origin);
  });
  await page.goto(HOME);
  const tabs = page.getByRole("tablist", { name: "Explore the product" });
  await page.locator(".pilot-source summary").first().click();
  await expect(page.locator(".pilot-source").first()).toHaveAttribute("open", "");
  await expect(page.locator(".pilot-source").first()).toContainText("not verified evidence");
  await tabs.getByRole("tab", { name: /Understand/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: /Weigh/ })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Name an exception owner");
  await page.getByRole("button", { name: /AI assistance Assist with the evidence/ }).click();
  await expect(page.locator(".pilot-option-detail")).toContainText("it does not authorize payment");
  await expect(page.locator(".pilot-option-detail")).toContainText("S2 · S3");
  await tabs.getByRole("tab", { name: /Weigh/ }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tabpanel")).toContainText("No workflow has been created");
  await expect(page.getByRole("tabpanel").getByRole("link", { name: /Open the full example/ })).toHaveAttribute("href", "/resources/example-assessment");
  await page.clock.install();
  await page.clock.fastForward(60000);
  await expect(tabs.getByRole("tab", { name: /Make the call/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: /Understand/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "S2 / Process owner", exact: true }).click();
  await expect(page.getByRole("region", { name: "Source statement preview" })).toContainText("Not assuming the team has already agreed");
  expect(calls.filter(call => !["GET /api/v1/auth/config", "GET /api/v1/auth/me"].includes(call))).toEqual([]);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("design pilot advisory presents explorable deliverables and progressively disclosed scope, not repeated hero cards", async ({ page }) => {
  await page.goto(HOME);
  await page.getByRole("navigation", { name: "Pilot navigation" }).getByRole("link", { name: "Advisory", exact: true }).click();
  await expect(page).toHaveURL(READINESS);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Your first move. Not your next experiment.");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator(".premium-page-visual, .consulting-role-grid")).toHaveCount(0);
  const tabs = page.getByRole("tablist", { name: "Explore the engagement outputs" });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await tabs.getByRole("tab", { name: /reality check/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Not verified");
  await expect(page.getByRole("tabpanel")).toContainText("Proposed, not accepted");
  await expect(page.getByRole("tabpanel")).toContainText("Not measured");
  await tabs.getByRole("tab", { name: /next move/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("before authorizing a pilot");
  await expect(page.locator(".pilot-method li")).toHaveCount(4);
  await page.locator(".pilot-faq summary").filter({ hasText: "What is not included?" }).click();
  await expect(page.locator(".pilot-faq details").nth(1)).toHaveAttribute("open", "");
  await expect(page.locator(".pilot-faq details").nth(1)).toContainText("not a software subscription");
  await page.getByRole("navigation", { name: "Pilot navigation" }).getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(HOME);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("design pilot both pages fit all widths and retain readable text in every scene and theme", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of [HOME, READINESS]) {
    await page.goto(path);
    for (const theme of ["light", "dark"]) {
      await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const tab of await page.getByRole("tab").all()) {
          await tab.click();
          await expectReadable(page.locator(".pilot-site"));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}, ${theme}, ${width}`).toBe(true);
          const panel = (await page.getByRole("tabpanel").boundingBox())!;
          expect(panel.x).toBeGreaterThanOrEqual(0);
          expect(panel.x + panel.width).toBeLessThanOrEqual(width);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        }
      }
    }
  }
});

test("design pilot protected actions retain the sign-in boundary without creating records", async ({ page }) => {
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  const writes: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.url());
  });
  for (const action of ["Start discovery", "Assess my workflow", "Sign in"]) {
    await page.goto(HOME);
    await page.getByRole("button", { name: action, exact: false }).first().click();
    await expect(page.getByRole("heading", { name: "Organization access", exact: true })).toBeVisible();
  }
  expect(writes).toEqual([]);
});

test("design pilot booking preserves opt-in scheduling, closes by Escape and restores focus", async ({ page }) => {
  const scheduler: string[] = [];
  page.on("request", request => {
    if (/https:\/\/([^/]+\.)?cal\.com\//.test(request.url())) scheduler.push(request.url());
  });
  await page.goto(READINESS + "&token=private-preview");
  const book = page.getByRole("link", { name: "Book a consultation", exact: false }).first();
  await expect(book).toHaveAttribute("href", "https://cal.com/vienna-now-rdnzte/agentspark-consulting");
  await expect(book).toHaveAttribute("referrerpolicy", "no-referrer");
  await book.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(scheduler).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(book).toBeFocused();
});

test("design pilot reduced-motion changes disable scene transitions without hiding any output", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(HOME);
  const tabs = page.getByRole("tablist", { name: "Explore the product" });
  await tabs.getByRole("tab", { name: /Weigh/ }).click();
  expect(await page.locator(".pilot-app-content > .pilot-scene").evaluate(element => getComputedStyle(element).animationName)).toBe("pilot-scene-in");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tabs.getByRole("tab", { name: /Make/ }).click();
  await expect(page.locator(".pilot-app-content > .pilot-scene")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("tabpanel")).toContainText("Investigate a clearer handoff");
  await page.goto(READINESS);
  await expect(page.locator(".pilot-engagement-paper > .pilot-scene")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("tabpanel")).toContainText("Find the work");
});

test("design pilot ambient gradients advance, follow scrolling and change scene without capturing input", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(HOME);
  const backdrop = page.locator(".pilot-ambient");
  const field = page.locator(".pilot-ambient-field");
  await expect(backdrop).toHaveAttribute("aria-hidden", "true");
  await expect(backdrop).toHaveCSS("pointer-events", "none");
  await expect(field).toHaveCSS("animation-iteration-count", "1");
  await expect(field).toHaveCSS("animation-duration", "3.8s");
  const before = await field.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => field.evaluate(element => getComputedStyle(element).transform)).not.toBe(before);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => backdrop.evaluate(element => element.style.getPropertyValue("--ambient-offset"))).toBe("-72px");
  await page.getByRole("navigation", { name: "Pilot navigation" }).getByRole("link", { name: "Advisory", exact: true }).click();
  await expect(backdrop).toHaveAttribute("data-scene", "readiness");
  await expect.poll(() => backdrop.evaluate(element => element.style.getPropertyValue("--ambient-offset"))).toBe("0px");
  const position = await field.evaluate(element => getComputedStyle(element, "::before").transform);
  expect(position).not.toBe("none");
  await page.getByRole("tab", { name: /reality check/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Not verified");
});

test("design pilot ambient motion stops immediately for reduced motion and resumes only when allowed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(HOME);
  const backdrop = page.locator(".pilot-ambient");
  const field = page.locator(".pilot-ambient-field");
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => backdrop.evaluate(element => element.style.getPropertyValue("--ambient-offset"))).toBe("-72px");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field).toHaveCSS("animation-name", "none");
  await expect(backdrop).toHaveCSS("transform", "none");
  await expect.poll(() => backdrop.evaluate(element => element.style.getPropertyValue("--ambient-offset"))).toBe("0px");
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect(backdrop).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => backdrop.evaluate(element => element.style.getPropertyValue("--ambient-offset"))).toBe("-36px");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("design pilot text contrast stays readable even at maximum gradient overlap in both themes", async ({ page }) => {
  await page.goto(HOME);
  for (const theme of ["light", "dark"]) {
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
    const ratios = await page.locator(".pilot-site").evaluate(element => {
      const style = getComputedStyle(element);
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Gradient contrast checks require a canvas context.");
      const color = (property: string) => {
        const value = style.getPropertyValue(property).trim();
        if (!CSS.supports("color", value)) throw new Error(`Invalid gradient theme colour: ${property}`);
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      let background = color("--p-bg").slice(0, 3);
      for (const property of ["--p-glow-cool", "--p-glow-warm"]) {
        const layer = color(property);
        const alpha = Math.min(1, (layer[3] + 1) / 255);
        background = background.map((channel, index) => layer[index] * alpha + channel * (1 - alpha));
      }
      const luminance = (channels: number[]) => channels.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const surface = luminance(background);
      return ["--p-ink", "--p-muted", "--p-accent"].map(property => {
        const foreground = luminance(color(property));
        return { property, ratio: (Math.max(foreground, surface) + .05) / (Math.min(foreground, surface) + .05) };
      });
    });
    for (const result of ratios) expect(result.ratio, `${theme}: ${result.property} against maximum overlapping gradients`).toBeGreaterThanOrEqual(4.5);
  }
});

test("design pilot without JavaScript falls back to the existing complete public documents", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const path of [HOME, READINESS]) {
      await page.goto("http://127.0.0.1:8767" + path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".concept-site")).toBeVisible();
      await expect(page.locator(".pilot-site")).toHaveCount(0);
    }
  } finally { await context.close(); }
});

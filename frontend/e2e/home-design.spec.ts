import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES } from "../src/components/publicPages";
import { processingResult, watchProcessing } from "./responses";
import { expectReadable } from "./appearance";

test("Home design preview preserves content, links and five stable manual stages in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 956 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const writes: string[] = [], external: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:8767") external.push(request.url());
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.method());
  });
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Product walkthrough stages" }).getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  const navigation = await page.getByRole("navigation", { name: "Product navigation" }).textContent();
  const footer = await page.locator("footer").textContent();
  const links: (string | null)[][] = [], content: (string | null)[] = [], heights: number[] = [];
  for (const theme of ["dark", "light"] as const) {
    if (theme === "light") {
      const toggle = page.getByRole("combobox", { name: "Appearance", exact: true });
      await toggle.focus(); await page.keyboard.press("l"); await page.keyboard.press("Enter");
      await expect(toggle).toHaveValue("light");
      await expect(toggle).toBeFocused();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (let index = 0; index < 5; index++) {
      await tabs.nth(index).click();
      await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
      if (theme === "dark") {
        content.push(await page.locator("main").textContent());
        links.push(await page.locator("a[href]").evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))));
        heights.push((await page.locator(".premium-product-screen").boundingBox())!.height);
      } else {
        expect(await page.locator("main").textContent()).toBe(content[index]);
        expect(await page.locator("a[href]").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))).toEqual(links[index]);
        expect((await page.locator(".premium-product-screen").boundingBox())!.height).toBe(heights[index]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(4800);
      await expectReadable(page.locator(".concept-site"));
    }
    expect(await page.getByRole("navigation", { name: "Product navigation" }).textContent()).toBe(navigation);
    expect(await page.locator("footer").textContent()).toBe(footer);
  }
  expect(new Set(heights).size).toBe(1);
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
});

test("Home design preview fits narrow, tablet and desktop layouts in both themes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".concept-site")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["dark", "light"]) {
    if (theme === "light") await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
    for (const width of [320, 390, 440, 700, 768, 981, 1024, 1440]) {
      await page.setViewportSize({ width, height: 956 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px`).toBe(true);
      if (width === 1440) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(4800);
      const toggle = page.getByRole("combobox", { name: "Appearance", exact: true });
      const bounds = (await toggle.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const brand = (await page.getByRole("banner").locator(".landing-brand").boundingBox())!;
      expect(brand.x + brand.width).toBeLessThanOrEqual(bounds.x);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Less busywork.Better ways to work.");
      await expectReadable(page.locator(".concept-site"));
    }
  }
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
});

test("Home design preview keeps menus and opt-in booking readable, keyboard accessible and unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 956 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scheduler: string[] = [];
  page.on("request", request => { if (/https:\/\/([^/]+\.)?cal\.com\//.test(request.url())) scheduler.push(request.url()); });
  await page.goto("/");
  for (const theme of ["dark", "light"]) {
    if (theme === "light") await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
    const nav = page.getByRole("navigation", { name: "Product navigation" });
    for (const name of ["Consulting", "Platform", "Solutions", "Resources"]) {
      const menu = nav.getByRole("button", { name, exact: true });
      await menu.focus(); await page.keyboard.press("Enter");
      await expectReadable(page.getByRole("banner"));
      await page.keyboard.press("Escape"); await expect(menu).toBeFocused();
    }
    await page.getByRole("tab", { name: /Discover/ }).click();
    await page.getByRole("button", { name: "Inspect source statements", exact: false }).click();
    await expectReadable(page.getByRole("tabpanel"));
    await page.getByRole("button", { name: "Hide source statements", exact: false }).click();
    const book = page.getByRole("banner").getByRole("link", { name: "Book a consultation", exact: false });
    await book.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "A conversation. A clearer next step." });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Booking instructions" })).toHaveValue("If not added, add mcp.cal.com/mcp, then book vienna-now-rdnzte/agentspark-consulting");
    await expectReadable(dialog);
    await page.keyboard.press("Escape"); await expect(book).toBeFocused();
    await expect(page.locator("iframe")).toHaveCount(0);
  }
  expect(scheduler).toEqual([]);
});

test("shared appearance persists across public routes and the private workspace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
  await page.getByRole("contentinfo").getByRole("link", { name: "Platform overview", exact: true }).click();
  for (const path of ["/platform", "/solutions", "/resources", "/workspace"]) {
    if (path !== "/platform") await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toHaveValue("light");
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveCSS("font-family", /AgentSpark Public/);
    if (path !== "/workspace") await expect(page.locator(".editorial-site")).toHaveCSS("background-color", "rgb(250, 249, 246)");
  }
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toHaveValue("light");
});

test("shared appearance follows system changes and synchronizes browser tabs without saving identity data", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const control = page.getByRole("combobox", { name: "Appearance", exact: true });
  await expect(control).toHaveValue("dark");
  await control.selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(control).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await control.selectOption("light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const other = await context.newPage();
  await other.goto("/workspace");
  await expect(other.getByRole("combobox", { name: "Appearance", exact: true })).toHaveValue("light");
  await control.selectOption("dark");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([["agentspark.appearance.v1", "dark"]]);
  await control.selectOption("light");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => localStorage.removeItem("agentspark.appearance.v1"));
  await expect(other.getByRole("combobox", { name: "Appearance", exact: true })).toHaveValue("dark");
  await other.close();
});

test("shared appearance reconciles preference changes during subscription setup", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("agentspark.appearance.v1", "light");
    const add = window.addEventListener.bind(window);
    Object.defineProperty(window, "addEventListener", {
      value: (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        add(type, listener, options);
        if (type === "storage") localStorage.setItem("agentspark.appearance.v1", "dark");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("shared appearance reports blocked and invalid storage instead of silently claiming persistence", async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "agentspark.appearance.v1") throw new DOMException("Test blocked appearance storage", "SecurityError");
      set.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  expect(await page.evaluate(() => localStorage.getItem("agentspark.appearance.v1"))).toBeNull();
  await page.getByRole("button", { name: "Dismiss appearance notice", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("shared appearance rejects invalid saved preferences with an explicit recovery message", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("agentspark.appearance.v1", "not-an-appearance"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("alert")).toContainText("saved appearance preference is invalid");
  await page.getByRole("button", { name: "Save appearance again", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("agentspark.appearance.v1"))).toBe("dark");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("light");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("agentspark.appearance.v1"))).toBe("light");
});

test("shared appearance reports unavailable storage reads and preserves print legibility", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key === "agentspark.appearance.v1") throw new DOMException("Test blocked appearance reads", "SecurityError");
      return get.call(this, key);
    };
  });
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Appearance storage is unavailable");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toHaveCSS("color", "rgb(32, 32, 43)");
  await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toBeHidden();
});

test("shared appearance preserves all public-page copy with readable responsive surfaces in both themes", async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const copy = new Map<string, string | null>();
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.method());
  });
  for (const theme of ["dark", "light"]) for (const route of PUBLIC_PAGES) {
    await page.goto(route.path);
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (theme === "dark") copy.set(route.path, await page.locator("main").textContent());
    else expect(await page.locator("main").textContent(), route.path).toBe(copy.get(route.path));
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 956 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${route.path} ${width}px`).toBe(true);
      await expectReadable(page.locator(".concept-site"));
    }
  }
  expect(writes).toEqual([]);
});

test("shared appearance adapts workspace views and keeps unsaved discovery input when switching", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/workspace");
  const nav = page.getByRole("navigation", { name: "Workflow steps" });
  for (const theme of ["dark", "light"]) {
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 956 });
      for (const label of ["Home", "Discovery engagements", "1 · Enterprise Intake", "Organizations & teams", "Sample Portfolio"]) {
        await nav.getByRole("button", { name: label, exact: true }).click();
        await expect(page.locator(".nav-item[aria-current]")).toHaveAttribute("aria-label", label);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${label} ${width}px`).toBe(true);
        await expectReadable(page.locator(".portal"));
      }
    }
  }
  await nav.getByRole("button", { name: "Discovery engagements", exact: true }).click();
  await page.getByRole("button", { name: "New discovery engagement", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Engagement title", exact: true });
  await title.fill("Fictional bank appearance draft");
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
  await expect(title).toHaveValue("Fictional bank appearance draft");
  await expectReadable(page.locator(".portal"));
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

for (const theme of ["dark", "light"]) test(`shared appearance keeps assessment analysis and blueprint readable in ${theme}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/workspace");
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
  const nav = page.getByRole("navigation", { name: "Workflow steps" });
  await nav.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await page.getByRole("button", { name: "🧾 Invoice Approval (Finance)", exact: true }).click();
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  try {
    await expectReadable(page.locator(".portal"));
    await nav.getByRole("button", { name: "3 · Workflow Analysis", exact: true }).click();
    await watchProcessing(page, "/analyze/");
    await page.getByRole("button", { name: "▶ Run Multi-Agent Analysis", exact: true }).click();
    await processingResult(page);
    await expect(page.getByRole("button", { name: "▶ Run Multi-Agent Analysis", exact: true })).toBeEnabled();
    await expectReadable(page.locator(".portal"));
    await nav.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
    await expect(page.getByRole("region", { name: "Proposed architecture overview" })).toBeVisible();
    await expectReadable(page.locator(".portal"));
    for (const button of await page.getByRole("list", { name: "Proposed workflow steps" }).getByRole("button").all()) {
      await button.click();
      await expectReadable(page.getByRole("region", { name: "Proposed architecture overview" }));
    }
  } finally {
    const removed = await page.request.delete(`/api/v1/sessions/${pointer.session}`);
    expect([200, 404]).toContain(removed.status());
  }
});

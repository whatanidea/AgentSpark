import { expect, test } from "@playwright/test";

test("editorial hero leads with consulting and offers controllable motion without external requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:8767") external.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  const hero = page.locator("#top");
  await expect(hero.getByRole("heading", { level: 1 })).toHaveAccessibleName("Your business. AI-native by design.");
  expect(await hero.getByRole("heading", { level: 1 }).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(96);
  const book = hero.getByRole("button", { name: "Book a consultation", exact: false });
  expect((await book.boundingBox())!.y).toBeLessThan(960);
  const field = hero.getByRole("figure");
  await expect(field).toContainText("Not a connected system or an autonomous workflow");
  await expect.poll(() => field.evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
  const pause = field.getByRole("button", { name: "Pause illustration", exact: true });
  await pause.focus(); await page.keyboard.press("Enter");
  await expect(field.getByRole("button", { name: "Resume illustration", exact: true })).toBeFocused();
  await expect.poll(() => field.evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.playState === "paused" && !animation.pending))).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(() => field.evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field.getByRole("button")).toBeHidden();
  expect(await field.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  expect(external).toEqual([]);
});

test("fictional friction connects source statements to advisory recommendations with keyboard controls", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.method());
  });
  await page.goto("/");
  const preview = page.getByRole("tabpanel", { name: /Discover/ });
  const picker = preview.getByRole("group", { name: "Reported workflow friction" });
  await expect(picker.getByRole("button", { name: /Repeated checks/ })).toHaveAttribute("aria-pressed", "true");
  await expect(preview).toContainText("Compare a process change, deterministic validation and AI assistance");
  await expect(preview.locator("#editorial-example-sources")).toBeHidden();
  const inspect = preview.getByRole("button", { name: "Inspect source statements", exact: false });
  await inspect.focus(); await page.keyboard.press("Enter");
  await expect(preview.getByRole("button", { name: "Hide source statements", exact: false })).toHaveAttribute("aria-expanded", "true");
  await expect(preview.locator("#editorial-example-sources")).toContainText("S3 / Technical owner");
  const ownership = picker.getByRole("button", { name: /Unclear ownership/ });
  await ownership.focus(); await page.keyboard.press("Space");
  await expect(ownership).toBeFocused();
  await expect(ownership).toHaveAttribute("aria-pressed", "true");
  await expect(preview).toContainText("Clarify decision ownership before automating the handoff");
  await expect(preview.locator("#editorial-example-sources")).toBeHidden();
  await preview.getByRole("button", { name: "Inspect source statements", exact: false }).click();
  await expect(preview.locator("#editorial-example-sources")).toContainText("S2 / Process owner");
  await expect(preview.locator("#editorial-example-sources")).toContainText("not verified evidence");
  await expect(preview).toContainText("Human review required");
  await expect(preview).toContainText("No measured savings or automated approval is implied");
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("editorial identity and authentication-independent booking are shared across public pages", async ({ page }) => {
  const scheduler: string[] = [];
  page.on("request", request => { if (/https:\/\/([^/]+\.)?cal\.com\//.test(request.url())) scheduler.push(request.url()); });
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30,
  } }));
  for (const path of ["/", "/consulting", "/consulting/workflow-pilot", "/about", "/resources/trust"]) {
    await page.goto(path);
    await expect(page.locator(".editorial-site")).toHaveAttribute("data-page", path);
    await expect(page.locator(".editorial-site")).toHaveCSS("background-color", "rgb(8, 8, 12)");
    const header = page.getByRole("banner");
    await expect(header).toHaveCSS("background-color", "rgb(8, 8, 12)");
    const book = header.getByRole("button", { name: "Book a consultation", exact: false });
    await expect(book).toHaveCSS("border-radius", "10px");
    await expect(page.getByRole("navigation", { name: "Product navigation" }).getByRole("button").first()).toHaveText("Consulting");
    await book.click();
    const dialog = page.getByRole("dialog", { name: "A conversation. A clearer next step." });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Booking instructions" })).toHaveValue("If not added, add mcp.cal.com/mcp, then book vienna-now-rdnzte/agentspark-consulting");
    await page.keyboard.press("Escape"); await expect(book).toBeFocused();
    await expect(page.getByRole("heading", { name: "Organization access", exact: true })).toHaveCount(0);
  }
  expect(scheduler).toEqual([]);
});

test("editorial chapters and animated journey fit mobile and respect reduced motion", async ({ page }) => {
  await page.goto("/");
  const chapters = page.getByRole("region", { name: "A deliberate journey. Not another AI experiment.", exact: true });
  await expect(chapters.getByRole("article")).toHaveCount(4);
  await expect(chapters.getByRole("heading", { level: 3 })).toHaveText([
    "Find the opportunity.", "Equip your people.", "Prove a workflow.", "Build lasting adoption.",
  ]);
  for (const width of [320, 390, 768, 981, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`).toBe(true);
    for (const link of await chapters.getByRole("article").getByRole("link").all())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width <= 700) {
      const field = page.locator(".editorial-signal");
      await expect(field.getByRole("button", { name: "Pause illustration", exact: true })).toBeVisible();
      expect(await field.evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
      await expect(field.getByText("Customer-owned tools", { exact: true })).toBeVisible();
      await expect(field.getByText("Human-reviewed progress", { exact: true })).toBeVisible();
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
});

test("mobile journey fits completely and advances, pauses and resumes in Safari and Chromium", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const field = page.locator(".editorial-signal");
  for (const width of [320, 390, 440, 700]) {
    await page.setViewportSize({ width, height: 956 });
    await field.scrollIntoViewIfNeeded();
    const diagram = field.locator(".editorial-signal-mobile");
    await expect(diagram).toBeVisible();
    await expect(field.locator(".editorial-signal-desktop")).toBeHidden();
    const bounds = await field.boundingBox();
    if (!bounds) throw new Error("Journey illustration has no layout bounds");
    const parts = field.locator(".editorial-signal-mobile, .editorial-signal-mobile circle, .editorial-signal-inputs > span, .editorial-signal-core, .editorial-signal-outputs > span");
    for (const part of await parts.all()) {
      const box = await part.boundingBox();
      if (!box) throw new Error("Journey component has no layout bounds");
      expect(box.x, `${width}px left edge`).toBeGreaterThanOrEqual(bounds.x);
      expect(box.y, `${width}px top edge`).toBeGreaterThanOrEqual(bounds.y);
      expect(box.x + box.width, `${width}px right edge`).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.y + box.height, `${width}px bottom edge`).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const flow = diagram.locator(".editorial-signal-flow path").first();
    const orbit = diagram.locator(".editorial-signal-orbit");
    const dash = await flow.evaluate(node => getComputedStyle(node).strokeDashoffset);
    const transform = await orbit.evaluate(node => getComputedStyle(node).transform);
    await expect.poll(() => flow.evaluate(node => getComputedStyle(node).strokeDashoffset)).not.toBe(dash);
    await expect.poll(() => orbit.evaluate(node => getComputedStyle(node).transform)).not.toBe(transform);
    const pause = field.getByRole("button", { name: "Pause illustration", exact: true });
    expect((await pause.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await pause.click();
    await expect.poll(() => field.evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.playState === "paused" && !animation.pending))).toBe(true);
    await field.evaluate(async node => {
      await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.ready));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const frozen = await flow.evaluate(node => getComputedStyle(node).strokeDashoffset);
    await page.waitForTimeout(100);
    expect(await flow.evaluate(node => getComputedStyle(node).strokeDashoffset)).toBe(frozen);
    await field.getByRole("button", { name: "Resume illustration", exact: true }).click();
    await expect.poll(() => flow.evaluate(node => getComputedStyle(node).strokeDashoffset)).not.toBe(frozen);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field.getByRole("button")).toBeHidden();
  expect(await field.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(field.getByText("Customer-owned tools", { exact: true })).toBeVisible();
  await expect(field.getByText("Human-reviewed progress", { exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 956, height: 440 });
  await expect(field.locator(".editorial-signal-mobile")).toBeHidden();
  await expect(field.locator(".editorial-signal-desktop")).toBeVisible();
  await expect.poll(() => field.evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
});

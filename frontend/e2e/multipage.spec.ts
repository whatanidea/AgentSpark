import { expect, test } from "@playwright/test";

const pages = [
  ["/", "Home", "Decide what to automate. Know where AI belongs."],
  ["/about", "About", "Better decisions before bigger commitments."],
  ["/platform/discovery", "Discovery & stakeholder input", "Hear the people who know the work."],
  ["/platform/prioritization", "Synthesis & prioritization", "Build a shortlist you can explain."],
  ["/platform/assessment", "Assessment & executive decisions", "Turn a hypothesis into a reviewed decision."],
  ["/platform/architecture", "Architecture & review", "A reviewable architecture. Not automatic execution."],
  ["/solutions/transformation", "Transformation teams", "Build the shortlist before the backlog."],
  ["/solutions/operations", "Finance & operations", "Start with the friction people recognize."],
  ["/solutions/advisory", "Consultancies & advisory teams", "Structure the conversation with your clients."],
  ["/resources/how-it-works", "How it works", "From business question to clearer next step."],
  ["/resources/example-assessment", "Illustrative assessment", "Explore the work before signing in."],
  ["/resources/trust", "Trust & limitations", "Know what is supported. Know what is still unknown."],
] as const;

test("homepage explains exactly two use cases with original examples, outputs and clear limits", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") || request.url().endsWith("/ready"))
      calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto("/");
  await expect(page.getByText("AI opportunity discovery & assessment platform", { exact: true })).toBeVisible();
  const useCases = page.getByRole("region", { name: "Understand the work. Prepare the next step.", exact: true });
  await expect(useCases.getByRole("article")).toHaveCount(2);
  const readiness = useCases.getByRole("article", { name: "AI readiness", exact: true });
  const process = useCases.getByRole("article", { name: "Process intelligence", exact: true });
  await expect(readiness).toContainText("Assess workflow suitability separately from pilot readiness");
  await expect(readiness.getByRole("figure")).toContainText("Needs validation");
  await expect(process).toContainText("rules-based automation and AI assistance");
  await expect(process.getByRole("figure")).toContainText("not measured customer data");
  await expect(useCases.getByRole("list", { name: "AgentSpark deliverables" }).getByRole("listitem")).toHaveCount(4);
  await expect(useCases).toContainText("not automatic system monitoring or process mining");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of [readiness, process]) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      expect((await card.getByRole("link").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await readiness.getByRole("link", { name: "Explore readiness assessment" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/platform\/assessment$/);
  await page.goBack();
  await process.getByRole("link", { name: "Explore process discovery" }).click();
  await expect(page).toHaveURL(/\/platform\/discovery$/);
  expect(calls.filter(call => !["GET /api/v1/auth/config", "GET /api/v1/auth/me"].includes(call))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

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
  await expect(figure).toContainText("not AgentSpark's internal architecture or a connected, deployed workflow");
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

test("all 12 public URLs render focused content, metadata and refresh safely", async ({ page }) => {
  for (const [path, name, heading] of pages) {
    const response = await page.goto(path);
    expect(response!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${name} | AgentSpark`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /[a-zA-Z].{30}/);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
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
  await nav.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(nav.getByRole("link", { name: "About", exact: true })).toHaveAttribute("aria-current", "page");
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

test("homepage is concise and manual slides support keyboard, stable layout and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Product preview" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Example workflow" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Deliverable preview" })).toHaveCount(0);
  expect(await page.locator("main > section").count()).toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(2000);
  const preview = page.getByRole("article", { name: "Product preview" });
  const height = (await preview.boundingBox())!.height;
  await page.clock.install();
  await page.clock.fastForward(60000);
  await expect(preview.getByRole("group", { name: "1 of 3: Discover", exact: true })).toBeVisible();
  const next = page.getByRole("button", { name: "Next product slide", exact: true });
  await next.focus(); await page.keyboard.press("Enter");
  await expect(preview.getByRole("group", { name: "2 of 3: Prioritize", exact: true })).toBeVisible();
  expect((await preview.boundingBox())!.height).toBeCloseTo(height, 0);
  await page.keyboard.press("ArrowRight");
  await expect(preview.getByRole("group", { name: "3 of 3: Assess", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".home-slide")).toHaveCSS("animation-name", "none");
  await page.setViewportSize({ width: 320, height: 900 });
  for (const button of await preview.getByRole("button").all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("public deep links remain public with a restored assessment and preserve its cloud", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional multipage restoration");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("aws");
  await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
  const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
  try {
    await page.goto("/solutions/operations");
    await expect(page.getByRole("heading", { level: 1, name: pages[7][2], exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: pages[7][2], exact: true })).toBeVisible();
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
  await expect(page).toHaveTitle("Page not found | AgentSpark");
  await page.getByRole("link", { name: "Return to overview", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: pages[0][2], exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: pages[0][2], exact: true })).toBeVisible();
  expect(confirmations).toEqual(["Discard unsaved discovery changes?", "Discard unsaved discovery changes?"]);
  expect(writes).toEqual([]);
});

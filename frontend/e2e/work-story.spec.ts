import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES } from "../src/components/publicPages";

test.describe("public work story", () => {
  test("buyer paths update the brief and sources flow left to right with accessible motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.getByRole("button", { name: /Testing a workflow/ }).click();
    await expect(page.locator(".studio-plate h2")).toHaveText("A pilot scorecard.");
    const nodes = page.locator(".studio-track button");
    const x = await nodes.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().x));
    expect(x.slice(3).every((v,i)=>v>x[i+2])).toBe(true);
    await nodes.last().click();
    await expect(page.locator(".studio-inspect")).toContainText("A person reviews");
    const trace = page.locator(".studio-lines path").first();
    const offset = () => trace.evaluate(el=>getComputedStyle(el).strokeDashoffset);
    const before = await offset();
    await expect.poll(offset).not.toBe(before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(trace).toHaveCSS("animation-name","none");
    await page.getByRole("radio",{name:"Proposed pilot"}).check();
    await expect(page.locator(".studio-paper")).toContainText("Date mismatch flagged");
  });
  test("the self-service comparison ends before agent implementation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#self-service .studio-compare")).toBeAttached();
    await expect(page.locator("#self-service details, #self-service a")).toHaveCount(0);
    await expect(page.locator("#self-service + #agent-implementation")).toBeAttached();
  });
  test("every destination has its own heading, working assets and a fitting layout", async ({ page }) => {
    for (const route of PUBLIC_PAGES) {
      await test.step(route.path, async () => {
        expect((await page.goto(route.path))?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.title);
        await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", "https://www.kaisersol.com" + route.path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  });

  test("hands the file to the actual workflow explorer and lets the visitor inspect a decision", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Scroll motion/ })).toHaveCount(0);
    await expect(page.locator("#first-conversation").getByRole("link", {name:"Book a consultation"})).toBeVisible();
    await page.goto("/resources/example-assessment#workflow-explorer");
    await expect(page).toHaveURL(/example-assessment#workflow-explorer$/);
    await expect(page.locator("#workflow-explorer")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Step 1: Receive a claim" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Step 4: Examiner decision" }).click();
    await expect(page.locator(".landing-step-detail")).toContainText("Payment authorization");
    await page.goto("/#engagements");
    await page.locator("main a[href='/consulting/adoption']").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help the team use AI after launch.");
  });

  test("opens a shareable decision brief without a form or client script", async ({ browser, baseURL }) => {
    const page = await browser.newPage({ baseURL, javaScriptEnabled:false });
    try {
      await page.goto("/briefs/claim-intake.html");
      await expect(page).toHaveURL(/\/briefs\/claim-intake\.html$/);
      await expect(page.getByRole("heading", {level:1})).toHaveText("Should we fund an AI pilot for claims intake?");
      await expect(page.locator("main")).toContainText("fund measurement first, not software");
      await expect(page.locator("main")).toContainText("Released capacity is not cash savings");
      await page.getByRole("link", { name:"Discuss a workflow with Kaisersol" }).click();
      await expect(page.locator("#first-conversation")).toBeInViewport();
    } finally { await page.close(); }
  });
});

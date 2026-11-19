import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES } from "../src/components/publicPages";

test.describe("public work story", () => {
  test("compares the two health claim sources and reverses the date check without deciding coverage", async ({ page }) => {
    await page.goto("/#claim-adoption");
    const desk = page.getByRole("region", { name: "Check the visit date." });
    const bill = desk.locator(".intake-sources > div").nth(1);
    await expect(bill).toContainText("8 May");
    await expect(desk.getByRole("status")).toContainText("Dates differ");
    await expect(desk.getByRole("status")).toContainText("claims specialist’s queue");
    await expect(desk.getByRole("status")).toContainText("AI-drafted query");
    const switchBill = desk.getByRole("button");
    await switchBill.focus();
    await page.keyboard.press("Enter");
    await expect(bill).toContainText("Corrected clinic bill");
    await expect(bill).toContainText("6 May");
    await expect(desk.getByRole("status")).toContainText("Dates match. Check eligibility next.");
    await expect(desk.getByRole("status")).toContainText("not whether the visit is covered");
    await expect(desk.getByRole("status")).not.toContainText("AI-drafted query");
    await switchBill.click();
    await expect(bill).toContainText("8 May");
    await expect(desk.getByRole("status")).toContainText("Ask the clinic to confirm");
  });
  test("every destination has its own heading, working assets and a fitting layout", async ({ page }) => {
    for (const route of PUBLIC_PAGES) {
      await test.step(route.path, async () => {
        expect((await page.goto(route.path))?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.title);
        await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", route.path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  });

  test("hands the file to the actual workflow explorer and lets the visitor inspect a decision", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Scroll motion/ })).toHaveCount(0);
    const preview = page.locator(".claim-preview");
    await expect.poll(() => preview.locator("img").evaluate(img => img instanceof HTMLImageElement && img.naturalWidth > 0)).toBe(true);
    await preview.click();
    await expect(page).toHaveURL(/example-assessment#workflow-explorer$/);
    await expect(page.locator("#workflow-explorer")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Step 1: Receive a claim" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Step 4: Examiner decision" }).click();
    await expect(page.locator(".landing-step-detail")).toContainText("Payment authorization");
    await page.goto("/#claim-adoption");
    await page.getByText("How do we keep improving?", { exact: true }).click();
    await page.locator(".story-guide a[href='/consulting/adoption']").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help the team use AI after launch.");
  });
});

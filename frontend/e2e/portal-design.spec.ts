import { expect, test, type Page } from "@playwright/test";

async function openPortal(page: Page) {
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
}

async function verifyPalette(page: Page) {
  await expect(page.locator(".portal-sidebar")).toHaveCSS("background-color", "rgb(16, 16, 23)");
  await expect(page.getByRole("main")).toHaveCSS("background-color", "rgb(8, 8, 12)");
  const active = page.locator(".nav-item[aria-current]");
  await expect(active).toHaveCSS("background-color", "rgb(27, 23, 48)");
  await expect(active).toHaveCSS("color", "rgb(178, 165, 255)");
  const greenAccents = await page.locator(".portal").evaluate(root => {
    const isGreen = (value: string) => {
      const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!rgb || value.endsWith(", 0)")) return false;
      const [r, g, b] = rgb.slice(1).map(Number);
      return g > r + 15 && g > b + 8;
    };
    return [...root.querySelectorAll("*")].filter(element => {
      if (!element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor, style.borderTopColor, style.fill, style.stroke].some(isGreen);
    }).map(element => element.tagName + "." + element.classList.value);
  });
  expect(greenAccents).toEqual([]);
}

test("editorial portal retains a consistent palette and bounded layouts across private views", async ({ page }) => {
  await openPortal(page);
  for (const width of [320, 390, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ["Home", "Discovery engagements", "1 · Enterprise Intake", "Organizations & teams", "Sample Portfolio"]) {
      await page.getByRole("navigation", { name: "Workflow steps" }).getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator(".nav-item[aria-current]")).toHaveAttribute("aria-label", label);
      await verifyPalette(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("editorial form controls retain visible focus, disabled states and accessible action contrast", async ({ page }) => {
  await openPortal(page);
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  const field = page.getByLabel("Business Domain", { exact: true });
  await field.focus();
  await expect(field).toHaveCSS("border-color", "rgb(178, 165, 255)");
  await expect(field).toHaveCSS("border-radius", "10px");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Team Size", exact: true })).toBeFocused();
  const submit = page.getByRole("button", { name: "Submit Intake", exact: true });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS("cursor", "not-allowed");
  await page.getByRole("button", { name: "🧾 Invoice Approval (Finance)", exact: true }).click();
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("min-height", "44px");
  await expect(submit).toHaveCSS("background-color", "rgb(237, 237, 242)");
  await expect(submit).toHaveCSS("color", "rgb(16, 16, 23)");
  await expect(page.locator(".surface-card").first()).toHaveCSS("border-radius", "20px");
  await verifyPalette(page);
  const contrast = await page.locator(".nav-item, .action-primary, .eyebrow").evaluateAll(elements => {
    const luminance = (color: string) => {
      const channels = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (!channels) throw new Error(`Expected opaque RGB: ${color}`);
      return channels.slice(1).map(Number).map(value => value / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    };
    return elements.filter(element => element.getClientRects().length).map(element => {
      const style = getComputedStyle(element);
      let background = style.backgroundColor;
      let ancestor = element.parentElement;
      while (background === "rgba(0, 0, 0, 0)" && ancestor) {
        background = getComputedStyle(ancestor).backgroundColor;
        ancestor = ancestor.parentElement;
      }
      const foreground = luminance(style.color);
      const behind = luminance(background);
      return { label: element.textContent, ratio: (Math.max(foreground, behind) + .05) / (Math.min(foreground, behind) + .05) };
    });
  });
  for (const result of contrast) expect(result.ratio, result.label ?? "").toBeGreaterThanOrEqual(4.5);
  const home = page.getByRole("button", { name: "Home", exact: true });
  await page.keyboard.press("Tab");
  await home.focus();
  await expect(home).toBeFocused();
  await expect(home).toHaveCSS("outline-style", "solid");
  await expect(home).toHaveCSS("outline-color", "rgb(178, 165, 255)");
});

test("positive portfolio statuses and score bars use violet while retaining their labels", async ({ page }) => {
  await page.route("**/api/v1/portfolio", route => route.fulfill({ json: { portfolio: [{
    workflow_name: "Fictional low-risk workflow", governance_decision: "APPROVE",
    governance_risk: "Low", agent_score: 84, classification: "High",
    recommended_pattern: "Fictional assisted workflow",
  }] } }));
  await openPortal(page);
  await page.getByRole("button", { name: "Sample Portfolio", exact: true }).click();
  await page.getByRole("button", { name: "Score Backlog", exact: true }).click();
  await expect(page.getByText("Sample workflow comparison", { exact: true })).toBeVisible();
  await verifyPalette(page);
  const positive = page.getByText("Low Risk", { exact: true }).first();
  await expect(positive).toBeVisible();
  await expect(positive).toHaveCSS("background-color", "rgb(41, 34, 63)");
  await expect(positive).toHaveCSS("color", "rgb(230, 222, 255)");
  await expect(page.getByText("84/100", { exact: true })).toHaveCSS("color", "rgb(178, 165, 255)");
});

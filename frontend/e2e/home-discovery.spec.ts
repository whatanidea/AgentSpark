import { expect, test } from "@playwright/test";
import type { HomeItem } from "../src/api";

let disposableEngagement = "";
test.afterEach(async ({ request }) => {
  if (!disposableEngagement) return;
  const response = await request.get(`/api/v1/engagements/${disposableEngagement}`);
  if (response.ok()) {
    const record = await response.json();
    expect((await request.delete(`/api/v1/engagements/${record.id}?${new URLSearchParams({ version: record.version })}`)).ok()).toBe(true);
  }
  disposableEngagement = "";
});

test("Home discovery library opens saved work, preserves draft guards and starts a new engagement", async ({ page }, testInfo) => {
  const title = `Fictional Home discovery ${testInfo.project.name}`;
  const created = await page.request.post("/api/v1/engagements", { data: { engagement: {
    title, objective: "Understand incident enrichment", business_units: "Fictional SRE",
    sponsor: "Fictional sponsor", engagement_owner: "Fictional lead",
  } } });
  expect(created.ok()).toBe(true);
  const record = await created.json();
  disposableEngagement = record.id;
  await page.goto("/workspace");
  const workflowTab = page.getByRole("tab", { name: "Workflow library", exact: true });
  const discoveryTab = page.getByRole("tab", { name: "Discovery engagements", exact: true });
  await expect(workflowTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Draft / clarification", exact: true }).click();
  await expect(discoveryTab).toBeEnabled();
  await discoveryTab.click();
  const panel = page.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
  await expect(panel).toContainText(title);
  await expect(panel.getByRole("columnheader", { name: "Expires", exact: true })).toBeVisible();
  for (const width of [320, 390, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await workflowTab.click();
  await expect(page.getByRole("button", { name: "Draft / clarification", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(workflowTab).toBeEnabled();
  await workflowTab.focus();
  await workflowTab.press("ArrowRight");
  await expect(discoveryTab).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("button", { name: `Open discovery ${title}`, exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: `Open discovery ${title}`, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue(title);
  await expect(page.getByRole("heading", { name: "Engagement overview", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Business objective", exact: true }).fill("Unsaved Home library draft");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Business objective", exact: true })).toHaveValue("Unsaved Home library draft");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(discoveryTab).toBeEnabled();
  await discoveryTab.click();
  await panel.getByRole("button", { name: `Open discovery ${title}`, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Business objective", exact: true })).toHaveValue(record.engagement.objective);
  const unchanged = await (await page.request.get(`/api/v1/engagements/${record.id}`)).json();
  expect(unchanged.expires_at).toBe(record.expires_at);
  expect(unchanged.version).toBe(record.version);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(discoveryTab).toBeEnabled();
  await discoveryTab.click();
  await expect(panel.getByRole("button", { name: `Open discovery ${title}`, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /^New discovery engagement/ }).click();
  await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save discovery engagement", exact: true })).toBeVisible();
});

test("Home discovery library shows failures, retries and appends cursor pages without hiding workflows", async ({ page }) => {
  const item = (id: string, title: string): HomeItem => ({
    kind: "engagement", session_id: id, title, domain: "Fictional operations", analysis_id: null,
    can_delete: false, status: "draft", score: null, updated_at: "2026-11-04T10:00:00Z",
    expires_at: "2026-12-04T10:00:00Z", sort_key: id, legacy: false,
  });
  const cursors: string[] = [];
  let failFirst = true;
  let failMore = true;
  await page.route("**/api/v1/engagements?*", async route => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor") || "";
    cursors.push(cursor);
    if (failFirst || (cursor && failMore)) {
      if (cursor) failMore = false;
      failFirst = false;
      await route.fulfill({ status: 503, json: { detail: "Discovery dependency unavailable" } });
      return;
    }
    await route.fulfill({ json: cursor
      ? { items: [item("second", "Second fictional engagement")], next_cursor: null }
      : { items: [item("first", "First fictional engagement")], next_cursor: "next-page" } });
  });
  await page.goto("/workspace");
  await page.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
  await expect(panel.getByRole("alert")).toContainText("503");
  await expect(panel.getByText("No discovery engagements in this workspace", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Refresh engagements", exact: true }).click();
  await expect(panel).toContainText("First fictional engagement");
  await panel.getByRole("button", { name: "Load more engagements", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("503");
  await expect(panel).toContainText("First fictional engagement");
  await panel.getByRole("button", { name: "Load more engagements", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await expect(panel).toContainText("Second fictional engagement");
  await expect(panel.getByRole("button", { name: "Load more engagements", exact: true })).toHaveCount(0);
  expect(cursors).toEqual(["", "", "next-page", "next-page"]);
  await page.route("**/api/v1/engagements/first", route => route.fulfill({ status: 404, json: { detail: "Engagement unavailable" } }));
  await panel.getByRole("button", { name: "Open discovery First fictional engagement", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("404");
  await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Workflow library", exact: true })).toBeVisible();
});

test("Home discovery library distinguishes empty data from loading and supports keyboard tabs", async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/engagements?*", async route => {
    await waiting;
    await route.fulfill({ json: { items: [], next_cursor: null } });
  });
  await page.goto("/workspace");
  const discoveryTab = page.getByRole("tab", { name: "Discovery engagements", exact: true });
  await discoveryTab.click();
  const panel = page.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
  await expect(panel.getByRole("status")).toContainText("Loading your discovery engagements");
  await expect(page.getByRole("button", { name: /^New discovery engagement/ })).toBeDisabled();
  release();
  await expect(panel.getByText("No discovery engagements in this workspace", { exact: true })).toBeVisible();
  await expect(discoveryTab).toBeEnabled();
  let releaseWorkflow!: () => void;
  const workflowWaiting = new Promise<void>(resolve => { releaseWorkflow = resolve; });
  await page.route("**/api/v1/home?*", async route => {
    await workflowWaiting;
    await route.fulfill({ json: { items: [], next_cursor: null, archive_retention_days: 30 } });
  });
  await discoveryTab.focus();
  await discoveryTab.press("Home");
  const workflowTab = page.getByRole("tab", { name: "Workflow library", exact: true });
  const workflowPanel = page.getByRole("tabpanel", { name: "Workflow library", exact: true });
  await expect(workflowPanel.getByRole("status")).toBeVisible();
  await expect(workflowTab).toBeFocused();
  await expect(workflowTab).toHaveAttribute("aria-selected", "true");
  await expect(workflowTab).toHaveAttribute("aria-disabled", "true");
  await expect(discoveryTab).toBeDisabled();
  await workflowTab.press("End");
  await expect(workflowTab).toHaveAttribute("aria-selected", "true");
  await expect(workflowTab).toBeFocused();
  await expect(page.getByRole("button", { name: /^Create workflow/ })).toBeDisabled();
  releaseWorkflow();
  await expect(workflowTab).toBeEnabled();
  await expect(workflowPanel.getByRole("status")).toHaveCount(0);
  await expect(workflowTab).toBeFocused();
  await workflowTab.press("End");
  await expect(discoveryTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /^New discovery engagement/ })).toBeEnabled();
});

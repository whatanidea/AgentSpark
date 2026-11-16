import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { AdoIntegration } from "../src/azureDevOps";
import type { DiscoveryRecord } from "../src/api";

const API = "/api/v1/integrations/azure-devops";
const root = (page: Page) => page.getByRole("region", { name: "Workspace integrations" });
const flow = (page: Page) => root(page).getByRole("region", { name: "Start discovery from connector" });
const sessions: string[] = [];

async function state(request: APIRequestContext): Promise<AdoIntegration> {
  const response = await request.get(API);
  expect(response.ok()).toBe(true);
  return response.json();
}

test.beforeEach(async ({ request }) => {
  const current = await state(request);
  expect((await request.post(`${API}/reset`, { data: { version: current.version } })).ok()).toBe(true);
});

test.afterEach(async ({ request }) => {
  for (const receipt of (await state(request)).discovery_receipts) {
    const response = await request.get(`/api/v1/engagements/${receipt.engagement_id}`);
    if (response.status() === 404) continue;
    expect(response.ok()).toBe(true);
    const record: DiscoveryRecord = await response.json();
    expect((await request.delete(`/api/v1/engagements/${record.id}?version=${encodeURIComponent(record.version)}`)).ok()).toBe(true);
  }
  for (const id of sessions.splice(0)) {
    expect((await request.delete(`/api/v1/sessions/${id}`)).ok()).toBe(true);
  }
});

async function open(page: Page) {
  await page.goto("/workspace");
  const library = page.getByRole("tabpanel", { name: "Workflow library" });
  await expect(library.getByRole("table").or(
    library.getByRole("heading", { name: "No workflows in this view" }),
  )).toBeVisible();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(root(page).getByRole("heading", { name: "Azure DevOps integration", exact: true })).toBeVisible();
}

async function configure(request: APIRequestContext) {
  const current = await state(request);
  expect((await request.put(`${API}/connection`, { data: {
    version: current.version, project: "operations", item_types: ["Bug", "User Story", "Task"],
  } })).ok()).toBe(true);
}

async function area(page: Page, name: string) {
  await root(page).getByRole("navigation", { name: "Integration areas" }).getByRole("button", { name, exact: true }).click();
  await expect(root(page).getByRole("button", { name: "Refresh integration data", exact: true })).toBeEnabled();
}

async function assessment(request: APIRequestContext) {
  const id = randomUUID();
  sessions.push(id);
  expect((await request.post("/api/v1/intake", { data: {
    session_id: id, business_domain: "Fictional integration handoff", team_size: "1-50",
    existing_systems: "Fictional", pain_points: "Sample only", compliance_requirements: "High",
    demo_scenario: "invoice",
  } })).ok()).toBe(true);
  const response = await request.post(`/api/v1/analyze/${id}`);
  expect(response.ok()).toBe(true);
  const result = await response.json();
  if (result.status === "awaiting_human_review") {
    expect((await request.post(`/api/v1/review/${id}`, { data: {
      analysis_id: result.analysis_id, decision: "approve", reviewer: "Fictional local tester",
      note: "Synthetic integration testing only. No external authority granted.",
    } })).ok()).toBe(true);
  }
  const current = await request.get(`/api/v1/sessions/${id}`);
  expect((await current.json()).status).toBe("completed");
  return id;
}

test("Azure DevOps simulator imports scoped snapshots, persists them and fits mobile screens", async ({ page }) => {
  const assessmentWrites: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", request => {
    if (/\/api\/v1\/(intake|sessions|engagements)/.test(request.url()) && request.method() !== "GET") assessmentWrites.push(request.url());
    if (new URL(request.url()).hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await open(page);
  await expect(root(page)).toContainText("Local simulator only");
  await area(page, "Connection settings");
  await root(page).getByLabel("User Story", { exact: true }).uncheck();
  await root(page).getByLabel("Task", { exact: true }).uncheck();
  await root(page).getByRole("button", { name: "Save simulator settings", exact: true }).click();
  await expect(root(page).getByRole("checkbox", { name: /^102:/ })).toBeVisible();
  await expect(root(page).getByRole("checkbox", { name: /^101:/ })).toHaveCount(0);
  await root(page).getByRole("checkbox", { name: /^102:/ }).check();
  await root(page).getByRole("button", { name: "Import selected work items", exact: true }).click();
  await expect(root(page)).toContainText("1 imported snapshots");
  await expect(root(page)).toContainText("https://dev.azure.example/fictional/operations/_workitems/edit/102");
  await root(page).getByRole("checkbox", { name: /^102:/ }).check();
  await root(page).getByRole("button", { name: "Import selected work items", exact: true }).click();
  await expect(root(page)).toContainText("1 imported snapshots");
  await open(page);
  await area(page, "Connection settings");
  await expect(root(page)).toContainText("1 imported snapshots");
  for (const width of [320, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(assessmentWrites).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("Azure DevOps simulator requires exact preview confirmation and prevents duplicate delivery", async ({ page, request }) => {
  await configure(request);
  const id = await assessment(request);
  await open(page);
  await area(page, "Delivery handoff");
  await root(page).getByRole("combobox", { name: "Completed assessment", exact: true }).selectOption(id);
  await root(page).getByRole("button", { name: "Preview delivery handoff", exact: true }).click();
  await expect(root(page).getByRole("heading", { name: "4. Review and explicitly confirm" })).toBeVisible();
  await expect(root(page).getByRole("button", { name: "Confirm simulated handoff", exact: true })).toBeDisabled();
  const preview = (await state(request)).preview;
  if (!preview) throw new Error("The handoff preview was not persisted.");
  expect((await state(request)).receipts).toHaveLength(0);
  await root(page).getByRole("checkbox", { name: /^I reviewed this exact preview/ }).check();
  await root(page).getByRole("button", { name: "Confirm simulated handoff", exact: true }).click();
  await expect(root(page)).toContainText("Simulated handoff recorded");
  const after = await state(request);
  expect(after.receipts).toHaveLength(1);
  expect(after.receipts[0].items).toHaveLength(preview.items.length);
  expect((await request.post(`${API}/handoff/confirm`, { data: {
    preview_id: preview.id, digest: preview.digest, confirmed: true,
  } })).ok()).toBe(true);
  expect((await state(request)).receipts).toHaveLength(1);
  await root(page).getByRole("button", { name: "Refresh integration data", exact: true }).click();
  await root(page).getByRole("button", { name: "Preview delivery handoff", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("already handed off");
});

test("Azure DevOps simulator rejects stale destination previews and can discard without creating items", async ({ page, request }) => {
  await configure(request);
  const id = await assessment(request);
  await open(page);
  await area(page, "Delivery handoff");
  await root(page).getByRole("combobox", { name: "Completed assessment", exact: true }).selectOption(id);
  await root(page).getByRole("button", { name: "Preview delivery handoff", exact: true }).click();
  await root(page).getByRole("button", { name: "Discard preview", exact: true }).click();
  await expect(root(page)).toContainText("Preview discarded");
  expect((await state(request)).receipts).toHaveLength(0);
  await root(page).getByRole("button", { name: "Preview delivery handoff", exact: true }).click();
  const current = await state(request);
  expect((await request.put(`${API}/connection`, { data: {
    version: current.version, project: "platform", item_types: ["Task"],
  } })).ok()).toBe(true);
  await root(page).getByRole("checkbox", { name: /^I reviewed this exact preview/ }).check();
  await root(page).getByRole("button", { name: "Confirm simulated handoff", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("Preview no longer exists");
  expect((await state(request)).receipts).toHaveLength(0);
  await root(page).getByRole("button", { name: "Refresh integration data", exact: true }).click();
  await expect(root(page).getByRole("heading", { name: "4. Review and explicitly confirm" })).toHaveCount(0);
  await area(page, "Connection settings");
  await expect(root(page).getByRole("combobox", { name: "Fictional Azure DevOps project", exact: true })).toHaveValue("platform");
});

test("Azure DevOps simulator reports dependency errors and recovers with an explicit refresh", async ({ page }) => {
  let available = false;
  await page.route(/\/api\/v1\/integrations\/azure-devops$/, route => !available
    ? route.fulfill({ status: 503, json: { detail: "Synthetic connector unavailable" } })
    : route.continue());
  await open(page);
  await expect(root(page).getByRole("alert")).toContainText("Synthetic connector unavailable");
  available = true;
  await root(page).getByRole("button", { name: "Refresh integration data", exact: true }).click();
  await area(page, "Connection settings");
  await expect(root(page).getByRole("button", { name: "Save simulator settings", exact: true })).toBeEnabled();
});

test("Azure DevOps simulator protects unsaved settings and resets only simulator state", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await area(page, "Connection settings");
  await root(page).getByRole("combobox", { name: "Fictional Azure DevOps project", exact: true }).selectOption("platform");
  await expect(root(page)).toContainText("Unsaved integration settings");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(root(page)).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await open(page);
  await area(page, "Connection settings");
  page.once("dialog", dialog => dialog.accept());
  await root(page).getByRole("button", { name: "Reset simulator data", exact: true }).click();
  await expect(root(page)).toContainText("Local simulator data reset");
  expect((await state(request)).connection).toBeNull();
});

test("Azure DevOps simulator presents read-only permissions without exposing write controls", async ({ page, request }) => {
  await configure(request);
  const current = await state(request);
  await page.route(/\/api\/v1\/integrations\/azure-devops$/, route => route.fulfill({ json: {
    ...current, permissions: { read: true, write: false, manage: false },
  } }));
  await open(page);
  await expect(flow(page).getByRole("button", { name: "Continue to brief", exact: true })).toBeDisabled();
  await area(page, "Connection settings");
  await expect(root(page).getByRole("button", { name: "Save simulator settings", exact: true })).toBeDisabled();
  await expect(root(page).getByRole("button", { name: "Import selected work items", exact: true })).toBeDisabled();
  await expect(root(page).getByRole("button", { name: "Reset simulator data", exact: true })).toHaveCount(0);
  await area(page, "Delivery handoff");
  await expect(root(page).getByRole("button", { name: "Preview delivery handoff", exact: true })).toBeDisabled();
});

async function previewDiscovery(page: Page) {
  await flow(page).getByRole("checkbox", { name: /^101:/ }).check();
  await flow(page).getByRole("button", { name: "Continue to brief", exact: true }).click();
  await expect(flow(page).getByRole("heading", { name: "Review and edit your brief", exact: true })).toBeVisible();
}

async function reviewDiscovery(page: Page) {
  await flow(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await expect(flow(page).getByRole("heading", { name: "Start this discovery?", exact: true })).toBeVisible();
}

async function confirmDiscovery(page: Page) {
  await flow(page).getByRole("checkbox", { name: /^I reviewed this brief/ }).check();
  await flow(page).getByRole("button", { name: "Start discovery", exact: true }).click();
}

test("Imported discovery previews only selected snapshots and requires confirmation before creation", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await expect(flow(page).getByRole("button", { name: "Continue to brief", exact: true })).toBeDisabled();
  await expect(root(page).getByRole("heading", { name: "1. Configure the simulator", exact: true })).toHaveCount(0);
  await expect(root(page).getByRole("heading", { name: "3. Preview assessment delivery work", exact: true })).toHaveCount(0);
  await previewDiscovery(page);
  await reviewDiscovery(page);
  const current = await state(request);
  expect(current.imported.map(item => item.id)).toEqual([101]);
  expect(current.discovery_preview?.item_ids).toEqual([101]);
  expect(current.discovery_preview?.sources).toHaveLength(1);
  expect(current.discovery_receipts).toHaveLength(0);
  await expect(root(page)).toContainText("Unknown; nominate a sponsor");
  await expect(flow(page).getByRole("button", { name: "Start discovery", exact: true })).toBeDisabled();
  await expect(flow(page).getByText("https://dev.azure.example/fictional/operations/_workitems/edit/101", { exact: true })).not.toBeVisible();
  for (const width of [320, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await root(page).getByRole("button", { name: "Discard discovery draft", exact: true }).click();
  await expect(root(page)).toContainText("Discovery draft discarded");
  expect((await state(request)).discovery_receipts).toHaveLength(0);
});

test("Imported discovery creates a normal engagement with frozen unverified evidence and survives connector refresh", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await previewDiscovery(page);
  await flow(page).getByRole("textbox", { name: "Engagement title", exact: true }).fill("Investigate request quality");
  await flow(page).getByRole("textbox", { name: "Business objective", exact: true }).fill("Understand why fictional requests require clarification.");
  await reviewDiscovery(page);
  const frozen = (await state(request)).discovery_preview?.sources;
  await confirmDiscovery(page);
  await expect(page.getByRole("heading", { name: "Engagement overview", exact: true })).toBeVisible();
  await expect(page.locator("#discovery-overview")).toBeFocused();
  const current = await state(request);
  expect(current.discovery_receipts).toHaveLength(1);
  const id = current.discovery_receipts[0].engagement_id;
  await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("Investigate request quality");
  await page.getByRole("navigation", { name: "Discovery stages" }).getByRole("button", { name: "5. Evidence", exact: true }).click();
  await page.getByText("Current process sources", { exact: true }).click();
  await expect(page.getByText("SIMULATOR Azure DevOps #101: Reduce repeated access-request triage; synthetic, unverified", { exact: true })).toBeVisible();
  await expect(page.getByText(/Basis: self_reported \/ Review: not_reviewed/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const before = await request.get(`/api/v1/engagements/${id}`);
  const record: DiscoveryRecord = await before.json();
  const version = (await state(request)).version;
  expect((await request.post(`${API}/imports`, { data: { version, item_ids: [101] } })).ok()).toBe(true);
  const after: DiscoveryRecord = await (await request.get(`/api/v1/engagements/${id}`)).json();
  expect(after.sources.filter(source => source.id.startsWith("connector."))).toEqual(frozen);
  expect(after.version).toBe(record.version);
});

test("Imported discovery rejects stale previews after a source refresh", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await previewDiscovery(page);
  await reviewDiscovery(page);
  const current = await state(request);
  expect((await request.post(`${API}/imports`, { data: { version: current.version, item_ids: [101] } })).ok()).toBe(true);
  await confirmDiscovery(page);
  await expect(root(page).getByRole("alert")).toContainText("Discovery preview no longer exists");
  expect((await state(request)).discovery_receipts).toHaveLength(0);
  await root(page).getByRole("button", { name: "Refresh integration data", exact: true }).click();
  await expect(flow(page).getByRole("heading", { name: "Select work items", exact: true })).toBeVisible();
});

test("Imported discovery recovers a lost confirmation response without duplicating an engagement", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await previewDiscovery(page);
  await reviewDiscovery(page);
  let loseResponse = true;
  await page.route(`${API}/discovery/confirm`, async route => {
    if (!loseResponse) { await route.continue(); return; }
    loseResponse = false;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ status: 503, json: { detail: "Synthetic lost confirmation response" } });
  });
  await confirmDiscovery(page);
  await expect(root(page).getByRole("alert")).toContainText("Synthetic lost confirmation response");
  const first = (await state(request)).discovery_receipts[0].engagement_id;
  await confirmDiscovery(page);
  await expect(page.getByRole("heading", { name: "Engagement overview", exact: true })).toBeVisible();
  const receipts = (await state(request)).discovery_receipts;
  expect(receipts).toHaveLength(1);
  expect(receipts[0].engagement_id).toBe(first);
});

test("Imported discovery starts from Discovery, selects sources once and opens the edited engagement automatically", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
  await page.getByRole("button", { name: "Start discovery from connector", exact: true }).click();
  await expect(flow(page).getByRole("heading", { name: "Select work items", exact: true })).toBeVisible();
  const writes: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST") writes.push(new URL(request.url()).pathname);
  });
  await previewDiscovery(page);
  await flow(page).getByRole("textbox", { name: "Engagement title", exact: true }).fill("User-defined discovery");
  await reviewDiscovery(page);
  await expect(flow(page)).toContainText("User-defined discovery");
  await confirmDiscovery(page);
  await expect(page.locator("#discovery-overview")).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toHaveValue("User-defined discovery");
  expect(writes.filter(path => path === `${API}/discovery/prepare`)).toHaveLength(1);
  expect(writes.filter(path => path === `${API}/imports`)).toHaveLength(0);
  expect(writes.filter(path => path === `${API}/discovery/confirm`)).toHaveLength(1);
});

test("Imported discovery protects unsaved briefs and requires a fresh review after editing", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await previewDiscovery(page);
  const title = flow(page).getByRole("textbox", { name: "Engagement title", exact: true });
  await title.fill("Keep my unsaved investigation");
  page.once("dialog", dialog => dialog.dismiss());
  await root(page).getByRole("navigation", { name: "Integration areas" }).getByRole("button", { name: "Delivery handoff", exact: true }).click();
  await expect(title).toHaveValue("Keep my unsaved investigation");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(title).toHaveValue("Keep my unsaved investigation");
  await reviewDiscovery(page);
  const before = (await state(request)).discovery_preview;
  await flow(page).getByRole("checkbox", { name: /^I reviewed this brief/ }).check();
  await flow(page).getByRole("button", { name: "Edit brief", exact: true }).click();
  await title.fill("A revised user decision");
  await reviewDiscovery(page);
  const after = (await state(request)).discovery_preview;
  expect(after?.id).not.toBe(before?.id);
  expect(after?.digest).not.toBe(before?.digest);
  expect(after?.sources).toEqual(before?.sources);
  await expect(flow(page).getByRole("checkbox", { name: /^I reviewed this brief/ })).not.toBeChecked();
  await expect(flow(page).getByRole("button", { name: "Start discovery", exact: true })).toBeDisabled();
  expect((await state(request)).discovery_receipts).toHaveLength(0);
});

test("Imported discovery does not depend on approved assessment listing and separates delivery errors", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await page.route(/\/api\/v1\/home\?.*status=approved/, route =>
    route.fulfill({ status: 503, json: { detail: "Synthetic approved assessment listing unavailable" } }));
  await previewDiscovery(page);
  await reviewDiscovery(page);
  await area(page, "Delivery handoff");
  await expect(root(page).getByRole("alert")).toContainText("Synthetic approved assessment listing unavailable");
  await area(page, "Start discovery");
  await expect(flow(page).getByRole("heading", { name: "Review and edit your brief", exact: true })).toBeVisible();
  await expect(root(page).getByRole("alert")).toHaveCount(0);
});

test("Imported discovery keeps failed edits and can return to sources or resume without creating", async ({ page, request }) => {
  await configure(request);
  await open(page);
  await previewDiscovery(page);
  const title = flow(page).getByRole("textbox", { name: "Engagement title", exact: true });
  const savedTitle = await title.inputValue();
  await title.fill("Retain this edit when saving fails");
  await page.route(`${API}/discovery/brief`, route =>
    route.fulfill({ status: 503, json: { detail: "Synthetic brief save unavailable" } }));
  await flow(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("Synthetic brief save unavailable");
  await expect(title).toHaveValue("Retain this edit when saving fails");
  page.once("dialog", dialog => dialog.dismiss());
  await flow(page).getByRole("button", { name: "Back to sources", exact: true }).click();
  await expect(title).toHaveValue("Retain this edit when saving fails");
  page.once("dialog", dialog => dialog.accept());
  await flow(page).getByRole("button", { name: "Back to sources", exact: true }).click();
  await expect(flow(page).getByRole("checkbox", { name: /^101:/ })).toBeChecked();
  await flow(page).getByRole("button", { name: "Resume saved brief", exact: true }).click();
  await expect(title).toHaveValue(savedTitle);
  expect((await state(request)).discovery_receipts).toHaveLength(0);
});

import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LiveItem, LivePreview, LiveState } from "../src/azureDevOpsLive";
import { DISCOVERY_BRIEF_FIELDS } from "../src/components/ConnectorDiscovery";

const BASE = "/api/v1/connectors/azure-devops";
const PROJECT = "11111111-2222-4333-8444-555555555555";
const ACTOR = "a".repeat(64);
const SOURCE_TOKEN = "fictional-source-access-token-for-ui-tests";
let bundle = "";
let styles = "";
test.beforeAll(async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL("./fixtures/azure-devops-connector.tsx", import.meta.url))],
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic" });
  bundle = result.outputFiles[0].text;
  styles = readdirSync(fileURLToPath(new URL("../dist/assets", import.meta.url))).filter(name => name.endsWith(".css"))
    .map(name => `<link rel="stylesheet" href="/assets/${name}">`).join("");
});

function initial(): LiveState {
  return { mode: "read-only", version: "", identity_id: ACTOR, can_edit: false,
    permissions: { read: true, write: true, manage: true }, connection: null, preview: null, creation: null,
    receipts: [], activity: [], expires_at: "2099-12-01T10:00:00Z" };
}
function item(id = 101): LiveItem {
  return { id, title: "Investigate request triage", description: "Validate the current handling-time baseline.",
    item_type: "User Story", state: "Active", organization: "example-org", project_id: PROJECT,
    project_name: "Operations", revision: 3, changed_at: "2026-11-16T10:00:00Z",
    source_url: `https://dev.azure.com/example-org/${PROJECT}/_workitems/edit/${id}`, content_digest: "b".repeat(64) };
}
function preview(id = "22222222-2222-4222-8222-222222222222"): LivePreview {
  return { id, actor: ACTOR, digest: id.replace(/-/g, "").repeat(2), connection_revision: PROJECT,
    expires_at: "2099-12-01T10:00:00Z", items: [item()],
    sources: [{ id: "real-source-101", label: "Azure DevOps #101; imported, process claims unverified",
      statement: JSON.stringify({ snapshot: item() }), source_reference: item().source_url }],
    engagement: { title: "Discovery: Operations work items", objective: "Investigate work-item problems with the process owner.",
      business_units: "Unknown; validate.", sponsor: "Unknown; nominate.", engagement_owner: "Unknown; nominate.",
      required_topics: "Measure baseline.", excluded_topics: "No external writes.", success_measures: "Unknown; validate.",
      starts_on: "", ends_on: "", status: "planned", contributions: [], opportunities: [], assessment_ids: [] } };
}
const root = (page: Page) => page.getByRole("region", { name: "Azure DevOps connector", exact: true });

async function setup(page: Page, state = initial(), failPath = "") {
  const requests: { path: string; method: string; body: string; sourceCredential: string | undefined }[] = [];
  let version = 0;
  await page.route("**/connector-component-test", route => route.fulfill({ contentType: "text/html",
    body: `<!doctype html><html><head>${styles}</head><body><div id="root"></div><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>` }));
  await page.route("**/api/v1/connectors/azure-devops**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(BASE.length);
    requests.push({ path, method: request.method(), body: request.postData() || "",
      sourceCredential: request.headers()["x-azure-devops-token"] });
    expect(request.headers().authorization).toBe("Bearer fictional-app-access-token");
    if (path === failPath && failPath) return route.fulfill({ status: 503, json: { detail: "Synthetic source dependency unavailable" } });
    const body: Record<string, unknown> = request.postData() ? request.postDataJSON() : {};
    if (path === "/projects") return route.fulfill({ json: { items: [{ id: PROJECT, name: "Operations" }], next_cursor: "" } });
    if (path === "/connection") state = { ...state, version: String(++version),
      connection: { organization: "example-org", project_id: PROJECT, project_name: "Operations", revision: PROJECT } };
    if (path === "/items") return route.fulfill({ json: { items: [item()], next_before: null } });
    if (path === "/discovery/prepare") state = { ...state, version: String(++version), can_edit: true, preview: preview() };
    if (path === "/discovery/brief") {
      if (!state.preview || !body.brief || typeof body.brief !== "object") throw new Error("Invalid test brief request.");
      const saved = state.preview;
      state = { ...state, version: String(++version), preview: { ...saved,
        id: "33333333-3333-4333-8333-333333333333", digest: "c".repeat(64),
        engagement: { ...saved.engagement, ...body.brief } } };
    }
    if (path === "/discovery/confirm") {
      expect(body.confirmed).toBe(true);
      return route.fulfill({ json: { engagement_id: "created-discovery" } });
    }
    if (path === "/discovery/cancel") state = { ...state, version: String(++version), preview: null };
    if (path === "/disconnect") state = { ...initial(), version: String(++version) };
    await route.fulfill({ json: state });
  });
  await page.goto("/connector-component-test");
  await expect(root(page).getByRole("button", { name: "Connect Microsoft account", exact: true })).toBeEnabled();
  return requests;
}

async function connectAndConfigure(page: Page) {
  await root(page).getByRole("button", { name: "Connect Microsoft account", exact: true }).click();
  await root(page).getByRole("textbox", { name: "Azure DevOps organization", exact: true }).fill("https://dev.azure.com/example-org");
  await root(page).getByRole("button", { name: "Find projects", exact: true }).click();
  await root(page).getByRole("combobox", { name: "Project", exact: true }).selectOption(PROJECT);
  await root(page).getByRole("button", { name: "Save source connection", exact: true }).click();
  await expect(root(page)).toContainText("Source: example-org / Operations");
}

test("Real Azure DevOps configures, selects once, edits and explicitly creates without leaking credentials", async ({ page }) => {
  const requests = await setup(page);
  await connectAndConfigure(page);
  await root(page).getByRole("button", { name: "Read work items", exact: true }).click();
  await root(page).getByRole("checkbox", { name: /^101:/ }).check();
  await root(page).getByRole("button", { name: "Continue to brief", exact: true }).click();
  await root(page).getByRole("textbox", { name: "Engagement title", exact: true }).fill("User-owned real discovery");
  await root(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await expect(root(page)).toContainText("User-owned real discovery");
  await expect(root(page).getByText(item().source_url, { exact: true })).not.toBeVisible();
  await expect(root(page).getByRole("button", { name: "Start discovery", exact: true })).toBeDisabled();
  expect(requests.filter(request => request.path === "/discovery/confirm")).toHaveLength(0);
  await root(page).getByRole("checkbox", { name: /^I reviewed this brief/ }).check();
  await root(page).getByRole("button", { name: "Start discovery", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Opened discovery created-discovery" })).toBeVisible();
  expect(requests.filter(request => request.path === "/discovery/prepare")).toHaveLength(1);
  expect(requests.filter(request => request.path === "/discovery/confirm")).toHaveLength(1);
  expect(requests.every(request => !request.body.includes(SOURCE_TOKEN))).toBe(true);
  for (const request of requests) {
    expect(request.sourceCredential).toBe(["/projects", "/connection", "/items", "/discovery/prepare", "/discovery/confirm"].includes(request.path)
      ? SOURCE_TOKEN : undefined);
  }
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(SOURCE_TOKEN);
  expect(storage).not.toContain("fictional-app-access-token");
});

test("Real Azure DevOps keeps failed briefs, guards refresh and resets confirmation after edits", async ({ page }) => {
  const state = initial();
  state.connection = { organization: "example-org", project_id: PROJECT, project_name: "Operations", revision: PROJECT };
  state.preview = preview(); state.can_edit = true;
  await setup(page, state, "/discovery/brief");
  const title = root(page).getByRole("textbox", { name: "Engagement title", exact: true });
  await title.fill("Retain my unsaved investigation");
  await root(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("Synthetic source dependency unavailable");
  await expect(title).toHaveValue("Retain my unsaved investigation");
  page.once("dialog", dialog => dialog.dismiss());
  await root(page).getByRole("button", { name: "Refresh connector", exact: true }).click();
  await expect(title).toHaveValue("Retain my unsaved investigation");
  page.once("dialog", dialog => dialog.dismiss());
  await root(page).getByRole("button", { name: "Back to sources", exact: true }).click();
  await expect(title).toHaveValue("Retain my unsaved investigation");
  await expect(page.getByRole("status").filter({ hasText: "Harness ready / Unsaved" })).toBeVisible();
});

test("Real Azure DevOps rebinds a reviewed brief and requires a fresh acknowledgement", async ({ page }) => {
  const state = initial();
  state.connection = { organization: "example-org", project_id: PROJECT, project_name: "Operations", revision: PROJECT };
  state.preview = preview(); state.can_edit = true;
  await setup(page, state);
  await root(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await root(page).getByRole("checkbox", { name: /^I reviewed this brief/ }).check();
  await root(page).getByRole("button", { name: "Edit brief", exact: true }).click();
  await root(page).getByRole("textbox", { name: "Engagement title", exact: true }).fill("A revised investigation");
  await root(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await expect(root(page).getByRole("checkbox", { name: /^I reviewed this brief/ })).not.toBeChecked();
  await expect(root(page).getByRole("button", { name: "Start discovery", exact: true })).toBeDisabled();
});

test("Real Azure DevOps viewer controls and source errors remain explicit on narrow screens", async ({ page }) => {
  const state = initial();
  state.connection = { organization: "example-org", project_id: PROJECT, project_name: "Operations", revision: PROJECT };
  state.permissions = { read: true, write: false, manage: false };
  await setup(page, state, "/items");
  await root(page).getByRole("button", { name: "Connect Microsoft account", exact: true }).click();
  await root(page).getByRole("button", { name: "Read work items", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("Synthetic source dependency unavailable");
  await expect(root(page).getByRole("button", { name: "Continue to brief", exact: true })).toBeDisabled();
  await root(page).getByRole("button", { name: "Connection settings", exact: true }).click();
  await expect(root(page).getByRole("button", { name: "Save source connection", exact: true })).toBeDisabled();
  for (const width of [320, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 956 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Real Azure DevOps confirmation failure preserves the reviewed brief and requires acknowledgement again", async ({ page }) => {
  const state = initial();
  state.connection = { organization: "example-org", project_id: PROJECT, project_name: "Operations", revision: PROJECT };
  state.preview = preview(); state.can_edit = true;
  const requests = await setup(page, state, "/discovery/confirm");
  await root(page).getByRole("button", { name: "Connect Microsoft account", exact: true }).click();
  await root(page).getByRole("button", { name: "Review before starting", exact: true }).click();
  await root(page).getByRole("checkbox", { name: /^I reviewed this brief/ }).check();
  await root(page).getByRole("button", { name: "Start discovery", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("Synthetic source dependency unavailable");
  await expect(root(page)).toContainText("Discovery: Operations work items");
  await expect(root(page).getByRole("checkbox", { name: /^I reviewed this brief/ })).not.toBeChecked();
  await expect(root(page).getByRole("button", { name: "Start discovery", exact: true })).toBeDisabled();
  expect(requests.filter(request => request.path === "/discovery/confirm")).toHaveLength(1);
  await expect(page.getByRole("heading", { name: /Opened discovery/ })).toHaveCount(0);
});

test("Real Azure DevOps resumes a durable confirmed reservation without preparing or editing its sources", async ({ page }) => {
  const state = initial();
  state.connection = { organization: "example-org", project_id: PROJECT, project_name: "Operations", revision: PROJECT };
  state.creation = { preview: preview(), engagement_id: "created-discovery", confirmed_at: "2026-11-16T10:00:00Z" };
  const requests = await setup(page, state);
  const finish = root(page).getByRole("button", { name: "Finish creating discovery", exact: true });
  await expect(finish).toBeDisabled();
  await root(page).getByRole("button", { name: "Connect Microsoft account", exact: true }).click();
  await root(page).getByRole("button", { name: "Connection settings", exact: true }).click();
  await expect(root(page).getByRole("button", { name: "Save source connection", exact: true })).toBeDisabled();
  await finish.click();
  await expect(page.getByRole("heading", { name: "Opened discovery created-discovery" })).toBeVisible();
  expect(requests.filter(request => request.path === "/discovery/prepare")).toHaveLength(0);
  const confirmation = requests.filter(request => request.path === "/discovery/confirm");
  expect(confirmation).toHaveLength(1);
  expect(JSON.parse(confirmation[0].body)).toEqual({ preview_id: state.creation.preview.id,
    digest: state.creation.preview.digest, confirmed: true });
});

test("Real Azure DevOps entry is available to authenticated hosted users without exposing the simulator", async ({ page }) => {
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30, sign_in: null,
  } }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { identity: ACTOR, platform_access: true, can_review: false } }));
  await page.route(`**${BASE}`, route => route.fulfill({ json: initial() }));
  await page.goto("/workspace");
  await page.getByRole("textbox", { name: "Access token", exact: true }).fill("fictional-app-access-token");
  await page.getByRole("button", { name: "Connect securely", exact: true }).click();
  await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
  await page.getByRole("button", { name: "Start discovery from connector", exact: true }).click();
  await expect(root(page).getByRole("heading", { name: "Azure DevOps connector", exact: true })).toBeVisible();
  await expect(page.getByText("Local simulator only.", { exact: true })).toHaveCount(0);
  await root(page).getByRole("button", { name: "Connect Microsoft account", exact: true }).click();
  await expect(root(page).getByRole("alert")).toContainText("Sign in to AgentSpark with the Microsoft sign-in button");
  expect(DISCOVERY_BRIEF_FIELDS).toHaveLength(8);
});

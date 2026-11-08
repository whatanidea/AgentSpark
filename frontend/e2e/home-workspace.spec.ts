import { expect, test, type Page } from "@playwright/test";
import type { HomeItem, Organization, Team } from "../src/api";

const ORGANIZATIONS = /\/api\/v1\/organizations(?:\?.*)?$/;
const TEAMS = /\/api\/v1\/organizations\/[^/]+\/teams(?:\?.*)?$/;
const organizations: Organization[] = [
  { organization_id: "org-a", name: "Fictional Northbridge Bank", role: "member" },
  { organization_id: "org-b", name: "Fictional Harbor Bank", role: "member" },
];
const teams: Team[] = [
  { team_id: "team-a", name: "Onboarding team", permissions: ["read", "write"] },
  { team_id: "team-viewer", name: "Risk observers", permissions: ["read"] },
];
const filter = (page: Page) => page.getByRole("region", { name: "Workspace filter", exact: true });
const organization = (page: Page) => filter(page).getByRole("combobox", { name: "Workspace organization", exact: true });
const team = (page: Page) => filter(page).getByRole("combobox", { name: "Workspace team", exact: true });

async function setup(page: Page) {
  const scopes: string[] = [];
  await page.route(ORGANIZATIONS, route => route.fulfill({ json: { items: organizations, next_cursor: null } }));
  await page.route(/\/api\/v1\/organizations\/org-[ab]$/, route => route.fulfill({
    json: organizations.find(item => route.request().url().endsWith(item.organization_id)),
  }));
  await page.route(TEAMS, route => route.fulfill({ json: { items: teams, next_cursor: null } }));
  const item = (scope: string, discovery: boolean): HomeItem => ({
    kind: discovery ? "engagement" : "session", session_id: scope, analysis_id: null,
    title: `${scope} ${discovery ? "Discovery" : "Intake"}`, domain: "Fictional banking",
    status: "draft", score: null, updated_at: "2026-11-08T12:00:00Z",
    expires_at: "2026-12-08T12:00:00Z", sort_key: scope, legacy: false, can_delete: false,
  });
  await page.route(/\/api\/v1\/(?:home|engagements)(?:\?.*)?$/, route => {
    const headers = route.request().headers();
    const scope = headers["x-organization-id"] ? `${headers["x-organization-id"]}/${headers["x-team-id"]}` : "Personal";
    scopes.push(scope);
    return route.fulfill({ json: { items: [item(scope, route.request().url().includes("/engagements"))],
      next_cursor: null, archive_retention_days: 30 } });
  });
  return scopes;
}

test("Home workspace filter switches both libraries, preserves the selected library and supports read-only teams", async ({ page }) => {
  const scopes = await setup(page);
  await page.goto("/workspace");
  await expect(page.getByRole("tabpanel", { name: "Workflow library" })).toContainText("Personal Intake");
  await organization(page).selectOption("org-a");
  await expect(filter(page)).toContainText("Choose a team to switch");
  await expect(page.getByRole("tabpanel", { name: "Workflow library" })).toContainText("Personal Intake");
  expect(scopes.every(scope => scope === "Personal")).toBe(true);
  await team(page).selectOption("team-a");
  await expect(page.getByRole("tabpanel", { name: "Workflow library" })).toContainText("org-a/team-a Intake");
  await expect(page.getByRole("button", { name: /^Create workflow/ })).toBeEnabled();
  await page.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Discovery engagements", exact: true });
  await expect(panel).toContainText("org-a/team-a Discovery");
  await team(page).selectOption("team-viewer");
  await expect(page.getByRole("tab", { name: "Discovery engagements", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel).toContainText("org-a/team-viewer Discovery");
  await expect(panel).not.toContainText("org-a/team-a Discovery");
  await expect(page.getByRole("button", { name: /^New discovery engagement/ })).toBeDisabled();
  await page.getByRole("tab", { name: "Workflow library", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Workflow library" })).toContainText("org-a/team-viewer Intake");
  await expect(page.getByRole("button", { name: /^Create workflow/ })).toBeDisabled();
  await page.getByRole("tab", { name: "Discovery engagements", exact: true }).click();
  await organization(page).selectOption("");
  await expect(panel).toContainText("Personal Discovery");
  await expect(panel).not.toContainText("org-a/team-viewer Discovery");
  await expect(page.getByRole("button", { name: /^New discovery engagement/ })).toBeEnabled();
  await expect(team(page)).toBeDisabled();
  for (const width of [320, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Home workspace filter pages memberships and teams, retaining options after failed page loads", async ({ page }) => {
  await setup(page);
  let organizationFailure = true;
  let teamFailure = true;
  await page.route(ORGANIZATIONS, route => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor && organizationFailure) {
      organizationFailure = false;
      return route.fulfill({ status: 503, json: { detail: "Directory paging unavailable" } });
    }
    return route.fulfill({ json: { items: cursor ? organizations : [organizations[0]], next_cursor: cursor ? null : "more-organizations" } });
  });
  await page.route(TEAMS, route => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor && teamFailure) {
      teamFailure = false;
      return route.fulfill({ status: 503, json: { detail: "Team paging unavailable" } });
    }
    return route.fulfill({ json: { items: cursor ? teams : [teams[0]], next_cursor: cursor ? null : "more-teams" } });
  });
  await page.goto("/workspace");
  await filter(page).getByRole("button", { name: "Load more organizations" }).click();
  await expect(filter(page).getByRole("alert")).toContainText("503");
  await expect(organization(page).locator("option[value='org-a']")).toHaveCount(1);
  await filter(page).getByRole("button", { name: "Load more organizations" }).click();
  await expect(organization(page).locator("option[value='org-b']")).toHaveCount(1);
  await expect(organization(page).locator("option[value='org-a']")).toHaveCount(1);
  await organization(page).selectOption("org-a");
  await filter(page).getByRole("button", { name: "Load more teams" }).click();
  await expect(filter(page).getByRole("alert")).toContainText("503");
  await expect(team(page).locator("option[value='team-a']")).toHaveCount(1);
  await filter(page).getByRole("button", { name: "Load more teams" }).click();
  await expect(team(page).locator("option[value='team-viewer']")).toHaveCount(1);
  await expect(team(page).locator("option[value='team-a']")).toHaveCount(1);
  await team(page).selectOption("team-viewer");
  await expect(team(page)).toHaveValue("team-viewer");
  await expect(page.getByRole("button", { name: /^Create workflow/ })).toBeDisabled();
});

test("Home workspace filter distinguishes empty membership from loading and offers access management", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route(ORGANIZATIONS, async route => {
    await waiting;
    await route.fulfill({ json: { items: [], next_cursor: null } });
  });
  await page.goto("/workspace");
  await expect(filter(page).getByRole("status")).toContainText("Loading your organizations");
  await expect(filter(page).getByText(/No organization memberships yet/)).toHaveCount(0);
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await expect(page.getByLabel("Assessment model", { exact: true })).toHaveValue("demo");
  release();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(filter(page)).toContainText("No organization memberships yet");
  await expect(organization(page)).toBeEnabled();
  await expect(team(page)).toBeDisabled();
  await filter(page).getByRole("button", { name: "Manage access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizations & teams", exact: true })).toBeVisible();
});

test("Home workspace filter retries initial directory failures without switching to an unselected scope", async ({ page }) => {
  const scopes = await setup(page);
  let organizationFailure = true;
  let teamFailure = true;
  await page.route(ORGANIZATIONS, route => {
    if (organizationFailure) {
      organizationFailure = false;
      return route.fulfill({ status: 503, json: { detail: "Organization directory unavailable" } });
    }
    return route.fulfill({ json: { items: organizations, next_cursor: null } });
  });
  await page.route(TEAMS, route => {
    if (teamFailure) {
      teamFailure = false;
      return route.fulfill({ status: 503, json: { detail: "Team directory unavailable" } });
    }
    return route.fulfill({ json: { items: [], next_cursor: null } });
  });
  await page.goto("/workspace");
  await expect(filter(page).getByRole("alert")).toContainText("503");
  await expect(filter(page).getByText(/No organization memberships yet/)).toHaveCount(0);
  await filter(page).getByRole("button", { name: "Retry organizations" }).click();
  await organization(page).selectOption("org-a");
  await expect(filter(page).getByRole("alert")).toContainText("503");
  await expect(filter(page).getByText(/No accessible teams/)).toHaveCount(0);
  await filter(page).getByRole("button", { name: "Retry teams" }).click();
  await expect(filter(page)).toContainText("No accessible teams");
  await expect(page.getByRole("tabpanel", { name: "Workflow library" })).toContainText("Personal Intake");
  expect(scopes.every(scope => scope === "Personal")).toBe(true);
});

test("Home workspace filter ignores an old team response after choosing another organization", async ({ page }) => {
  const scopes = await setup(page);
  let release!: () => void;
  let returned!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const completed = new Promise<void>(resolve => { returned = resolve; });
  await page.route(TEAMS, async route => {
    if (route.request().url().includes("/org-a/")) {
      await waiting;
      await route.fulfill({ json: { items: teams, next_cursor: null } });
      returned();
    } else await route.fulfill({ json: { items: [{ ...teams[0], team_id: "team-b", name: "Harbor operations" }], next_cursor: null } });
  });
  await page.goto("/workspace");
  await organization(page).selectOption("org-a");
  await expect(filter(page).getByRole("status")).toContainText("Loading accessible teams");
  await organization(page).selectOption("org-b");
  await expect(team(page).locator("option[value='team-b']")).toHaveCount(1);
  release();
  await completed;
  await expect(team(page).locator("option[value='team-a']")).toHaveCount(0);
  await team(page).selectOption("team-b");
  await expect(page.getByRole("tabpanel", { name: "Workflow library" })).toContainText("org-b/team-b Intake");
  expect(scopes.some(scope => scope.startsWith("org-a/"))).toBe(false);
});

import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const MINUTE = 60_000;
const TOKEN = "fictional-inactivity-token";
const warning = (page: Page) => page.getByRole("alert", { name: "Inactivity warning" });
const login = (page: Page) => page.getByRole("heading", { name: "Organization access", exact: true });
const sessions: string[] = [];
test.afterEach(async ({ request }) => {
  for (const id of sessions.splice(0)) expect((await request.delete(`/api/v1/sessions/${id}`)).ok()).toBe(true);
});

async function connect(page: Page, installClock = true, session = "") {
  if (installClock) {
    await page.clock.install({ time: new Date("2026-11-07T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-07T12:00:01Z"));
  }
  await page.route("**/api/v1/auth/config", route => route.fulfill({ json: {
    mode: "oidc", retention_hours: 24, archive_retention_days: 30, sign_in: null,
  } }));
  await page.route("**/api/v1/auth/me", route => route.request().headers().authorization === `Bearer ${TOKEN}`
    ? route.fulfill({ json: { identity: "fictional-idle-user", can_review: true, platform_access: true } })
    : route.fulfill({ status: 401, json: { detail: "Test token required" } }));
  await page.goto("/workspace");
  if (session) await page.evaluate(id => sessionStorage.setItem("agentsense.session.v1",
    JSON.stringify({ session: id, identity: "fictional-idle-user", view: "home" })), session);
  await page.getByLabel("Access token", { exact: true }).fill(TOKEN);
  await page.getByRole("button", { name: "Connect securely", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
}

test("inactivity warns at four minutes and signs out at exactly five despite readiness polling", async ({ page }) => {
  await connect(page);
  await page.evaluate(() => sessionStorage.setItem("agentsense.session.v1",
    JSON.stringify({ session: "fictional-pointer", identity: "fictional-idle-user", view: "home" })));
  await page.clock.runFor(4 * MINUTE - 1);
  await expect(warning(page)).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(warning(page)).toContainText("1:00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.clock.runFor(MINUTE - 1);
  await expect(login(page)).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(login(page)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Signed out after 5 minutes" })).toBeVisible();
  await expect(page.getByLabel("Access token", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeDisabled();
});

test("inactivity Stay signed in and trusted keyboard activity restart the full timeout", async ({ page }) => {
  await connect(page);
  await page.clock.runFor(4 * MINUTE);
  await page.getByRole("button", { name: "Stay signed in", exact: true }).click();
  await expect(warning(page)).toHaveCount(0);
  await page.clock.runFor(4 * MINUTE - 1);
  await expect(warning(page)).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(warning(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(warning(page)).toHaveCount(0);
  await page.clock.runFor(5 * MINUTE);
  await expect(login(page)).toBeVisible();
});

test("inactivity rejects synthetic activity and catches up when a suspended tab resumes", async ({ page }) => {
  await connect(page);
  await page.clock.runFor(4 * MINUTE);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })));
  await expect(warning(page)).toBeVisible();
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(new Date(now + 20 * MINUTE));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(login(page)).toBeVisible();
});

test("inactivity ignores stationary pointer events when the warning changes layout", async ({ page }) => {
  await connect(page);
  await page.mouse.move(10, 10);
  await page.clock.runFor(4 * MINUTE);
  await expect(warning(page)).toBeVisible();
  await page.mouse.move(10, 10);
  await expect(warning(page)).toBeVisible();
  await page.clock.runFor(MINUTE);
  await expect(login(page)).toBeVisible();
});

test("inactivity actual pointer movement restarts the timeout", async ({ page }) => {
  await connect(page);
  await page.mouse.move(10, 10);
  await page.clock.runFor(4 * MINUTE);
  await expect(warning(page)).toBeVisible();
  await page.mouse.move(30, 30);
  await expect(warning(page)).toHaveCount(0);
  await page.clock.runFor(5 * MINUTE);
  await expect(login(page)).toBeVisible();
});

test("inactivity preserves an unsaved discovery draft without submitting it", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
  await page.getByRole("button", { name: "New discovery engagement", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Engagement title", exact: true });
  await title.fill("Fictional bank draft - never submitted");
  const writes: string[] = [];
  page.on("request", request => { if (request.method() !== "GET" && request.url().includes("/api/v1/")) writes.push(request.url()); });
  await page.clock.runFor(5 * MINUTE);
  await expect(warning(page)).toContainText("paused because you have unsaved work");
  await page.clock.fastForward(20 * MINUTE);
  await page.clock.runFor(50);
  await expect(title).toHaveValue("Fictional bank draft - never submitted");
  expect(writes).toEqual([]);
  await title.fill("");
  await expect(title).toHaveValue("");
  await page.clock.runFor(50);
  await expect(warning(page)).toHaveCount(0);
  await page.clock.runFor(5 * MINUTE);
  await expect(login(page)).toBeVisible();
});

test("inactivity protects ordinary intake fields as well as document drafts", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional bank intake");
  await page.clock.runFor(5 * MINUTE);
  await expect(warning(page)).toContainText("paused because you have unsaved work");
  await expect(page.getByLabel("Business Domain", { exact: true })).toHaveValue("Fictional bank intake");
  await page.getByLabel("Business Domain", { exact: true }).fill("");
  await page.clock.runFor(50 + 4 * MINUTE);
  await expect(warning(page)).toContainText("Automatic sign-out in");
  await page.clock.runFor(MINUTE);
  await expect(login(page)).toBeVisible();
});

test("inactivity protects workspace administration drafts without creating organizations", async ({ page }) => {
  await connect(page);
  const loaded = page.waitForResponse(response => /\/api\/v1\/organizations(?:\?.*)?$/.test(response.url()));
  await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
  await loaded;
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  await page.getByLabel("Organization name", { exact: true }).fill("Fictional unsaved bank");
  await page.clock.runFor(5 * MINUTE);
  await expect(warning(page)).toContainText("paused because you have unsaved work");
  await page.getByLabel("Organization name", { exact: true }).fill("");
  await page.clock.runFor(50 + 4 * MINUTE);
  await expect(warning(page)).toContainText("Automatic sign-out in");
  await page.clock.runFor(MINUTE);
  await expect(login(page)).toBeVisible();
});

for (const [view, field] of [
  ["2 · Diagnostic Interview", "Describe your workflow"],
  ["Evidence & assumptions", "Statement or question"],
  ["Implementation readiness", "Pilot scope"],
  ["4 · Blueprint & Review", "Review rationale"],
] as const) {
  test(`inactivity protects unsaved ${view} drafts`, async ({ page }) => {
    const id = randomUUID();
    const response = await page.request.post("/api/v1/intake", { data: {
      session_id: id, business_domain: "Fictional banking", team_size: "201-1000",
      existing_systems: "Fictional document system", pain_points: "Repeated checks",
      compliance_requirements: "High", target_cloud: "azure", demo_scenario: "invoice",
    } });
    expect(response.ok()).toBe(true);
    sessions.push(id);
    if (view === "4 · Blueprint & Review") {
      expect((await page.request.post(`/api/v1/analyze/${id}`)).ok()).toBe(true);
    }
    await connect(page, true, id);
    await page.getByRole("button", { name: view, exact: true }).click();
    const input = page.getByRole("textbox", { name: field, exact: true });
    await input.fill("Fictional unsaved draft");
    await page.clock.runFor(6 * MINUTE);
    await expect(warning(page)).toContainText("paused because you have unsaved work");
    await expect(input).toHaveValue("Fictional unsaved draft");
    await page.getByRole("button", { name: "Stay signed in", exact: true }).click();
    await expect(warning(page)).toHaveCount(0);
  });
}

test("inactivity does not override actual API token expiry even with unsaved work", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional expired draft");
  await page.route("**/ready", route => route.fulfill({ status: 401, json: { detail: "Expired test token" } }));
  await page.clock.runFor(30_000);
  await expect(login(page)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Access expired." })).toBeVisible();
});

test("inactivity ignores stale readiness responses after signing in again", async ({ page }) => {
  await connect(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let pending = false;
  await page.route("**/ready", async route => {
    if (pending) { await route.continue(); return; }
    pending = true;
    await held;
    await route.fulfill({ status: 401, json: { detail: "Old session response" } });
  });
  await page.clock.runFor(30_000);
  await expect.poll(() => pending).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Access token", { exact: true }).fill(TOKEN);
  await page.getByRole("button", { name: "Connect securely", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  const stale = page.waitForResponse(response => response.url().endsWith("/ready") && response.status() === 401);
  release();
  await stale;
  await page.clock.runFor(1);
  await expect(page.getByRole("status").filter({ hasText: "Access expired." })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
});

test("inactivity in one authenticated tab does not end another tab's session", async ({ page, context }) => {
  await connect(page);
  const other = await context.newPage();
  await connect(other, false);
  await other.getByRole("button", { name: "1 · Enterprise Intake", exact: true }).click();
  await other.getByLabel("Business Domain", { exact: true }).fill("Fictional other tab");
  await page.clock.runFor(5 * MINUTE);
  await expect(login(page)).toBeVisible();
  await expect(other.getByLabel("Business Domain", { exact: true })).toHaveValue("Fictional other tab");
});

test("inactivity excludes the unauthenticated shared local demo", async ({ page, context }) => {
  await connect(page);
  const demo = await context.newPage();
  await demo.goto("/workspace");
  await expect(demo.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await demo.clock.runFor(10 * MINUTE);
  await expect(warning(demo)).toHaveCount(0);
  await expect(demo.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.clock.runFor(5 * MINUTE);
  await expect(login(page)).toBeVisible();
  await expect(demo.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
});

test("inactivity waits for an active operation then signs out without resetting the deadline", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let pending = false;
  await page.route(/\/api\/v1\/organizations(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    pending = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Refresh organizations", exact: true }).click();
    await expect.poll(() => pending).toBe(true);
    await page.clock.runFor(5 * MINUTE);
    await expect(warning(page)).toContainText("waiting for the current operation");
    release();
    await expect(login(page)).toBeVisible();
  } finally { release(); }
});

test("inactivity preserves the exact deadline when an operation finishes half a second before expiry", async ({ page }) => {
  await connect(page);
  const loaded = page.waitForResponse(response => /\/api\/v1\/organizations(?:\?.*)?$/.test(response.url()));
  await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
  await loaded;
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let pending = false;
  await page.route(/\/api\/v1\/organizations(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    pending = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Refresh organizations", exact: true }).click();
    await expect.poll(() => pending).toBe(true);
    await page.clock.runFor(5 * MINUTE - 500);
    release();
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
    await page.clock.runFor(499);
    await expect(login(page)).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(login(page)).toBeVisible();
  } finally { release(); }
});

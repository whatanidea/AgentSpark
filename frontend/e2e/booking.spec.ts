import { expect, test, type Page } from "@playwright/test";

const event = "vienna-now-rdnzte/agentspark-consulting";
const prompt = `If not added, add mcp.cal.com/mcp, then book ${event}`;
const directUrl = `https://cal.com/${event}`;

async function openBooking(page: Page, path = "/consulting") {
  await page.goto(path);
  await page.getByRole("button", { name: "Book a consultation", exact: false }).first().click();
  const dialog = page.getByRole("dialog", { name: "A conversation. A clearer next step." });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Model only the external SDK boundary; tests never contact Cal.com or make bookings.
async function stubCalendar(page: Page, failure = false) {
  const requests: string[] = [];
  await page.route("https://app.cal.com/**", async route => {
    requests.push(route.request().url());
    if (new URL(route.request().url()).pathname === "/embed/embed.js") {
      await route.fulfill({ contentType: "application/javascript", body: `
        const cal = window.Cal;
        function connect(api) {
          const callbacks = {};
          function instruction(args) {
            const [action, options] = Array.from(args);
            if (action === "on") callbacks[options.action] = options.callback;
            if (action === "off") delete callbacks[options.action];
            if (action === "inline") {
              const container = options.elementOrSelector;
              container.dataset.config = JSON.stringify(options.config);
              container.dataset.forwardQueryParams = String(cal.config.forwardQueryParams);
              const frame = document.createElement("iframe");
              frame.title = "Book a call";
              const url = new URL("https://app.cal.com/" + options.calLink + "/embed");
              Object.entries(options.config).forEach(([key, value]) => url.searchParams.set(key, value));
              frame.src = url.toString();
              frame.addEventListener("load", () => callbacks["${failure ? "linkFailed" : "linkReady"}"]?.());
              container.append(frame);
            }
          }
          api.q.forEach(instruction);
          api.q.push = (...items) => { items.forEach(instruction); return api.q.length; };
        }
        Object.values(cal.ns).forEach(connect);
      ` });
    } else {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><h1>Test calendar: no bookings</h1><button>Calendar control</button></body></html>" });
    }
  });
  return requests;
}

test("booking is consent-gated, uses the supplied event and never forwards page state", async ({ page }) => {
  const requests = await stubCalendar(page);
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.method());
  });
  const dialog = await openBooking(page, "/consulting?token=private-test-token&invite=private-invite#private-assessment");
  await expect(dialog.getByRole("button", { name: "Close consultation booking" })).toBeFocused();
  await expect(dialog).toContainText("which processes scheduling details");
  await expect(dialog).toContainText("Do not include passwords");
  await expect(dialog.getByRole("link", { name: "Book directly on Cal.com", exact: false })).toHaveAttribute("href", directUrl);
  await expect(dialog.getByRole("link", { name: "Book directly on Cal.com", exact: false })).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(requests).toEqual([]);
  await dialog.getByRole("button", { name: "Open calendar", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Choose a consultation time", exact: true })).toBeFocused();
  const calendar = dialog.getByRole("region", { name: "Cal.com consultation calendar" });
  await expect(calendar.locator("iframe")).toHaveCount(1);
  await expect(dialog.getByRole("status").filter({ hasText: "Loading the Cal.com" })).toHaveCount(0);
  await expect(calendar).toHaveAttribute("data-forward-query-params", "false");
  await expect(calendar).toHaveAttribute("data-config", JSON.stringify({
    layout: "month_view", useSlotsViewOnSmallScreen: "true", theme: "light",
  }));
  const iframe = new URL((await calendar.locator("iframe").getAttribute("src"))!);
  expect(iframe.pathname).toBe(`/${event}/embed`);
  expect(iframe.searchParams.get("layout")).toBe("month_view");
  expect(requests.every(url => !/private-|token=|invite=/.test(url))).toBe(true);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
  await dialog.getByRole("button", { name: "Close consultation booking" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Book a consultation", exact: false }).first()).toBeFocused();
  await page.getByRole("button", { name: "Book a consultation", exact: false }).first().click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Open calendar", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(requests.filter(url => url.endsWith("/embed/embed.js"))).toHaveLength(1);
  await page.getByRole("button", { name: "Close consultation booking" }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("assistant instructions copy locally with truthful confirmation and no scheduling requests", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const requests = await stubCalendar(page);
  const dialog = await openBooking(page, "/");
  await expect(dialog.getByRole("textbox", { name: "Booking instructions" })).toHaveValue(prompt);
  await dialog.getByRole("button", { name: "Copy instructions for your AI assistant" }).click();
  await expect(dialog.getByRole("status")).toContainText("Nothing has been booked or connected");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  expect(requests).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "The platform brings clarity. Consulting moves the work forward.", exact: true })
    .getByRole("button", { name: "Book a consultation", exact: false })).toBeFocused();
});

for (const mode of ["denied", "unavailable"] as const) {
  test(`clipboard ${mode} exposes an actionable manual-copy fallback`, async ({ page }) => {
    await page.addInitScript(mode => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "unavailable" ? undefined : {
        writeText: async () => { throw new DOMException("Permission denied", "NotAllowedError"); },
      } });
    }, mode);
    const dialog = await openBooking(page);
    await dialog.getByRole("button", { name: "Copy instructions for your AI assistant" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Copy did not succeed");
    const instructions = dialog.getByRole("textbox", { name: "Booking instructions" });
    await instructions.focus();
    expect(await instructions.evaluate((element: HTMLTextAreaElement) => element.value.substring(element.selectionStart, element.selectionEnd))).toBe(prompt);
    await expect(dialog.getByRole("status")).not.toContainText("Copied");
  });
}

test("calendar failures and blocked scripts retain direct booking and explicit error feedback", async ({ page }) => {
  await stubCalendar(page, true);
  let dialog = await openBooking(page);
  await dialog.getByRole("button", { name: "Open calendar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Cal.com could not load");
  await expect(dialog.getByRole("link", { name: "Book directly on Cal.com", exact: false })).toHaveAttribute("href", directUrl);

  await page.unrouteAll();
  await page.route("https://app.cal.com/**", route => route.abort());
  await page.clock.install();
  dialog = await openBooking(page);
  const request = page.waitForRequest("https://app.cal.com/embed/embed.js");
  await dialog.getByRole("button", { name: "Open calendar", exact: true }).click();
  await request;
  await page.clock.fastForward(20001);
  await expect(dialog.getByRole("alert")).toContainText("taking longer than expected");
  await expect(dialog.getByRole("link", { name: "Book directly on Cal.com", exact: false })).toHaveAttribute("href", directUrl);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("dialog traps keyboard focus, fits mobile/reduced motion and closes on history navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "Explore consulting", exact: false }).click();
  const trigger = page.getByRole("button", { name: "Book a consultation", exact: false }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("textbox", { name: "Booking instructions" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close consultation booking" })).toBeFocused();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.height).toBeLessThanOrEqual(900);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const button of await dialog.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await dialog.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length)).toBe(0);
  }
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.goForward();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

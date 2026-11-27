import { expect, test, type Page } from "@playwright/test";
import { expectReadable } from "./appearance";

const root = (page: Page) => page.getByRole("region", { name: "Conversation workspace", exact: true });
const composer = (page: Page) => root(page).getByRole("textbox", { name: "Message Kaisersol", exact: true });
const send = (page: Page) => root(page).getByRole("button", { name: "Send message", exact: false });
const unique = () => Date.now().toString(36);
async function expandHistory(page: Page) {
  if (!await root(page).getByRole("textbox", { name: "Search loaded conversations" }).isVisible()) {
    await root(page).locator(".chat-history > summary").click();
  }
}
async function open(page: Page) {
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(root(page).getByRole("button", { name: "+ New conversation", exact: true })).toBeEnabled();
  await expect(root(page).getByRole("heading", { name: "What could work better?", exact: true })).toBeVisible();
  expect(await root(page).locator(".chat-thread").evaluate(element => element.scrollTop)).toBe(0);
}
async function message(page: Page, text = "Explore discovery opportunities across our onboarding process.") {
  await composer(page).fill(text);
  await send(page).click();
  await expect(root(page).getByRole("article", { name: "Kaisersol response", exact: true })).toBeVisible();
  await expect(send(page)).toBeDisabled();
}
async function discoveryReview(page: Page) {
  await root(page).getByRole("button", { name: "Start Discovery", exact: true }).click();
  const review = root(page).getByRole("region", { name: "Discovery context preview", exact: true });
  await expect(review).toBeVisible();
  await review.getByLabel(/^Engagement title/).fill("Chat onboarding exploration");
  await review.getByLabel(/^Objective/).fill("Understand manual handoffs.");
  await review.getByLabel(/^Business units/).fill("Operations");
  await review.getByLabel(/^Sponsor/).fill("Operations sponsor");
  await review.getByLabel(/^Engagement owner/).fill("Process lead");
  await expect(review.getByLabel(/^Engagement title/)).toHaveValue("Chat onboarding exploration");
  return review;
}

test("Conversation workspace shares the work-story identity in both themes without creating chats or losing composer input", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/conversations") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.method());
  });
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Explore in Chat" }).click();
  await expect(root(page).locator(".chat-journey [aria-current=step]")).toHaveText("01Explore");
  await composer(page).fill("An unsent fictional design check");
  for (const theme of ["dark", "light"]) {
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
    await expect(composer(page)).toHaveValue("An unsent fictional design check");
    await expect(root(page)).toHaveCSS("background-color", theme === "dark" ? "rgb(22, 32, 33)" : "rgb(252, 253, 249)");
    await expect(root(page).locator(".chat-orb")).toHaveCSS("color", theme === "dark" ? "rgb(193, 253, 127)" : "rgb(48, 93, 62)");
    await expectReadable(root(page));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 956 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px`).toBe(true);
    }
  }
  expect(writes).toEqual([]);
});

test("Conversation workspace offers a modern private thread, real progress and saved history without browser transcript storage", async ({ page }) => {
  await open(page);
  const text = `CHAT-PRIVATE-CONTENT-${unique()} Explore discovery opportunities.`;
  await composer(page).fill(text);
  await send(page).click();
  await expect(root(page).getByRole("progressbar", { name: "Response progress" })).toBeVisible();
  await expect(root(page).getByRole("article", { name: "Your message", exact: true })).toContainText(text);
  await expect(root(page).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  await expect(root(page).getByRole("article", { name: "Kaisersol response", exact: true })).toBeVisible();
  await expect(root(page).getByRole("progressbar")).toHaveCount(0);
  await expect(root(page).getByRole("region", { name: "Suggested next step" })).toContainText("Discovery");
  const storage = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  expect(storage).not.toContain("CHAT-PRIVATE-CONTENT");
  expect(storage).not.toContain("scripted response");
  await page.reload();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expandHistory(page);
  await root(page).getByRole("button", { name: new RegExp(text.slice(0, 30)) }).click();
  await expect(root(page).getByRole("article", { name: "Your message", exact: true })).toContainText(text);
});

test("Conversation workspace creates Discovery only after an edited, saved and acknowledged review", async ({ page }) => {
  let confirmations = 0;
  await page.route("**/api/v1/conversations/*/confirm", route => { confirmations++; return route.continue(); });
  await open(page); await message(page);
  const currentStep = root(page).locator(".chat-journey [aria-current=step]");
  await expect(currentStep).toContainText("Review a next step");
  await root(page).getByRole("button", { name: /Identify the people involved/ }).click();
  await expect(composer(page)).toHaveValue("Who should we hear from before we scope discovery?");
  await composer(page).fill("");
  expect(confirmations).toBe(0);
  const review = await discoveryReview(page);
  const create = review.getByRole("button", { name: "Create Discovery", exact: true });
  await expect(create).toBeDisabled();
  await expect(review.getByRole("checkbox")).toBeDisabled();
  await review.getByRole("button", { name: "Save reviewed preview" }).click();
  await expect(review.getByRole("checkbox")).toBeEnabled();
  await review.getByRole("checkbox").check();
  await expect(review).toContainText("Deleting this private chat does not delete the copied context");
  expect(confirmations).toBe(0);
  const completion = page.waitForResponse(response => response.url().endsWith("/confirm"));
  await create.click();
  const saved = await (await completion).json();
  expect(saved.link.kind).toBe("discovery");
  await expect(currentStep).toContainText("Discovery");
  expect(confirmations).toBe(1);
  await expect(root(page).getByRole("button", { name: "Open Discovery", exact: true })).toBeVisible();
  const load = page.waitForResponse(response => response.url().endsWith(`/engagements/${saved.link.workflow_id}`));
  await root(page).getByRole("button", { name: "Open Discovery", exact: true }).click();
  const record = await (await load).json();
  expect(record.engagement.title).toBe("Chat onboarding exploration");
  expect(record.engagement.assessment_ids).toEqual([]);
  await expect(page.getByRole("button", { name: "Discovery engagements", exact: true })).toHaveAttribute("aria-current", "step");
});

test("Conversation workspace supports direct Enterprise Intake without inventing unknown team size or compliance", async ({ page }) => {
  await open(page); await message(page, "Start Enterprise Intake for a known workflow.");
  await root(page).getByRole("button", { name: "Start Enterprise Intake", exact: true }).click();
  const review = root(page).getByRole("region", { name: "Enterprise Intake context preview", exact: true });
  await expect(review.getByLabel(/^Team size/)).toHaveValue("");
  await expect(review.getByLabel(/^Compliance requirements/)).toHaveValue("");
  await expect(review.getByLabel(/^Target cloud/)).toHaveValue("");
  await review.getByLabel(/^Business domain/).fill("Operations");
  await review.getByLabel(/^Team size/).selectOption("51-200");
  await review.getByLabel(/^Compliance requirements/).selectOption("High");
  await review.getByLabel(/^Target cloud/).selectOption("azure");
  await review.getByLabel(/^Existing systems/).fill("CRM");
  await review.getByLabel(/^Pain points/).fill("Manual routing and missing handoffs.");
  await review.getByRole("button", { name: "Save reviewed preview" }).click();
  await expect(review.getByRole("checkbox")).toBeEnabled();
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "Create Enterprise Intake", exact: true }).click();
  await root(page).getByRole("button", { name: "Open Enterprise Intake", exact: true }).click();
  await expect(page.getByText("Reviewed chat context (unverified)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1 · Enterprise Intake", exact: true })).toHaveAttribute("aria-current", "step");
});

test("Conversation workspace lets the member dismiss suggestions and choose an alternative manually", async ({ page }) => {
  await open(page); await message(page);
  await root(page).getByRole("button", { name: "Not now", exact: true }).click();
  await expect(root(page).getByRole("region", { name: "Suggested next step" })).toHaveCount(0);
  await root(page).getByRole("button", { name: "Review Enterprise Intake preview", exact: true }).click();
  await expect(root(page).getByRole("region", { name: "Enterprise Intake context preview", exact: true })).toBeVisible();
  await expect(root(page).getByRole("button", { name: "Create Enterprise Intake", exact: true })).toBeDisabled();
});

test("Conversation workspace stops an active response or safely keeps a just-completed reply without duplicating the message", async ({ page }) => {
  await open(page);
  await composer(page).fill("Explore discovery opportunities in our team.");
  const created = page.waitForResponse(response => response.url().endsWith("/conversations") && response.request().method() === "POST");
  await send(page).click();
  const chat = await (await created).json();
  const stop = root(page).getByRole("button", { name: "Stop response", exact: true });
  await expect(stop).toBeEnabled();
  await Promise.race([
    stop.click(),
    root(page).getByRole("article", { name: "Kaisersol response", exact: true }).waitFor(),
  ]);
  await expect(root(page).getByRole("progressbar")).toHaveCount(0);
  const persisted = await page.request.get(`/api/v1/conversations/${chat.id}`);
  expect(persisted.ok()).toBe(true);
  const saved = await persisted.json();
  expect(saved.pending).toBeNull();
  if (!saved.messages.some((message: { role: string }) => message.role === "assistant")) {
    await expect(root(page).getByRole("button", { name: "Retry last response", exact: true })).toBeVisible();
    await expect(root(page).getByRole("article", { name: "Kaisersol response", exact: true })).toHaveCount(0);
    await root(page).getByRole("button", { name: "Retry last response", exact: true }).click();
  }
  await expect(root(page).getByRole("article", { name: "Kaisersol response", exact: true })).toBeVisible();
  await expect(root(page).getByRole("article", { name: "Your message", exact: true })).toHaveCount(1);
});

test("Conversation workspace preserves unsent drafts when navigation is cancelled", async ({ page }) => {
  await open(page);
  await composer(page).fill("An unsent private thought.");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(composer(page)).toHaveValue("An unsent private thought.");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(root(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(composer(page)).toHaveValue("");
});

test("Conversation workspace can rename, search and delete a saved private conversation", async ({ page }) => {
  await open(page); await message(page, "A discussion about process uncertainty.");
  const title = `Reviewed conversation ${unique()}`;
  await root(page).getByRole("button", { name: "Rename", exact: true }).click();
  await root(page).getByLabel("Conversation title", { exact: true }).fill(title);
  await root(page).getByRole("button", { name: "Save title", exact: true }).click();
  await expandHistory(page);
  await root(page).getByRole("textbox", { name: "Search loaded conversations" }).fill(title);
  await expect(root(page).getByRole("button", { name: new RegExp(title) })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await root(page).getByRole("button", { name: "Delete chat", exact: true }).click();
  await expect(root(page).getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  await expect(root(page)).toContainText("No matches in loaded history");
});

test("Conversation workspace exposes incomplete stream failures without a false saved reply", async ({ page }) => {
  await open(page);
  await page.route("**/api/v1/conversations/*/messages", route => route.fulfill({
    contentType: "application/x-ndjson", body: '{"kind":"delta","text":"Unconfirmed partial reply"}\n',
  }));
  await composer(page).fill("A message whose response is interrupted.");
  await send(page).click();
  await expect(root(page).getByRole("alert")).toContainText("interrupted");
  await expect(root(page).getByRole("article", { name: "Kaisersol response", exact: true })).toHaveCount(0);
  await expect(root(page)).not.toContainText("Unconfirmed partial reply");
  await expect(composer(page)).toHaveValue("A message whose response is interrupted.");
});

test("Conversation workspace fits the viewport in dark and light appearance and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page); await message(page);
  const dark = await root(page).evaluate(element => getComputedStyle(element).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  const light = await root(page).evaluate(element => getComputedStyle(element).backgroundColor);
  expect(dark).not.toBe(light);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await composer(page).focus();
  await expect(composer(page)).toBeFocused();
});

test("Conversation workspace clears an expired open transcript without waiting for a reload", async ({ page }) => {
  await page.clock.install();
  await open(page);
  const text = "A private process discussion that must disappear on expiry.";
  await message(page, text);
  await page.clock.setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
  await page.clock.fastForward(60001);
  await expect(root(page).getByRole("alert")).toContainText("fixed expiry");
  await expect(root(page).getByRole("article", { name: "Your message", exact: true })).toHaveCount(0);
  await expect(root(page)).not.toContainText(text);
});

test("Conversation workspace disables workflow launches for a read-only chat while leaving conversation available", async ({ page }) => {
  await page.route("**/api/v1/conversations/*/messages", async route => {
    const response = await route.fetch();
    const lines = (await response.text()).trim().split("\n").map(line => {
      const event = JSON.parse(line);
      if (event.kind === "result") event.data.can_create = false;
      return JSON.stringify(event);
    });
    await route.fulfill({ contentType: "application/x-ndjson", body: lines.join("\n") + "\n" });
  });
  await open(page); await message(page);
  await expect(root(page).getByRole("button", { name: "Start Discovery", exact: true })).toBeDisabled();
  await expect(root(page).getByRole("button", { name: "Review Enterprise Intake preview", exact: true })).toBeDisabled();
  await expect(root(page)).toContainText("Read-only workspace");
  await expect(composer(page)).toBeEnabled();
});

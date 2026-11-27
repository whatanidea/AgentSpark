import { expect, test } from "@playwright/test";

test("public Sign in opens the app workspace without forwarding the marketing URL", async ({ page, baseURL }) => {
  await page.route("https://www.kaisersol.com/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href });
    await route.fulfill({ response });
  });
  await page.route("https://app.kaisersol.com/**", route => route.fulfill({ contentType: "text/html", body: "Workspace" }));
  await page.goto("https://www.kaisersol.com/?campaign=example#top");
  await page.getByRole("button", { name: /^(Sign in|Workspace)$/ }).first().click();
  await expect(page).toHaveURL("https://app.kaisersol.com/workspace");
});

test("only the app hostname redirects its root to the workspace", async ({ request }) => {
  const app = await request.get("/", { headers: { Host: "app.kaisersol.com" }, maxRedirects: 0 });
  expect(app.status()).toBe(307);
  expect(app.headers().location).toBe("/workspace");
  expect((await request.get("/", { headers: { Host: "www.kaisersol.com" }, maxRedirects: 0 })).status()).toBe(200);
});

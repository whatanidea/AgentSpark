import { expect, test } from "@playwright/test";

test("live intake requires an explicit approved model and sends its ID before interviewing", async ({ page }) => {
  await page.route("**/api/v1/models", route => route.fulfill({ json: {
    mode: "live", items: [
      { id: "azure-openai", label: "Azure OpenAI / gpt-5-mini", available: true, reason: "", definition: null },
      { id: "foundry-claude-haiku", label: "Anthropic on Azure Foundry / claude-haiku-5-5",
        available: true, reason: "", definition: null },
    ],
  } }));
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/v1/intake", route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { detail: "Fictional backend failure; no provider was called." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional model-selection test");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("aws");
  const submit = page.getByRole("button", { name: "Submit Intake", exact: true });
  await expect(submit).toBeDisabled();
  const selector = page.getByLabel("Assessment model", { exact: true });
  await selector.selectOption("foundry-claude-haiku");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("Fictional backend failure");
  expect(submitted).toMatchObject({ model_id: "foundry-claude-haiku", target_cloud: "aws" });
  expect(submitted).not.toHaveProperty("api_key");
  expect(await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1"))).toBeNull();
});

test("an unavailable Claude connection cannot be selected and catalog failures block intake", async ({ page }) => {
  await page.route("**/api/v1/models", route => route.fulfill({ json: {
    mode: "live", items: [
      { id: "azure-openai", label: "Azure OpenAI / gpt-5-mini", available: true, reason: "", definition: null },
      { id: "foundry-claude-haiku", label: "Claude Haiku (Azure Foundry)", available: false,
        reason: "Coming soon. Continue with Azure OpenAI.", definition: null },
    ],
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  const claudeOption = page.getByRole("option", { name: "Claude Haiku (Azure Foundry) — Coming soon" });
  await expect(claudeOption).toHaveJSProperty("disabled", true);
  await expect(claudeOption).toHaveAttribute("title", "Coming soon");
  const preview = page.getByRole("group", { name: "Claude Haiku (Azure Foundry) — Coming soon" });
  await expect(preview).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await preview.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Coming soon. Continue with Azure OpenAI.");
  await page.getByRole("heading", { name: "Enterprise Context", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toBeHidden();
  await preview.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  const selector = page.getByLabel("Assessment model", { exact: true });
  await selector.focus();
  await selector.press("Home");
  await selector.press("ArrowDown");
  await selector.press("ArrowDown");
  await expect(selector).not.toHaveValue("foundry-claude-haiku");
  await selector.selectOption("azure-openai");
  await page.getByLabel("Business Domain", { exact: true }).fill("Fictional credit-funded workflow");
  await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
  await expect(page.getByRole("button", { name: "Submit Intake", exact: true })).toBeEnabled();
  await page.route("**/api/v1/models", route => route.fulfill({ status: 503, json: { detail: "Catalog unavailable." } }));
  await page.reload();
  await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
  await expect(page.getByRole("alert")).toContainText("Model catalog could not be loaded");
  await expect(page.getByRole("button", { name: "Submit Intake", exact: true })).toBeDisabled();
});

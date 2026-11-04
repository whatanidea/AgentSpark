import { expect, test } from "@playwright/test";

let disposableEngagement = "";
test.afterEach(async ({ request }) => {
  if (!disposableEngagement) return;
  const response = await request.get(`/api/v1/engagements/${disposableEngagement}`);
  if (response.ok()) {
    const current = await response.json();
    expect((await request.delete(`/api/v1/engagements/${disposableEngagement}?${new URLSearchParams({ version: current.version })}`)).ok()).toBe(true);
  }
  disposableEngagement = "";
});

test("guided discovery keeps drafts across stages and exports standalone non-AI findings", async ({ page }, testInfo) => {
  const title = `Fictional guided discovery ${testInfo.project.name}`;
  const created = await page.request.post("/api/v1/engagements", { data: { engagement: {
    title, objective: "Understand adoption constraints",
    business_units: "Fictional operations", sponsor: "Fictional sponsor", engagement_owner: "Fictional consultant",
    playbook_id: "ai_native_readiness", playbook_answers: { data: "Unconfirmed: data rules not supplied" },
  } } });
  expect(created.ok()).toBe(true);
  const record = await created.json();
  try {
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Engagement overview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI-native readiness discussion guide", exact: true })).toBeVisible();
    const guideQuestion = page.getByLabel("Which business outcomes should AI adoption support?", { exact: false });
    await guideQuestion.fill("Preserve this unsaved facilitator response");
    const navigation = page.getByRole("navigation", { name: "Discovery stages" });
    await navigation.getByRole("button", { name: "3. People & inputs", exact: true }).click();
    await expect(page.locator("#discovery-people")).toBeFocused();
    await navigation.getByRole("button", { name: "4. Evidence", exact: true }).click();
    await expect(page.locator("#discovery-evidence")).toBeFocused();
    await navigation.getByRole("button", { name: "1. Overview", exact: true }).click();
    await expect(guideQuestion).toHaveValue("Preserve this unsaved facilitator response");
    await expect(page.getByRole("button", { name: "Export discovery findings PDF", exact: true })).toBeDisabled();
    await expect(page.getByText("Overview reflects the last saved record.", { exact: false })).toBeVisible();
    await navigation.getByRole("button", { name: "6. Findings", exact: true }).click();
    await expect(page.locator("#discovery-findings")).toBeFocused();
    await page.getByLabel("Discovery conclusion", { exact: true }).selectOption("improve_process");
    await page.getByLabel("Conclusion rationale and proposed next steps", { exact: true }).fill("Clarify ownership before buying AI tools.");
    await page.getByRole("button", { name: "Save discovery engagement", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Discovery saved." })).toBeVisible();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export discovery findings PDF", exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("AgentSpark_Discovery_Findings.pdf");
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Findings download unavailable");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe("%PDF-");
    const saved = await (await page.request.get(`/api/v1/engagements/${record.id}`)).json();
    expect(saved.assessments).toEqual([]);
    expect(saved.engagement.discovery_outcome).toBe("improve_process");
    const report = await (await page.request.get(`/api/v1/engagements/${record.id}/findings?${new URLSearchParams({ version: saved.version })}`)).json();
    expect(report.conclusion.outcome).toBe("Improve the process first");
    expect(report.synthesis_status).toBe("not_generated");
    expect(report.overview.unanswered_prompts).toContain("What data may be used, and which privacy, residency and access rules need validation?");
    for (const width of [320, 390, 440, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await navigation.getByRole("button", { name: "1. Overview", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByLabel("Discovery playbook", { exact: true }).selectOption("workflow_opportunity");
    await expect(page.getByLabel("Discovery playbook", { exact: true })).toHaveValue("ai_native_readiness");
    await expect(guideQuestion).toHaveValue("Preserve this unsaved facilitator response");
    const updated = await page.request.put(`/api/v1/engagements/${record.id}`, {
      data: { version: saved.version, engagement: { ...saved.engagement, status: "active" } },
    });
    expect(updated.ok()).toBe(true);
    await page.getByRole("button", { name: "Export discovery findings PDF", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("409");
  } finally {
    disposableEngagement = record.id;
  }
});

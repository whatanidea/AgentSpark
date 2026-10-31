import { expect, test } from "@playwright/test";

test("source-linked hypotheses have explicit priorities and reviewed unverified assessment handoff", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let engagement = "";
  let child = "";
  try {
    const created = await page.request.post("/api/v1/engagements", { data: { engagement: {
      title: "Fictional selling workflow", objective: "Find duplicate reviews", business_units: "Finance",
      sponsor: "Fictional sponsor", engagement_owner: "Fictional owner",
      contributions: [{ id: crypto.randomUUID(), role: "business_operator", statement: "Fictional duplicate invoice checks." }],
    } } });
    expect(created.ok()).toBe(true);
    engagement = (await created.json()).id;
    await page.goto("/");
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
    await page.getByRole("button", { name: "Fictional selling workflow", exact: true }).click();
    await expect(page.getByText("Fixed 30 days", { exact: false })).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Renew engagement for 30 days", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "explicitly renewed" })).toBeVisible();
    await page.getByRole("button", { name: "Generate discovery synthesis", exact: true }).click();
    await expect(page.getByText("Generated opportunity hypotheses", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add candidate for review", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add candidate for review", exact: true })).toBeDisabled();
    const current = await (await page.request.get(`/api/v1/engagements/${engagement}`)).json();
    const opportunity = current.engagement.opportunities[0].id;
    await page.getByRole("combobox", { name: "Opportunity to review", exact: true }).selectOption(opportunity);
    await expect(page.getByText("Not ranked", { exact: false })).toBeVisible();
    for (const [name, value] of Object.entries({
      "Business value": "5", Feasibility: "4", "Evidence confidence": "3",
      "Risk (1 low, 5 high)": "2", "Delivery effort (1 low, 5 high)": "1",
    })) await page.getByRole("combobox", { name, exact: true }).selectOption(value);
    await page.getByRole("textbox", { name: "Priority rating rationale", exact: true }).fill("Fictional assessor assumptions; not verified savings.");
    await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Save priority assumptions", exact: true }).click();
    await expect(page.getByText("80/100", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Select opportunity for assessment", exact: true }).click();
    await page.getByRole("combobox", { name: "Assessment target cloud", exact: true }).selectOption("azure");
    const creating = page.waitForResponse(response => response.url().endsWith("/handoff") && response.request().method() === "POST");
    await page.getByRole("checkbox", { name: /^I reviewed this hypothesis/ }).check();
    await page.getByRole("button", { name: "Create or resume assessment handoff", exact: true }).click();
    const handoff = await creating;
    expect(handoff.ok()).toBe(true);
    child = (await handoff.json()).session_id;
    await expect(page.getByText(/^Discovery origin:/)).toBeVisible();
    const snapshot = await (await page.request.get(`/api/v1/sessions/${child}`)).json();
    expect(snapshot.interview_answers).toEqual({});
    expect(snapshot.workflow_intelligence).toBeNull();
    expect(snapshot.discovery_origin.priority.score).toBe(80);
    expect(snapshot.evidence_register.every((entry: { confirmation: unknown; related_facts: unknown[] }) =>
      entry.confirmation === null && entry.related_facts.length === 0)).toBe(true);
  } finally {
    if (child) expect((await page.request.delete(`/api/v1/sessions/${child}`)).ok()).toBe(true);
    if (engagement) {
      const current = await (await page.request.get(`/api/v1/engagements/${engagement}`)).json();
      expect((await page.request.delete(`/api/v1/engagements/${engagement}?version=${encodeURIComponent(current.version)}`)).ok()).toBe(true);
    }
  }
});

test("a lost handoff response reloads and resumes without duplicating the committed assessment", async ({ page }) => {
  let engagement = "";
  let child = "";
  const pattern = "**/api/v1/engagements/*/opportunities/*/handoff";
  try {
    const response = await page.request.post("/api/v1/engagements", { data: { engagement: {
      title: "Fictional response recovery", objective: "Investigate duplicate checks", business_units: "Finance",
      sponsor: "Fictional sponsor", engagement_owner: "Fictional owner",
      opportunities: [{ id: crypto.randomUUID(), title: "Manual hypothesis", problem: "Fictional duplicate checks.", status: "selected" }],
    } } });
    expect(response.ok()).toBe(true);
    const record = await response.json();
    engagement = record.id;
    await page.goto("/");
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
    await page.getByRole("button", { name: "Fictional response recovery", exact: true }).click();
    await page.getByRole("combobox", { name: "Opportunity to review", exact: true }).selectOption(record.engagement.opportunities[0].id);
    await page.getByRole("combobox", { name: "Assessment target cloud", exact: true }).selectOption("azure");
    await page.route(pattern, async route => {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      child = (await committed.json()).session_id;
      await route.fulfill({ status: 503, json: { detail: "Simulated lost response. Reload and inspect the handoff." } });
    });
    await page.getByRole("checkbox", { name: /^I reviewed this hypothesis/ }).check();
    await page.getByRole("button", { name: "Create or resume assessment handoff", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("503");
    await page.unroute(pattern);
    await page.getByRole("button", { name: "Reload engagement", exact: true }).click();
    await expect(page.getByText("Completed handoff:", { exact: false })).toBeVisible();
    await page.getByRole("checkbox", { name: /^I reviewed this hypothesis/ }).check();
    await page.getByRole("button", { name: "Create or resume assessment handoff", exact: true }).click();
    await expect(page.getByText(/^Discovery origin:/)).toBeVisible();
    const pointer = await page.evaluate(() => JSON.parse(sessionStorage.getItem("agentsense.session.v1")!));
    expect(pointer.session).toBe(child);
    const saved = await (await page.request.get(`/api/v1/engagements/${engagement}`)).json();
    expect(saved.engagement.assessment_ids).toEqual([child]);
    expect(saved.handoffs).toHaveLength(1);
  } finally {
    await page.unroute(pattern);
    if (child) expect((await page.request.delete(`/api/v1/sessions/${child}`)).ok()).toBe(true);
    if (engagement) {
      const current = await (await page.request.get(`/api/v1/engagements/${engagement}`)).json();
      expect((await page.request.delete(`/api/v1/engagements/${engagement}?version=${encodeURIComponent(current.version)}`)).ok()).toBe(true);
    }
  }
});

test("team role contributions save drafts, submit with unknowns and protect unsaved answers", async ({ page }) => {
  let engagement = "";
  let headers: Record<string, string> = {};
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
    await page.getByLabel("Organization name", { exact: true }).fill("Fictional discovery team");
    const organizationResponse = page.waitForResponse(response => response.url().endsWith("/organizations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create organization", exact: true }).click();
    const organization = (await (await organizationResponse).json()).organization_id;
    await page.getByLabel("Team name", { exact: true }).fill("Stakeholder team");
    const teamResponse = page.waitForResponse(response => response.url().endsWith("/teams") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create team", exact: true }).click();
    const team = (await (await teamResponse).json()).team_id;
    headers = { "X-Organization-ID": organization, "X-Team-ID": team };
    await page.getByRole("button", { name: "Use Stakeholder team", exact: true }).click();
    const created = await page.request.post("/api/v1/engagements", { headers, data: { engagement: {
      title: "Fictional participation", objective: "Understand duplicate work", business_units: "Finance",
      sponsor: "Fictional sponsor", engagement_owner: "Fictional owner",
    } } });
    expect(created.ok()).toBe(true);
    engagement = (await created.json()).id;
    await page.getByRole("button", { name: "Discovery engagements", exact: true }).click();
    await page.getByRole("button", { name: "Fictional participation", exact: true }).click();
    await page.getByRole("button", { name: "Load eligible team members", exact: true }).click();
    await page.getByRole("combobox", { name: "Participant identity", exact: true }).selectOption("local-demo");
    await page.getByRole("button", { name: "Assign participant", exact: true }).click();
    const first = page.getByRole("textbox", { name: "Describe the work from input to outcome.", exact: true });
    await first.fill("Fictional invoice arrives, receives checks and is reviewed.");
    await expect(page.getByRole("textbox", { name: "Engagement title", exact: true })).toBeDisabled();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Organizations & teams", exact: true }).click();
    await expect(first).toHaveValue("Fictional invoice arrives, receives checks and is reviewed.");
    await page.getByRole("button", { name: "Save contribution draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "draft is saved" })).toBeVisible();
    await page.getByRole("textbox", { name: /^Where does manual effort/ }).fill("Unconfirmed");
    await page.getByRole("textbox", { name: /^Which systems and departments/ }).fill("Fictional SAP and Finance");
    await page.getByRole("button", { name: "Submit contribution", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "unverified stakeholder statement" })).toBeVisible();
    await page.getByRole("button", { name: "Generate discovery synthesis", exact: true }).click();
    await expect(page.getByText("Generated opportunity hypotheses", { exact: true })).toBeVisible();
    const generated = await (await page.request.get(`/api/v1/engagements/${engagement}`, { headers })).json();
    expect(generated.synthesis.sources).toHaveLength(3);
    await first.fill("Revised fictional process.");
    await page.getByRole("button", { name: "Save contribution draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sources changed." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add candidate for review", exact: true })).toBeDisabled();
  } finally {
    if (engagement) {
      const current = await (await page.request.get(`/api/v1/engagements/${engagement}`, { headers })).json();
      expect((await page.request.delete(`/api/v1/engagements/${engagement}?version=${encodeURIComponent(current.version)}`, { headers })).ok()).toBe(true);
    }
  }
});

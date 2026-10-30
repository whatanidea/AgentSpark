import { expect, test } from "@playwright/test";
import type { RuntimeDecision, RuntimeRequirements } from "../src/api";

test("structured runtime requirements persist the same advisory decision in analysis, blueprint and Markdown", async ({ page }) => {
  let session = "";
  let headers: Record<string, string> = {};
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Assess my workflow", exact: true }).first().click();
    await page.getByLabel("Target cloud", { exact: true }).selectOption("azure");
    await page.getByRole("button", { name: "🧾 Invoice Approval (Finance)", exact: true }).click();
    await page.getByRole("button", { name: "Submit Intake", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Diagnostic Interview", exact: true })).toBeVisible();
    const pointer = JSON.parse((await page.evaluate(() => sessionStorage.getItem("agentsense.session.v1")))!);
    session = pointer.session;
    headers = pointer.workspace
      ? { "X-Organization-ID": pointer.workspace.organization_id, "X-Team-ID": pointer.workspace.team_id } : {};
    const path = `/api/v1/sessions/${session}`;
    const interviewResponse = await page.request.get(`${path}/interview`, { headers });
    expect(interviewResponse.ok()).toBe(true);
    const interview = await interviewResponse.json();
    const requirements: RuntimeRequirements = {
      reasoning: "dynamic", duration: "long_running", external_waits: "yes", recovery: "durable",
      side_effects: "consequential", side_effect_safety: "defined", existing_reasoning: "langgraph",
      existing_runtime: "temporal", runtime_hosting: "self_hosted", operational_owner: "Fictional platform team",
      scale_constraints: "Fictional 100 cases per day", platform_constraints: "",
    };
    const answers = Object.fromEntries(Object.entries(requirements).map(([key, value]) => [`runtime.${key}`, value]));
    for (const key of Object.keys(answers)) {
      expect(interview.fields.some((field: { id: string }) => field.id === key)).toBe(true);
    }
    const saved = await page.request.put(`${path}/interview`, {
      headers, data: { version: interview.version, answers },
    });
    expect(saved.ok()).toBe(true);
    const progress = await saved.json();
    for (const [key, value] of Object.entries(answers)) {
      if (value) expect(progress.answers[key]).toBe(value);
    }

    await page.getByRole("button", { name: "3 · Workflow Analysis", exact: true }).click();
    const run = page.getByRole("button", { name: "▶ Run Multi-Agent Analysis", exact: true });
    await expect(run).toBeEnabled();
    const analyzed = page.waitForResponse(response =>
      response.url().includes(`/analyze/${session}`) && response.request().method() === "POST");
    await run.click();
    const analysisResponse = await analyzed;
    expect(analysisResponse.ok()).toBe(true);
    const analysis = await analysisResponse.json();
    const decision: RuntimeDecision = analysis.runtime_decision;
    expect(decision.status).toBe("provisional");
    expect(decision.reasoning.selected).toBe("langgraph");
    expect(decision.durable_execution.selected).toBe("temporal");
    expect(decision.reasoning.label).toContain("LangGraph");
    expect(decision.durable_execution.label).toContain("Temporal");
    expect(decision.requirements).toEqual(requirements);
    expect(decision.validation_tasks.length).toBeGreaterThan(0);
    expect(decision.rules_version).toBeTruthy();
    expect(decision.catalog_version).toBeTruthy();

    const runtime = page.locator(".surface-card").filter({
      has: page.getByRole("heading", { name: "Architecture Runtime Decision", exact: true }),
    });
    await expect(runtime.getByRole("heading", { name: `Reasoning layer: ${decision.reasoning.label}`, exact: true })).toBeVisible();
    await expect(runtime.getByRole("heading", { name: `Durable execution layer: ${decision.durable_execution.label}`, exact: true })).toBeVisible();
    await expect(runtime.getByText("Provisional", { exact: true })).toBeVisible();
    await expect(runtime).toContainText("Deployment, availability and operational readiness are not verified");
    await runtime.getByText("Runtime requirements and provenance", { exact: true }).click();
    await expect(runtime).toContainText("Fictional platform team");
    const snapshotResponse = await page.request.get(path, { headers });
    expect(snapshotResponse.ok()).toBe(true);
    expect((await snapshotResponse.json()).runtime_decision).toEqual(decision);

    const fetched = page.waitForResponse(response => response.url().includes(`/blueprint/${session}`));
    await page.getByRole("button", { name: "4 · Blueprint & Review", exact: true }).click();
    const blueprintResponse = await fetched;
    expect(blueprintResponse.ok()).toBe(true);
    expect((await blueprintResponse.json()).runtime_decision).toEqual(decision);
    await expect(runtime.getByRole("heading", { name: `Reasoning layer: ${decision.reasoning.label}`, exact: true })).toBeVisible();
    await expect(runtime.getByRole("heading", { name: `Durable execution layer: ${decision.durable_execution.label}`, exact: true })).toBeVisible();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "⬇ Export .md", exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("AgentSpark_Blueprint.md");
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Markdown download stream unavailable");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const markdown = Buffer.concat(chunks).toString("utf8");
    expect(markdown).toContain("## Architecture Runtime Decision");
    expect(markdown).toContain("**Status:** Provisional");
    expect(markdown).toContain(`Reasoning layer: ${decision.reasoning.label}`);
    expect(markdown).toContain(`Durable execution layer: ${decision.durable_execution.label}`);
    expect(markdown).toContain(decision.rules_version);
    expect(markdown).toContain(decision.catalog_version);
    expect(markdown).toContain("Fictional platform team");
    expect(markdown).toContain("operational readiness are not verified");
  } finally {
    if (session) {
      const deleted = await page.request.delete(`/api/v1/sessions/${session}`, { headers });
      expect([200, 404]).toContain(deleted.status());
    }
  }
});

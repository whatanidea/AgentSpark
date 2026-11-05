import { expect, type Page } from "@playwright/test";

declare global {
  interface Window { agentsparkTestResponse?: string }
}

export async function watchProcessing(page: Page, path: string) {
  await page.evaluate(fragment => {
    window.agentsparkTestResponse = undefined;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (response.url.includes(fragment)) {
        // Chromium's protocol does not reliably retain consumed NDJSON bodies.
        // Tee the actual browser response without mocking or issuing another request.
        void response.clone().text().then(body => {
          if (response.headers.get("content-type")?.includes("application/x-ndjson")) {
            const lines = body.trim().split("\n");
            window.agentsparkTestResponse = lines[lines.length - 1];
          } else {
            window.agentsparkTestResponse = JSON.stringify({ kind: response.ok ? "result" : "error",
              data: JSON.parse(body), detail: response.ok ? "" : "Request failed." });
          }
        }).catch(() => {
          window.agentsparkTestResponse = JSON.stringify({ kind: "error", detail: "Processing response was interrupted." });
        });
      }
      return response;
    };
  }, path);
}

export async function processingResult(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.agentsparkTestResponse))).toBe(true);
  const encoded = await page.evaluate(() => window.agentsparkTestResponse);
  if (!encoded) throw new Error("Missing processing response.");
  const terminal = JSON.parse(encoded);
  if (terminal.kind !== "result") throw new Error(terminal.detail || "Processing did not complete.");
  return terminal.data;
}

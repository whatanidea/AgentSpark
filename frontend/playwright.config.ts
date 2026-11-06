import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AGENTSPARK_E2E_ARCHIVE ??= join(tmpdir(), `agentspark-e2e-${randomUUID()}.sqlite3`);

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/discovery-processes.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalTeardown: "./e2e/cleanup.ts",
  use: { baseURL: "http://127.0.0.1:8767", trace: "off", screenshot: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", testMatch: ["**/editorial.spec.ts", "**/portal-design.spec.ts", "**/guided-discovery.spec.ts", "**/home-discovery.spec.ts", "**/document-intake.spec.ts", "**/workflow.spec.ts"],
      grep: /mobile journey fits completely|editorial portal|editorial form controls|positive portfolio|guided discovery|Home discovery library|document intake|guided interview retains|guided interview rejects a stale question batch|business value|agentic adoption|PDF reports|PDF export refreshes|invite onboarding|invite links/,
      use: { browserName: "webkit", viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8767 --no-access-log",
    cwd: "..",
    url: "http://127.0.0.1:8767/health",
    reuseExistingServer: false,
    env: { AGENTSENSE_MODE: "demo", ENVIRONMENT: "development", AGENTSENSE_AUTH_MODE: "local-demo", SESSION_RETENTION_HOURS: "24",
      DECISION_ARCHIVE_RETENTION_DAYS: "30", DEMO_ARCHIVE_PATH: process.env.AGENTSPARK_E2E_ARCHIVE },
  },
});

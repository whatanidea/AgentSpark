import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AGENTSPARK_E2E_ARCHIVE ??= join(tmpdir(), `agentspark-e2e-${randomUUID()}.sqlite3`);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalTeardown: "./e2e/cleanup.ts",
  use: { baseURL: "http://127.0.0.1:8767", trace: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8767 --no-access-log",
    cwd: "..",
    url: "http://127.0.0.1:8767/health",
    reuseExistingServer: false,
    env: { AGENTSENSE_MODE: "demo", ENVIRONMENT: "development", AGENTSENSE_AUTH_MODE: "local-demo", SESSION_RETENTION_HOURS: "24",
      DECISION_ARCHIVE_RETENTION_DAYS: "30", DEMO_ARCHIVE_PATH: process.env.AGENTSPARK_E2E_ARCHIVE },
  },
});

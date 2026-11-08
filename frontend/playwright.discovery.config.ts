import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

process.env.AGENTSPARK_E2E_ARCHIVE ??= resolve("agentspark-e2e-processes.sqlite3");
const port = process.env.AGENTSPARK_DISCOVERY_E2E_PORT || "8768";
export default defineConfig({
  testDir: "./e2e", testMatch: "discovery-processes.spec.ts", workers: 1, retries: 0, timeout: 90000,
  reporter: [["list"]], globalTeardown: "./e2e/cleanup.ts",
  use: { baseURL: `http://127.0.0.1:${port}`, actionTimeout: 10000, trace: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", grep: /stakeholder alignment|Home workspace filter/, use: { ...devices["iPhone 13"] } }],
  webServer: {
    command: `python -m uvicorn discovery_browser_server:app --app-dir tests --host 127.0.0.1 --port ${port} --no-access-log`,
    cwd: "..", url: `http://127.0.0.1:${port}/health`, reuseExistingServer: false,
    env: { AGENTSENSE_MODE: "demo", ENVIRONMENT: "development", AGENTSENSE_AUTH_MODE: "local-demo",
      SESSION_RETENTION_HOURS: "24", DECISION_ARCHIVE_RETENTION_DAYS: "30", DEMO_ARCHIVE_PATH: process.env.AGENTSPARK_E2E_ARCHIVE },
  },
});

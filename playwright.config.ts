import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against a PRODUCTION build (next build + next start) in demo mode, with
 * an isolated, freshly seeded database (.data/e2e). Uses the locally installed Google Chrome.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "rm -rf .data/e2e && npx next build && npx next start -p 3200",
    url: "http://localhost:3200/login",
    timeout: 420_000,
    reuseExistingServer: false,
    env: { HOMECARE_MODE: "demo", HOMECARE_DEMO_DATA_DIR: ".data/e2e", NEXT_TELEMETRY_DISABLED: "1" },
  },
});

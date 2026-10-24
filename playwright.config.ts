// Playwright: juror page smoke tests on a mobile viewport (SPEC §17).
// Run against a dev server: `npm run dev` in one terminal, then `npx playwright test`.
// All network the page uses (/api/juror/*, Terac callback) is mocked per test with page.route, so no DB
// or Terac account is needed. Set E2E_BASE_URL to target another host.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});

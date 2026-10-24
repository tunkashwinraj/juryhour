// Playwright e2e (SPEC §17, WEBSITE_SPEC §11).
// - tests/e2e/juror.spec.ts: juror page on a mobile viewport; all network mocked (no DB/Terac needed).
// - tests/e2e/site.spec.ts: marketing-site smoke (routes, widths, console, preview → Whop sandbox URL).
// - tests/e2e/a11y.spec.ts: keyboard path, both color schemes, reduced motion, axe.
// Local: the webServer below starts `npm run dev` (or reuses one on E2E_PORT, default 3000).
// Production: E2E_BASE_URL=https://juryhour.vercel.app npx playwright test tests/e2e/site.spec.ts
import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3000";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    // The juror page is a phone-first flow; its spec stays on mobile only.
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /juror\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npm run dev -- -p ${port}`, url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});

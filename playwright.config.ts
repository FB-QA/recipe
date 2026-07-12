import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the real local Next.js server talking to the real local
 * Supabase stack. Journeys only — render claims live in component tests.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    viewport: { width: 390, height: 844 }, // iPhone 14-ish — mobile-first
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

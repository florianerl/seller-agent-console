import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end suite exists for the things jsdom cannot have an opinion
 * about: a real service worker, a real precache, a real reload, and a real
 * deploy prefix. Everything else is cheaper and clearer as a unit test.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // The screenshot capture writes assets into public/ instead of asserting
  // anything, so it is not part of the suite. `npm run screenshots` runs it.
  testIgnore: /capture-.*\.spec\.ts$/,
  // Service-worker tests install and take over a worker per context. Running
  // them concurrently in one browser makes registration order the variable,
  // and the failures are unreadable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: "retain-on-failure",
    // The console only accepts https or localhost bases; the fixture server
    // binds to localhost so the real rule is exercised, not bypassed.
    ignoreHTTPSErrors: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

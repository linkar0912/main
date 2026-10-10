import { defineConfig, devices } from "@playwright/test";
import { assertLocalE2ETarget } from "./e2e/local-target";

const STORAGE_STATE = ".playwright/auth.json";
const CI = Boolean(process.env.CI);

// Refuse before the web server starts: `next dev`/`next start` would read a
// remote DATABASE_URL from .env.local on their own.
assertLocalE2ETarget();

export default defineConfig({
  testDir: "./e2e",
  // Tests inside a spec share one authenticated workspace and must remain
  // ordered; separate spec files can still run across the worker pool.
  fullyParallel: false,
  forbidOnly: CI,
  // One retry in CI so `trace: "on-first-retry"` actually records a trace.
  retries: CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    // CI exercises the production build (what ships), locally the dev server.
    command: CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !CI,
    timeout: CI ? 600_000 : 120_000,
    env: {
      APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      ADMIN_URL: "http://localhost:3000",
      PUBLIC_SITE_URL: "http://localhost:3000",
    },
  },
  projects: [
    // Signs up one workspace owner through the real /signup flow and saves the
    // session; the chromium project depends on it and starts authenticated.
    // The teardown project deletes that owner once every dependent finished.
    { name: "setup", testMatch: /auth\.setup\.ts/, teardown: "teardown" },
    { name: "teardown", testMatch: /auth\.teardown\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
});

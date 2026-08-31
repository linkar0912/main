import { defineConfig, devices } from "@playwright/test";

const STORAGE_STATE = ".playwright/auth.json";

export default defineConfig({
  testDir: "./e2e",
  // Tests inside a spec share one authenticated workspace and must remain
  // ordered; separate spec files can still run across the worker pool.
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: {
      APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
  projects: [
    // Signs up one workspace owner through the real /signup flow and saves the
    // session; the chromium project depends on it and starts authenticated.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
});

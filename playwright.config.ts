import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: {
      OWNER_EMAIL: "owner@example.com",
      OWNER_PASSWORD_HASH: "scrypt$00112233445566778899aabbccddeeff$b9c71a45979181289d12b6d5db8bd89c367031cf1a2a9004395ded06d7019e3ebe84bd09ce203a64544a215e05afe3a474d8a68f5ad19e4d88aa5708b6457bd8",
      OWNER_SESSION_SECRET: "replyconnect-e2e-session-secret-32-chars",
      OWNER_WORKSPACE_ID: "demo_workspace",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

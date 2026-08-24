import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

const STORAGE_STATE = ".playwright/auth.json";

// One workspace owner per run. Every test in the chromium project inherits
// this signed-in session through storageState instead of signing up itself,
// keeping the suite inside the per-IP signup rate limit.
setup("create the workspace owner", async ({ page }) => {
  const email = `owner-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("linkar-e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/automations$/);

  mkdirSync(".playwright", { recursive: true });
  await page.request.storageState({ path: STORAGE_STATE });
});
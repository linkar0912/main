import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, test as setup } from "@playwright/test";
import { assertLocalE2ETarget, E2E_RUN_FILE, e2eServerMode, serverEnvValue, type E2ERun } from "./local-target";

const STORAGE_STATE = ".playwright/auth.json";

// Same view of Supabase as the app server under test, so the account is
// confirmed in the project it was created in. assertLocalE2ETarget has
// already refused anything that is not local.
function supabaseAdmin() {
  const mode = e2eServerMode();
  const url = serverEnvValue("SUPABASE_URL", mode) ?? serverEnvValue("NEXT_PUBLIC_SUPABASE_URL", mode);
  const serviceRoleKey = serverEnvValue("SUPABASE_SERVICE_ROLE_KEY", mode);
  if (!url || !serviceRoleKey) {
    throw new Error("e2e auth setup needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    url,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  };
}

// Signup requires email confirmation, so there is no email inbox for e2e to
// read. Confirm the just-created test account directly via the Supabase
// Admin API instead, then log in for real through the /login UI flow.
async function confirmEmailByAddress(email: string): Promise<string> {
  const { url, headers } = supabaseAdmin();
  const listResponse = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=1000`, { headers });
  const { users } = (await listResponse.json()) as { users?: { id: string; email?: string }[] };
  // Match exactly: never act on whichever user the API happens to list first.
  const user = users?.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) throw new Error(`e2e auth setup: no Supabase user found for ${email}`);

  const confirmResponse = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ email_confirm: true }),
  });
  if (!confirmResponse.ok) {
    throw new Error(`e2e auth setup: failed to confirm ${email} (${confirmResponse.status})`);
  }
  return user.id;
}

// One workspace owner per run. Every test in the chromium project inherits
// this signed-in session through storageState instead of signing up itself,
// keeping the suite inside the per-IP signup rate limit.
setup("create the workspace owner", async ({ page }) => {
  assertLocalE2ETarget();
  // Only an explicitly exported URL is migrated; .env.local is never used to
  // pick a database. CI migrates in its own step before the suite starts.
  const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (migrationUrl) {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: migrationUrl },
      stdio: "pipe",
    });
  }
  const email = `owner-${Date.now()}@example.com`;
  const password = "linkar-e2e-password";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\?sent=1/);

  const userId = await confirmEmailByAddress(email);
  mkdirSync(".playwright", { recursive: true });
  // Recorded before login so the teardown removes the account even if a
  // later step fails.
  writeFileSync(E2E_RUN_FILE, JSON.stringify({ email, userId } satisfies E2ERun));

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.context().storageState({ path: STORAGE_STATE });
});

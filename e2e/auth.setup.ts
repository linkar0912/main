import { mkdirSync, readFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

const STORAGE_STATE = ".playwright/auth.json";

function readEnvVar(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const raw = readFileSync(".env.local", "utf8");
    return raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const SUPABASE_URL = readEnvVar("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = readEnvVar("SUPABASE_SERVICE_ROLE_KEY");

// Signup requires email confirmation, so there is no email inbox for e2e to
// read. Confirm the just-created test account directly via the Supabase
// Admin API instead, then log in for real through the /login UI flow.
async function confirmEmailByAddress(email: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "e2e auth setup needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set in .env.local or the environment)",
    );
  }
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const listResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers });
  const { users } = (await listResponse.json()) as { users?: { id: string }[] };
  const user = users?.[0];
  if (!user) throw new Error(`e2e auth setup: no Supabase user found for ${email}`);

  const confirmResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ email_confirm: true }),
  });
  if (!confirmResponse.ok) {
    throw new Error(`e2e auth setup: failed to confirm ${email} (${confirmResponse.status})`);
  }
}

// One workspace owner per run. Every test in the chromium project inherits
// this signed-in session through storageState instead of signing up itself,
// keeping the suite inside the per-IP signup rate limit.
setup("create the workspace owner", async ({ page }) => {
  const email = `owner-${Date.now()}@example.com`;
  const password = "linkar-e2e-password";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\?sent=1/);

  await confirmEmailByAddress(email);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  mkdirSync(".playwright", { recursive: true });
  await page.request.storageState({ path: STORAGE_STATE });
});

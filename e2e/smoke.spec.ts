import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("replyconnect-e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("owner workspace requires authentication", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);

  const response = await request.get("/api/automations");
  expect(response.status()).toBe(401);
});

test("owner can sign out", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("dashboard and automation list are reachable", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("ReplyConnect", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Make every signal useful." })).toBeVisible();
  await page.getByRole("link", { name: "Automations" }).first().click();
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
});

test("guided builder saves an automation", async ({ page }) => {
  await signIn(page);
  await page.goto("/automations/new");
  await expect(page.getByRole("heading", { name: "Build a reply flow" })).toBeVisible();
  await page.getByLabel("Automation name").fill("E2E guide delivery");
  await page.getByLabel("Message text").fill("Here is the guide: https://example.com/guide");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");
});

test("Facebook review pages are reachable", async ({ page }) => {
  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/data-deletion", "Data deletion"], ["/support", "Support"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

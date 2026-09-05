import { expect, test } from "@playwright/test";

test.describe("plain-language journey", () => {
  test("explains the product clearly before signup", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.getByRole("heading", {
      level: 1,
      name: "Reply to every opportunity. Even when you are away.",
    })).toBeVisible();
    await expect(page.getByText(/write the reply once/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your first reply" })).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("region", { name: "Start replying in three simple steps." })).toBeVisible();

    await context.close();
  });

  test("takes a first-time user from Home to understandable reply fields", async ({ page }) => {
    await page.route("**/api/automations", (route) => route.fulfill({ json: { data: [] } }));
    await page.route("**/api/meta/connection", (route) => route.fulfill({
      json: {
        data: [{
          id: "connection_1",
          igUserId: "ig_1",
          username: "testbrand",
          status: "CONNECTED",
          connectedAt: "2026-09-01T00:00:00.000Z",
        }],
      },
    }));

    await page.goto("/dashboard");
    const startHere = page.getByRole("region", { name: "Start here" });
    await expect(startHere).toBeVisible();
    await startHere.getByRole("link", { name: /send a link when someone comments/i }).click();

    await expect(page).toHaveURL(/\/automations\/new\?type=classic&template=comment-link-dm/);
    await expect(page.getByRole("heading", { name: "Create an automatic reply" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Reply name")).toHaveValue("Send a link when someone comments");
    await expect(page.getByText("When this happens").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What should start this reply?" })).toBeVisible();
    await expect(page.getByLabel("Words to look for")).toBeVisible();
    await expect(page.getByRole("button", { name: "Who should get it" })).toBeVisible();
  });
});

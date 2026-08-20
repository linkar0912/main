import { expect, test } from "@playwright/test";

test("dashboard and automation list are reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ReplyConnect", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Make every signal useful." })).toBeVisible();
  await page.getByRole("link", { name: "Automations" }).first().click();
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
});

test("guided builder saves an automation", async ({ page }) => {
  await page.goto("/automations/new");
  await expect(page.getByRole("heading", { name: "Build a reply flow" })).toBeVisible();
  await page.getByLabel("Automation name").fill("E2E guide delivery");
  await page.getByLabel("Action type").selectOption("send_link");
  await page.getByLabel("Message text").fill("Here is the guide");
  await page.getByLabel("Link URL").fill("https://example.com/guide");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");
});

test("Facebook review pages are reachable", async ({ page }) => {
  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/data-deletion", "Data deletion"], ["/support", "Support"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

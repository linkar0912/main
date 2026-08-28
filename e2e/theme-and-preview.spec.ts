import { expect, test } from "@playwright/test";

test("sidebar theme toggle switches and persists dark mode", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /^Hello,/ })).toBeVisible();

  const toggle = page.getByRole("button", { name: /dark mode/i });
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /light mode/i })).toBeVisible();

  await page.getByRole("button", { name: /light mode/i }).click();
  await expect(page.locator("html[data-theme='dark']")).toHaveCount(0);
});

test("dashboard shows quick-start recipe cards", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Start here" }).nth(0)).toBeVisible();
  await expect(page.getByRole("link", { name: /Auto-DM links from comments/ })).toBeVisible();
  await expect(page.getByText("Popular", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Turn story mentions into DMs/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Respond to all your DMs/ })).toBeVisible();

  const firstCard = page.getByRole("link", { name: /Auto-DM links from comments/ });
  await firstCard.click();
  await expect(page).toHaveURL(/template=comment-link-dm/);
});

test("builder preview drops the dark panel and shows the connected photo", async ({ page }) => {
  await page.route("**/api/meta/media", (route) => route.fulfill({ json: { data: [], paging: {} } }));
  await page.route("**/api/meta/connection", (route) => route.fulfill({
    json: { data: [{ username: "mybrand", igUserId: "ig_1", profilePictureUrl: "https://cdn.example/me.jpg" }] },
  }));
  await page.route("**/api/automations/suggest-keywords", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/automations/new?type=classic");

  const preview = page.getByLabel(/test preview/i);
  const phone = preview.locator(".ig-phone");
  await expect(phone).toBeVisible();

  // The old ink panel behind the phone is gone: the preview wrapper is transparent.
  const background = await preview.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(background);

  // Connected account renders its real photo in the post header.
  await expect(preview.locator(".ig-post-header img.ig-avatar-photo")).toHaveAttribute("src", "https://cdn.example/me.jpg");
});

test("campaign preview gives other commenters the default no-photo avatar", async ({ page }) => {
  await page.route("**/api/meta/media", (route) => route.fulfill({ json: { data: [], paging: {} } }));
  await page.route("**/api/meta/connection", (route) => route.fulfill({
    json: { data: [{ username: "mybrand", igUserId: "ig_1", profilePictureUrl: "https://cdn.example/me.jpg" }] },
  }));
  await page.goto("/automations/new?type=campaign");

  const preview = page.getByLabel(/test preview/i);
  await preview.getByRole("tab", { name: "Comments" }).click();

  // The stranger commenting carries Instagram's default avatar, never our photo.
  await expect(preview.locator(".ig-comment").first().locator(".ig-avatar-default")).toBeVisible();
});

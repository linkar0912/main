import { expect, test, type Page } from "@playwright/test";

/** Home's main heading: "Hello, <name>" once a name is known, otherwise "Welcome back". */
const HOME_HEADING = /^(Hello, .+|Welcome back)$/;

/**
 * Home looks up connected accounts on the client; one connected Instagram
 * account moves "Start here" on to picking a first reply.
 */
async function mockConnectedInstagram(page: Page) {
  await page.route("**/api/meta/connection", (route) => route.fulfill({
    json: { data: [{ id: "connection_1", igUserId: "ig_1", username: "testbrand", status: "CONNECTED", connectedAt: "2026-09-01T00:00:00.000Z" }] },
  }));
}

// The theme lives in this browser context's localStorage, so the change never
// reaches other tests sharing the workspace owner.
test("account menu theme switch toggles and persists dark mode", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: HOME_HEADING })).toBeVisible();

  const accountMenu = page.getByRole("button", { name: "Account menu" });
  const darkMode = page.getByRole("switch", { name: "Dark mode" });
  await accountMenu.click();
  await expect(darkMode).toHaveAttribute("aria-checked", "false");

  await darkMode.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(darkMode).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await accountMenu.click();
  await expect(darkMode).toHaveAttribute("aria-checked", "true");
  await darkMode.click();
  await expect(page.locator("html[data-theme='dark']")).toHaveCount(0);
  await expect(darkMode).toHaveAttribute("aria-checked", "false");
});

test("dashboard shows quick-start recipe cards", async ({ page }) => {
  await mockConnectedInstagram(page);
  await page.goto("/dashboard");

  const start = page.getByRole("region", { name: "Start here" });
  await expect(start.getByRole("heading", { name: "Get your first reply live" })).toBeVisible();
  await expect(start.getByText("Connected to @testbrand.")).toBeVisible();
  const firstCard = start.getByRole("link", { name: /Send a link when someone comments/ });
  await expect(firstCard).toBeVisible();
  await expect(firstCard.getByText("Popular", { exact: true })).toBeVisible();
  await expect(start.getByRole("link", { name: /Turn story mentions into DMs/ })).toBeVisible();
  await expect(start.getByRole("link", { name: /Respond to all your DMs/ })).toBeVisible();

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

  const preview = page.getByLabel(/message preview/i);
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

  const preview = page.getByLabel(/message preview/i);
  await preview.getByRole("tab", { name: "Comments" }).click();

  // The stranger commenting carries Instagram's default avatar, never our photo.
  await expect(preview.locator(".ig-comment").first().locator(".ig-avatar-default")).toBeVisible();
});

test("reduced-motion users get instant sheets and notices", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockConnectedInstagram(page);
  await page.goto("/dashboard");
  await page.getByRole("region", { name: "Start here" }).getByRole("button", { name: "Browse all templates" }).click();

  const dialog = page.getByRole("dialog", { name: "Choose a template" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0s");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.goto("/automations/new?type=campaign");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // The first step checks its fields in order: the posts come before the name.
  const notice = page.getByRole("alert").filter({ hasText: "Select at least one post or Reel to watch." });
  await expect(notice).toBeVisible();
  // Reduced motion collapses every animation to .01ms (globals.css): instant.
  const seconds = await notice.evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
  expect(seconds).toBeLessThanOrEqual(0.001);
});

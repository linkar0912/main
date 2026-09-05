import { devices, expect, test } from "@playwright/test";

test.use({ ...devices["iPhone 13"] });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/meta/connection", (route) => route.fulfill({
    json: { data: [{ id: "connection_mobile", igUserId: "ig_mobile", username: "mobilebrand", status: "CONNECTED" }] },
  }));
  await page.route("**/api/facebook/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/meta/media", (route) => route.fulfill({
    json: {
      data: [{
        id: "reel_mobile",
        caption: "Mobile preview Reel",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/mobile/",
        thumbnailUrl: "https://cdn.example/mobile.jpg",
        timestamp: "2026-09-05T00:00:00.000Z",
      }],
      paging: {},
    },
  }));
});

test("builder feedback, progress, and phone preview fit an iPhone", async ({ page }) => {
  await page.goto("/automations/new?type=campaign");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  const notice = page.getByRole("alert").filter({ hasText: "Give this automation a name" });
  await expect(notice).toBeVisible();

  const noticeBox = await notice.boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(noticeBox!.x).toBeGreaterThanOrEqual(0);
  expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(390);

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "Open phone mockup" }).click();
  const preview = page.getByLabel("Test preview");
  await expect(preview).toBeVisible();
  await expect(page.getByRole("button", { name: "Close phone mockup", exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  const [previewBox, phoneBox, visualHeight] = await Promise.all([
    preview.boundingBox(),
    preview.locator(".ig-phone").boundingBox(),
    page.evaluate(() => window.innerHeight),
  ]);
  expect(previewBox).not.toBeNull();
  expect(previewBox!.x).toBe(0);
  expect(previewBox!.y).toBe(0);
  expect(previewBox!.width).toBe(390);
  expect(previewBox!.height).toBe(visualHeight);
  expect(phoneBox).not.toBeNull();
  expect(phoneBox!.y + phoneBox!.height).toBeLessThanOrEqual(visualHeight);
});

test("template picker becomes a usable full-height iPhone sheet", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /create automation/i }).first().click();

  const dialog = page.getByRole("dialog", { name: "Templates" });
  await expect(dialog).toBeVisible();
  const [dialogBox, visualHeight] = await Promise.all([
    dialog.boundingBox(),
    page.evaluate(() => window.innerHeight),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBe(0);
  expect(dialogBox!.y).toBe(0);
  expect(dialogBox!.width).toBe(390);
  expect(dialogBox!.height).toBe(visualHeight);
  await expect(dialog.getByRole("button", { name: "Start from scratch" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

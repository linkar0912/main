import { devices, expect, test, type Locator } from "@playwright/test";

/** Sheets slide in; measure them once their entrance animation has finished. */
async function settled(sheet: Locator) {
  await sheet.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
}

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
  // The first step checks its fields in order: the posts come before the name.
  const notice = page.getByRole("alert").filter({ hasText: "Select at least one post or Reel to watch." });
  await expect(notice).toBeVisible();

  const noticeBox = await notice.boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(noticeBox!.x).toBeGreaterThanOrEqual(0);
  expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(390);

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);

  // On a phone the preview is a full-screen sheet opened from the footer.
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Message preview" });
  await expect(preview).toBeVisible();
  await settled(preview);
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
  // With an account connected, Home's "Start here" offers the full picker.
  await page.getByRole("region", { name: "Start here" }).getByRole("button", { name: "Browse all templates" }).click();

  const dialog = page.getByRole("dialog", { name: "Choose a template" });
  await expect(dialog).toBeVisible();
  await settled(dialog);
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
  const categories = dialog.getByRole("navigation", { name: "Template categories" });
  await expect(categories).toBeVisible();
  expect(await categories.evaluate((element) => getComputedStyle(element).flexWrap)).toBe("nowrap");
  const results = dialog.getByRole("region", { name: "Template results" });
  await expect(results).toBeVisible();
  expect(await results.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  expect(await results.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

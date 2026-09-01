import { expect, test } from "@playwright/test";

// Authenticated surfaces exercising the newer campaign tooling: the builder's
// phone preview, the template picker, activity feed filtering, and avatars.

test("builder wraps the preview in a phone shell with status bar and updated badge", async ({ page }) => {
  await page.route("**/api/meta/media", (route) =>
    route.fulfill({ json: { data: [], paging: {} } }),
  );
  await page.route("**/api/meta/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/automations/new?type=campaign");

  const preview = page.getByLabel(/test preview/i);
  await expect(preview.locator(".ig-device")).toBeVisible();
  await expect(preview.locator(".ig-phone")).toBeVisible();
  await expect(preview.locator(".ig-device-button")).toHaveCount(3);
  await expect(preview.locator(".ig-statusbar")).toContainText("9:41");
  await expect(preview.getByText("Instagram")).toBeVisible();
  await expect(preview.getByText("Updated")).toBeVisible();
  // The disclaimer copy is gone for good.
  await expect(page.getByText(/not sent to instagram/i)).toHaveCount(0);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-premium-phone-preview.png", fullPage: true });
});

test("template picker tiles show example flows and search narrows them", async ({ page }) => {
  await page.route("**/api/facebook/connection", (route) => route.fulfill({
    json: { data: [{ id: "page_record_1", pageId: "page_1", pageName: "Linkar Demo Page", status: "CONNECTED" }] },
  }));
  await page.goto("/automations");
  await page.getByRole("button", { name: "New automation" }).click();

  const dialog = page.getByRole("dialog");
  const channel = dialog.getByLabel("Automation channel");
  await expect(channel.locator(".template-channel-switch")).toHaveCSS("border-top-width", "0px");
  await expect(channel.getByRole("button", { name: "Instagram" })).toHaveAttribute("aria-pressed", "true");
  await expect(channel.locator('[data-brand-logo="instagram"]')).toBeVisible();
  await expect(dialog.getByText("Follow-gated Reel campaign")).toBeVisible();
  await expect(dialog.locator(".template-example").first()).toBeVisible();
  await expect(dialog.locator(".template-picker-tile-icon")).toHaveCount(0);

  if (process.env.VISUAL_REVIEW) await dialog.screenshot({ path: "/tmp/linkar-template-channel-instagram.png" });

  await channel.getByRole("button", { name: "Facebook" }).click();
  await expect(channel.getByRole("button", { name: "Facebook" })).toHaveAttribute("aria-pressed", "true");
  await expect(channel.getByText("Connected Page", { exact: true })).toBeVisible();
  await channel.getByLabel("Facebook Page").selectOption("page_1");

  if (process.env.VISUAL_REVIEW) await dialog.screenshot({ path: "/tmp/linkar-template-channel-facebook.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(channel).toHaveCSS("flex-direction", "column");
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-template-channel-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await channel.getByRole("button", { name: "Instagram" }).click();

  await dialog.getByLabel("Search templates").fill("story");
  await expect(dialog.getByText(/Story Mention Reply/)).toBeVisible();
  await expect(dialog.getByText(/Email Capture/)).toHaveCount(0);
});

test("campaign activity filters by status chips and offers retries", async ({ page }) => {
  await page.route("**/api/automations/automation_1/activity/retry", (route) =>
    route.fulfill({ json: { data: { retried: true } } }),
  );
  await page.route("**/api/automations/automation_1/activity", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "participant_failed",
            sourceMediaSnapshot: {
              id: "media_1",
              caption: "Launch reel",
              mediaType: "VIDEO",
              mediaProductType: "REELS",
              permalink: "https://www.instagram.com/reel/media_1/",
              timestamp: "2026-08-23T08:00:00.000Z",
            },
            matchedKeyword: "launch",
            state: "FAILED",
            publicReplyStatus: "SENT",
            openingStatus: "PENDING",
            finalDeliveryStatus: "PENDING",
          },
          {
            id: "participant_delivered",
            sourceMediaSnapshot: {
              id: "media_1",
              caption: "Launch reel",
              mediaType: "VIDEO",
              mediaProductType: "REELS",
              permalink: "https://www.instagram.com/reel/media_1/",
              timestamp: "2026-08-23T08:00:00.000Z",
            },
            matchedKeyword: "launch",
            state: "LINK_SENT",
            followStatus: true,
            publicReplyStatus: "SENT",
            openingStatus: "SENT",
            finalDeliveryStatus: "SENT",
            deliveryClickedAt: "2026-08-23T09:00:00.000Z",
          },
        ],
        summary: { commented: 5, openingSent: 2, optedIn: 2, followed: 1, linkSent: 1 },
      },
    }),
  );

  await page.goto("/automations/automation_1/activity");

  // Truncation notice reflects summary totals beyond the returned page.
  await expect(page.getByText(/latest 2 of 5 participants/i)).toBeVisible();
  await expect(page.getByText(/1 of 1 delivered clicked the link \(100%\)/i)).toBeVisible();

  const failedRow = page.locator(".activity-row", { hasText: "failed" }).first();
  await expect(failedRow.getByRole("button", { name: /retry delivery/i })).toBeVisible();
  const deliveredRow = page.locator(".activity-row", { hasText: "link sent" }).first();
  await expect(deliveredRow.getByRole("button", { name: /retry delivery/i })).toHaveCount(0);

  // Status chip narrows the feed.
  await page.getByRole("button", { name: /needs attention/i }).click();
  await expect(page.getByText("Launch reel")).toHaveCount(1);
});

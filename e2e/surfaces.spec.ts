import { expect, test, type Owner } from "./fixtures";

// Authenticated surfaces exercising the newer campaign tooling: the builder's
// phone preview, the template picker, activity feed filtering, and avatars.

/** A real comment-triggered Instagram automation in the owner's own workspace. */
async function createCampaign(owner: Owner, name: string): Promise<string> {
  const account = await owner.connectInstagram();
  const response = await owner.page.request.post("/api/automations", {
    data: {
      provider: "INSTAGRAM",
      instagramAccountId: account.igUserId,
      name,
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["launch"], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "Here is the launch link." }],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

test("builder wraps the preview in a phone shell with status bar and a live-preview note", async ({ page }) => {
  await page.route("**/api/meta/media", (route) =>
    route.fulfill({ json: { data: [], paging: {} } }),
  );
  await page.route("**/api/meta/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/automations/new?type=campaign");

  const preview = page.getByLabel(/message preview/i);
  await expect(preview.locator(".ig-device")).toBeVisible();
  await expect(preview.locator(".ig-phone")).toBeVisible();
  await expect(preview.locator(".ig-device-button")).toHaveCount(3);
  await expect(preview.locator(".ig-statusbar")).toContainText("9:41");
  await expect(preview.getByText("Instagram")).toBeVisible();
  // The per-change "Updated" badge became one standing note above the phone.
  await expect(preview.getByText("Updates as you type. Nothing is sent.")).toBeVisible();
  await expect(preview.getByRole("tablist", { name: "Preview surface" }).getByRole("tab", { name: "Post" })).toHaveAttribute("aria-selected", "true");
  // The disclaimer copy is gone for good.
  await expect(page.getByText(/not sent to instagram/i)).toHaveCount(0);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-premium-phone-preview.png", fullPage: true });
});

test("template picker tiles show example flows and search narrows them", async ({ page }) => {
  await page.route("**/api/facebook/connection", (route) => route.fulfill({
    json: { data: [
      { id: "page_record_1", pageId: "page_1", pageName: "Linkar Demo Page", status: "CONNECTED" },
      { id: "page_record_2", pageId: "page_2", pageName: "Second Demo Page", status: "CONNECTED" },
    ] },
  }));
  await page.goto("/automations");
  await page.getByRole("button", { name: "New automation" }).click();

  const dialog = page.getByRole("dialog", { name: "Choose a template" });
  // The channel switch is one segmented control, Instagram first.
  const channel = dialog.getByRole("group", { name: "Automation channel" });
  await expect(channel.getByRole("button", { name: "Instagram" })).toHaveAttribute("aria-pressed", "true");
  await expect(channel.locator('[data-brand-logo="instagram"]')).toBeVisible();
  const followTile = dialog.getByRole("button", { name: /^Send a link after someone follows you/ });
  await expect(followTile).toBeVisible();
  // Each tile spells out how the flow works, step by step, with no icon.
  await expect(followTile.getByRole("listitem")).toHaveCount(3);
  await expect(followTile.getByRole("listitem").first()).toHaveText(/Someone comments using a word you choose/);
  await expect(dialog.locator(".template-picker-tile-icon")).toHaveCount(0);

  if (process.env.VISUAL_REVIEW) await dialog.screenshot({ path: "/tmp/linkar-template-channel-instagram.png" });

  await channel.getByRole("button", { name: "Facebook" }).click();
  await expect(channel.getByRole("button", { name: "Facebook" })).toHaveAttribute("aria-pressed", "true");
  // With more than one connected Page, the picker asks which one.
  const pageSelect = dialog.getByLabel("Facebook Page");
  await expect(pageSelect.getByRole("option", { name: "Linkar Demo Page" })).toHaveCount(1);
  await expect(dialog.getByText("Choose your Facebook Page above to see its templates.")).toBeVisible();
  await pageSelect.selectOption("page_1");
  await expect(dialog.getByText("Works with comments on your Facebook Page")).toBeVisible();

  if (process.env.VISUAL_REVIEW) await dialog.screenshot({ path: "/tmp/linkar-template-channel-facebook.png" });

  // On a phone the switch and the Page picker each take a full row.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(channel).toHaveCSS("display", "flex");
  // The sheet settles into place after the resize, so read the rows once it has.
  await expect.poll(async () => {
    const [switchBox, selectBox] = await Promise.all([channel.boundingBox(), pageSelect.boundingBox()]);
    if (!switchBox || !selectBox) return "not laid out";
    return selectBox.y >= switchBox.y + switchBox.height && switchBox.width > 300 ? "stacked" : "side by side";
  }).toBe("stacked");
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-template-channel-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await channel.getByRole("button", { name: "Instagram" }).click();

  await dialog.getByLabel("Search templates").fill("story");
  await expect(dialog.getByText(/Thank people who mention you in a Story/)).toBeVisible();
  await expect(dialog.getByText(/Collect email addresses in messages/)).toHaveCount(0);
});

test("campaign activity filters by status chips and offers retries", async ({ owner }) => {
  const { page } = owner;
  const automationId = await createCampaign(owner, "Launch campaign");
  const retries: unknown[] = [];
  await page.route(`**/api/automations/${automationId}/activity/retry`, (route) => {
    retries.push(route.request().postDataJSON());
    return route.fulfill({ json: { data: { retried: true } } });
  });
  await page.route(`**/api/automations/${automationId}/activity`, (route) =>
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

  await page.route("**/api/insights?**", (route) => route.fulfill({
    json: { timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] }, mediaPerformance: [] },
  }));

  await page.goto(`/automations/${automationId}/activity`);
  await expect(page.getByRole("heading", { level: 1, name: "Launch campaign" })).toBeVisible();

  // Truncation notice reflects summary totals beyond the returned page.
  await expect(page.getByText("Latest 2 of 5. Export CSV for the full history.")).toBeVisible();
  const clicks = page.getByRole("list", { name: "Campaign summary" }).getByRole("listitem").filter({ hasText: "Link clicks" });
  await expect(clicks).toContainText("100%");
  await expect(clicks).toContainText("1 of 1 recent deliveries");

  // Both people commented on the same Reel, so they share one group.
  const rows = page.getByRole("region", { name: "Launch reel" }).getByRole("article");
  await expect(rows).toHaveCount(2);
  const failedRow = rows.filter({ hasText: "Failed" });
  const deliveredRow = rows.filter({ hasText: "Got the link" });
  await expect(deliveredRow.getByRole("button", { name: /retry delivery/i })).toHaveCount(0);
  await failedRow.getByRole("button", { name: /retry delivery/i }).click();
  await expect.poll(() => retries).toContainEqual({ participantId: "participant_failed" });

  // Status chip narrows the feed.
  await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: /needs attention/i }).click();
  await expect(page.getByText("Showing 1 of 2 participants")).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Failed");
});

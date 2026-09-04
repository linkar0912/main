import { expect, test } from "@playwright/test";

// Regression: long reel captions (white-space: nowrap) used to blow the
// activity list's implicit grid track out to max-content, stretching the
// funnel, campaign banner, and every row under the sticky insights sidebar.
// The list column must stay pinned to the main column's width.
test("campaign activity keeps the main column constrained with long captions", async ({ page }) => {
  await page.route("**/api/automations/automation_1/activity", (route) => route.fulfill({
    json: {
      data: Array.from({ length: 6 }, (_, index) => ({
        id: `p_${index}`,
        sourceMediaSnapshot: {
          id: "media_1",
          caption: "Definitely a spot worth trying if you're obsessed with ramen! Comment for location #ramen #pune #explorepage #fyp #japanesefood #punefoodie",
          mediaType: "VIDEO",
          mediaProductType: "REELS",
          permalink: "https://www.instagram.com/reel/media_1/",
          timestamp: "2026-08-21T00:00:00.000Z",
        },
        matchedKeyword: "location",
        state: "LINK_SENT",
        publicReplyStatus: "SENT",
        openingStatus: "SENT",
        followStatus: true,
        finalDeliveryStatus: "SENT",
      })),
      summary: { commented: 49, openingSent: 49, optedIn: 34, followed: 33, linkSent: 33 },
    },
  }));
  await page.route("**/api/automations/automation_1", (route) => route.fulfill({
    json: { data: { id: "automation_1", name: "Ramen location campaign", status: "ACTIVE", version: 2 } },
  }));
  await page.route("**/api/insights?**", (route) => route.fulfill({
    json: { timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] }, mediaPerformance: [], usage: { participantsThisMonth: 49, monthlyLimit: null } },
  }));

  await page.goto("/automations/automation_1/activity");
  await expect(page.getByRole("heading", { name: "Campaign activity" })).toBeVisible();
  await expect(page.getByText("Ramen location campaign")).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? element.getBoundingClientRect() : null;
    };
    const main = rect(".activity-main");
    const side = rect(".activity-side");
    const funnel = rect(".funnel-strip");
    const banner = rect(".campaign-strip");
    return {
      mainWidth: main ? Math.round(main.width) : null,
      sideX: side ? Math.round(side.x) : null,
      funnelRight: funnel ? Math.round(funnel.right) : null,
      bannerRight: banner ? Math.round(banner.right) : null,
    };
  });

  // Nothing in the main column may cross into the sidebar's column.
  expect(layout.mainWidth).toBeLessThan(layout.sideX! - 24);
  expect(layout.funnelRight).toBeLessThan(layout.sideX!);
  expect(layout.bannerRight).toBeLessThan(layout.sideX!);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Campaign activity" })).toBeVisible();

  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    widestCaption: Math.max(...Array.from(document.querySelectorAll(".activity-caption")).map((element) => element.getBoundingClientRect().right)),
  }));
  expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewport);
  expect(mobile.widestCaption).toBeLessThanOrEqual(mobile.viewport);
});

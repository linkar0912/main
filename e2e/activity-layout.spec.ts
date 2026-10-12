import { expect, test, type Owner } from "./fixtures";

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
        trigger: { type: "comment", match: "keyword", keywords: ["location"], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "Here is the location." }],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

// Regression: long reel captions (white-space: nowrap) used to blow the
// activity list's implicit grid track out to max-content, stretching the
// funnel and every row under the insights sidebar. The funnel must stay in
// its column beside the sidebar, and nothing may widen the page.
test("campaign activity keeps the main column constrained with long captions", async ({ owner }) => {
  const { page } = owner;
  const automationId = await createCampaign(owner, "Ramen location campaign");
  await page.route(`**/api/automations/${automationId}/activity`, (route) => route.fulfill({
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
  await page.route("**/api/insights?**", (route) => route.fulfill({
    json: { timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] }, mediaPerformance: [], usage: { deliveriesThisMonth: 33, monthlyDeliveryLimit: null } },
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/automations/${automationId}/activity`);
  await expect(page.getByRole("heading", { level: 1, name: "Ramen location campaign" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Automation views" }).getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
  const funnel = page.getByLabel("Campaign funnel");
  const aside = page.getByRole("complementary", { name: "Campaign insights" });
  await expect(funnel).toBeVisible();
  await expect(aside).toBeVisible();
  await expect(page.locator(".activity-caption").first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const funnelBox = rect(".campaign-funnel");
    const sideBox = rect(".campaign-aside");
    const participants = rect(".campaign-participants");
    const captions = Array.from(document.querySelectorAll(".activity-caption")).map((element) => element.getBoundingClientRect().right);
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      funnelRight: funnelBox ? Math.round(funnelBox.right) : null,
      sideX: sideBox ? Math.round(sideBox.x) : null,
      sideRight: sideBox ? Math.round(sideBox.right) : null,
      participantsRight: participants ? Math.round(participants.right) : null,
      widestCaption: Math.max(...captions),
    };
  });

  // Nothing in the main column may cross into the sidebar's column.
  expect(layout.funnelRight).toBeLessThan(layout.sideX!);
  expect(layout.participantsRight).toBeLessThanOrEqual(layout.sideRight! + 1);
  expect(layout.widestCaption).toBeLessThanOrEqual(layout.participantsRight!);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Ramen location campaign" })).toBeVisible();
  await expect(page.locator(".activity-caption").first()).toBeVisible();

  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    widestCaption: Math.max(...Array.from(document.querySelectorAll(".activity-caption")).map((element) => element.getBoundingClientRect().right)),
  }));
  expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewport);
  expect(mobile.widestCaption).toBeLessThanOrEqual(mobile.viewport);
});

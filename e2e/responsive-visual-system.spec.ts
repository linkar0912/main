import type { Page } from "@playwright/test";
import { expect, test, type Owner } from "./fixtures";

const routes = [
  "/dashboard",
  "/automations",
  "/quick-automation",
  "/insights",
  "/contacts",
  "/activity",
  "/automations/sequences",
  "/automations/broadcasts",
  "/settings",
  "/profile",
  "/help",
  "/automations/new?type=classic",
];

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 },
];

const dailyPoints = Array.from({ length: 14 }, (_, index) => ({
  day: `2026-08-${String(index + 1).padStart(2, "0")}`,
  count: index + 1,
}));

const insightsFixture = {
  funnel: { COMMENT_MATCHED: 5, OPENING_SENT: 4, OPTED_IN: 3, FOLLOW_VERIFIED: 2, LINK_SENT: 2 },
  timeseries: {
    days: 14,
    sentPerDay: dailyPoints,
    participantsPerDay: dailyPoints.map((point) => ({ ...point, count: Math.max(1, point.count - 2) })),
  },
  mediaPerformance: [{ mediaId: "reel_responsive", matched: 5, delivered: 4, clicked: 2 }],
  capturedEmails: 3,
  optedOut: 1,
  usage: { participantsThisMonth: 5, monthlyLimit: null },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/automations", (route) => route.fulfill({
    json: {
      data: [{
        id: "automation_responsive",
        workspaceId: "workspace_1",
        name: "Responsive launch campaign",
        status: "ACTIVE",
        version: 2,
        definition: {
          version: 2,
          trigger: { type: "comment", source: "next_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: ["launch"] },
          publicReplies: ["Check your DMs!"],
          openingMessage: { text: "Thanks for your comment", optInButtonLabel: "Get it" },
          followGate: { required: true, notFollowingMessage: "Follow us first", recheckButtonLabel: "I followed" },
          delivery: { text: "Here is the launch guide", url: "https://example.com/launch" },
        },
        createdAt: "2026-08-22T00:00:00.000Z",
        updatedAt: "2026-08-22T00:00:00.000Z",
      }],
    },
  }));
  await page.route("**/api/meta/connection", (route) => route.fulfill({
    json: {
      data: [{
        id: "connection_1",
        igUserId: "ig_1",
        username: "mybrand",
        status: "CONNECTED",
        connectedAt: "2026-08-22T00:00:00.000Z",
      }],
    },
  }));
  await page.route("**/api/meta/connection/health", (route) => route.fulfill({
    json: {
      data: [{
        id: "connection_1",
        username: "mybrand",
        status: "CONNECTED",
        requiredFields: ["comments", "messages"],
        subscribedFields: ["comments", "messages"],
        missingFields: [],
      }],
    },
  }));
  await page.route("**/api/facebook/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/meta/media", (route) => route.fulfill({
    json: {
      data: [{
        id: "reel_responsive",
        caption: "Responsive launch Reel",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/responsive/",
        thumbnailUrl: "https://cdn.example/responsive.jpg",
        timestamp: "2026-08-22T00:00:00.000Z",
      }],
      paging: {},
    },
  }));
  await page.route("**/api/insights?**", (route) => route.fulfill({ json: insightsFixture }));
});

for (const viewport of viewports) {
  test(`authenticated routes stay contained at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      // Measure the settled page: not the loading skeleton, and not while a
      // page transition still has the outgoing copy on screen.
      await expect(page.locator(".page-wrap")).toHaveCount(1);
      await expect(page.locator(".page-wrap:not(.skeleton-page)")).toBeVisible();
      // Entrances (the builder's first step slides in from the side) end
      // before measuring; endless ones such as loading shimmer are skipped.
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))));
      const width = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        // Named in the failure message so an overflow says what overflowed.
        overflowing: Array.from(document.querySelectorAll("body *"))
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5)
          .slice(0, 5)
          .map((element) => `${element.tagName.toLowerCase()}.${element.className} → ${Math.round(element.getBoundingClientRect().right)}`),
      }));
      expect(width.document, `${route} ${width.overflowing.join(", ")}`).toBeLessThanOrEqual(width.viewport);
    }
  });
}

/**
 * The marketing home streams in behind the root loading screen, so `goto`
 * can return before its sections exist. Measure only once the page, from the
 * hero to the footer, is on screen.
 */
async function openMarketingHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Reply to every opportunity/i })).toBeVisible();
  await expect(page.locator("#resources")).toBeVisible();
}

test.describe("public marketing route", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("hero headline keeps a restrained responsive scale", async ({ page }) => {
    const cases = [
      { viewport: { width: 390, height: 844 }, maxFontSize: 44 },
      { viewport: { width: 1440, height: 1000 }, maxFontSize: 80 },
    ];

    for (const { viewport, maxFontSize } of cases) {
      await page.setViewportSize(viewport);
      await openMarketingHome(page);
      const heading = page.getByRole("heading", {
        level: 1,
        name: /Reply to every opportunity. Even when you are away./i,
      });
      const metrics = await heading.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          fitsViewport: box.left >= 0 && box.right <= window.innerWidth,
        };
      });

      expect(metrics.fontSize).toBeLessThanOrEqual(maxFontSize);
      expect(metrics.fitsViewport).toBe(true);
    }
  });

  for (const viewport of viewports) {
    test(`marketing home stays contained at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openMarketingHome(page);
      await expect(page.getByRole("heading", {
        level: 1,
        name: /Reply to every opportunity. Even when you are away./i,
      })).toBeVisible();
      const width = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(width.document).toBeLessThanOrEqual(width.viewport);
    });
  }

  test("tablet workflow stage fits its section without clipped overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await openMarketingHome(page);

    const section = page.locator("#workflows");
    const stage = section.locator("[role='tabpanel']").first().locator("..");
    const [sectionBox, stageBox, sectionWidths] = await Promise.all([
      section.boundingBox(),
      stage.boundingBox(),
      section.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      })),
    ]);

    expect(sectionBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(sectionWidths.scroll).toBeLessThanOrEqual(sectionWidths.client);
    expect(stageBox!.x).toBeGreaterThanOrEqual(sectionBox!.x);
    expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width);
  });

  test("automation phone stays fully contained, close to its copy, and keeps reply text visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    const section = page.locator("#how-it-works");
    const stage = section.locator("[data-desktop-stage]");
    const figure = stage.locator("figure");
    const phone = stage.locator("[data-scene-frame]");
    const copy = section.locator('[data-chapter][data-active="true"]');
    const reply = stage.locator('[data-scene="comment"] p').last();
    const [figureBox, phoneBox, copyBox, replyOverflow] = await Promise.all([
      figure.boundingBox(),
      phone.boundingBox(),
      copy.boundingBox(),
      reply.evaluate((element) => ({
        horizontal: element.scrollWidth - element.clientWidth,
        vertical: element.scrollHeight - element.clientHeight,
      })),
    ]);

    expect(figureBox).not.toBeNull();
    expect(phoneBox).not.toBeNull();
    expect(copyBox).not.toBeNull();
    expect(phoneBox!.y).toBeGreaterThanOrEqual(figureBox!.y);
    expect(phoneBox!.y + phoneBox!.height).toBeLessThanOrEqual(figureBox!.y + figureBox!.height);
    expect(phoneBox!.x - (copyBox!.x + copyBox!.width)).toBeLessThanOrEqual(180);
    expect(replyOverflow).toEqual({ horizontal: 0, vertical: 0 });
  });

  test("desktop automation phone fits comfortably below the sticky header", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    const section = page.locator("#how-it-works");
    await section.locator("[data-chapter]").first().scrollIntoViewIfNeeded();
    await expect(page.locator("header[data-surface]")).toBeVisible();

    const [headerBox, phoneBox] = await Promise.all([
      page.locator("header[data-surface]").boundingBox(),
      section.locator("[data-desktop-stage] [data-scene-frame]").boundingBox(),
    ]);

    expect(headerBox).not.toBeNull();
    expect(phoneBox).not.toBeNull();
    expect(phoneBox!.height).toBeLessThanOrEqual(650);
    expect(phoneBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height + 16);
    expect(phoneBox!.y + phoneBox!.height).toBeLessThanOrEqual(876);
  });

  test("short desktop workflow phone stays inside the yellow section at its end boundary", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openMarketingHome(page);

    const section = page.locator("#how-it-works");
    const sectionBounds = await section.evaluate((element) => ({
      top: element.getBoundingClientRect().top + window.scrollY,
      height: element.getBoundingClientRect().height,
    }));
    await page.evaluate(({ top, height }) => {
      window.scrollTo({ top: top + height - window.innerHeight, behavior: "instant" });
    }, sectionBounds);
    await page.waitForTimeout(120);

    const [sectionBox, stageBox, phoneBox] = await Promise.all([
      section.boundingBox(),
      section.locator("[data-desktop-stage]").boundingBox(),
      section.locator("[data-desktop-stage] [data-scene-frame]").boundingBox(),
    ]);

    expect(sectionBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(phoneBox).not.toBeNull();
    expect(phoneBox!.y).toBeGreaterThanOrEqual(stageBox!.y);
    expect(phoneBox!.y + phoneBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height + 1);
    expect(phoneBox!.y + phoneBox!.height).toBeLessThanOrEqual(sectionBox!.y + sectionBox!.height + 1);
  });

  test("top-level marketing section headings use a restrained centered type scale", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    const headingNames = [
      "The best conversations should keep working after you log off.",
      "From the first comment to the right next step.",
      "Choose where Linkar should reply.",
      "Less inbox chasing. More conversations worth joining.",
      "See what Linkar can handle for you.",
      "Every reply, accounted for.",
      "Start replying in three simple steps.",
      "Good questions before you switch anything on.",
    ];

    for (const name of headingNames) {
      const heading = page.getByRole("heading", { level: 2, name });
      const metrics = await heading.evaluate((element) => {
        const section = element.closest("section");
        if (!section) throw new Error("Marketing heading is not inside a section");
        const headingBox = element.getBoundingClientRect();
        const sectionBox = section.getBoundingClientRect();
        const intro = Array.from(element.parentElement?.children ?? []).find((child) => child.tagName === "P");
        return {
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          headingAlign: getComputedStyle(element).textAlign,
          introAlign: intro ? getComputedStyle(intro).textAlign : null,
          centerDelta: Math.abs(
            headingBox.left + headingBox.width / 2 - (sectionBox.left + sectionBox.width / 2),
          ),
        };
      });

      expect(metrics.fontSize, name).toBeLessThanOrEqual(76);
      expect(metrics.headingAlign, name).toBe("center");
      expect(metrics.centerDelta, name).toBeLessThanOrEqual(2);
      if (metrics.introAlign) expect(metrics.introAlign, name).toBe("center");
    }
  });

  test("automation copy and phone form a balanced two-column composition", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    const section = page.locator("#how-it-works");
    const [sectionBox, copyBox, phoneBox] = await Promise.all([
      section.boundingBox(),
      section.locator('[data-chapter][data-active="true"]').boundingBox(),
      section.locator("[data-desktop-stage] [data-scene-frame]").boundingBox(),
    ]);

    expect(sectionBox).not.toBeNull();
    expect(copyBox).not.toBeNull();
    expect(phoneBox).not.toBeNull();
    const compositionCenter = (
      copyBox!.x + copyBox!.width / 2 + phoneBox!.x + phoneBox!.width / 2
    ) / 2;
    const sectionCenter = sectionBox!.x + sectionBox!.width / 2;
    expect(Math.abs(compositionCenter - sectionCenter)).toBeLessThanOrEqual(24);
  });

  test("surface runway starts with its first card fully inside the content gutter", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    const section = page.locator("#surfaces");
    await section.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(100);
    const [viewportBox, firstCardBox] = await Promise.all([
      section.boundingBox(),
      section.getByRole("article").first().boundingBox(),
    ]);

    expect(viewportBox).not.toBeNull();
    expect(firstCardBox).not.toBeNull();
    expect(firstCardBox!.x).toBeGreaterThanOrEqual(viewportBox!.x);
  });

  test("before-and-after closing statement aligns with the centered section axis", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    const section = page.locator("#outcomes");
    const closing = section.getByText(
      "Automation handles the repeatable path. Your attention stays available for judgment.",
    );
    const metrics = await closing.evaluate((element) => {
      const sectionBox = element.closest("section")!.getBoundingClientRect();
      const copyBox = element.getBoundingClientRect();
      return {
        align: getComputedStyle(element).textAlign,
        centerDelta: Math.abs(
          copyBox.left + copyBox.width / 2 - (sectionBox.left + sectionBox.width / 2),
        ),
      };
    });

    expect(metrics.align).toBe("center");
    expect(metrics.centerDelta).toBeLessThanOrEqual(2);
  });

  test("marketing footer stays within the mobile page gutters", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMarketingHome(page);

    const footer = page.locator("#resources");
    const navigation = footer.getByRole("navigation", { name: "Footer" });
    const [footerBox, navigationBox, widths] = await Promise.all([
      footer.boundingBox(),
      navigation.boundingBox(),
      footer.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth })),
    ]);

    expect(footerBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    expect(navigationBox!.x).toBeGreaterThanOrEqual(footerBox!.x + 20);
    expect(navigationBox!.x + navigationBox!.width).toBeLessThanOrEqual(footerBox!.x + footerBox!.width - 20);
  });

  test("footer get-started action remains fully inside the mobile footer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMarketingHome(page);

    const footer = page.locator("#resources");
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);

    const [footerBox, actionBox] = await Promise.all([
      footer.boundingBox(),
      footer.getByRole("link", { name: "Get started" }).boundingBox(),
    ]);

    expect(footerBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.x).toBeGreaterThanOrEqual(footerBox!.x + 20);
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(footerBox!.x + footerBox!.width - 20);
  });

  test("automation phone remains inside the mobile content column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMarketingHome(page);

    const section = page.locator("#how-it-works");
    const chapter = section.locator("[data-chapter]").first();
    const phone = chapter.locator("[data-scene-frame]");
    const [chapterBox, phoneBox] = await Promise.all([chapter.boundingBox(), phone.boundingBox()]);

    expect(chapterBox).not.toBeNull();
    expect(phoneBox).not.toBeNull();
    expect(phoneBox!.x).toBeGreaterThanOrEqual(chapterBox!.x);
    expect(phoneBox!.x + phoneBox!.width).toBeLessThanOrEqual(chapterBox!.x + chapterBox!.width);
  });

  test("automation avoids a clipped caption beneath the phone", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMarketingHome(page);

    await expect(page.locator("#how-it-works [data-desktop-stage] figcaption")).toBeHidden();
  });

  test("public tablet navigation keeps a full-size menu target", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await openMarketingHome(page);
    const menu = await page.getByRole("button", { name: "Open menu" }).boundingBox();
    expect(menu).not.toBeNull();
    expect(menu!.width).toBeGreaterThanOrEqual(44);
    expect(menu!.height).toBeGreaterThanOrEqual(44);
  });

  // Phones compare one plan at a time (Free / Creator / Growth / Agency)
  // instead of scrolling a 640px table sideways.
  for (const width of [360, 390]) {
    test(`pricing comparison switches plans without sideways scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/pricing");
      const comparison = page.getByRole("region", { name: "Compare plans and pricing info" });
      const planSwitch = comparison.getByRole("group", { name: "Plan to compare" });
      const table = comparison.getByRole("table");
      await planSwitch.scrollIntoViewIfNeeded();
      await expect(planSwitch).toBeVisible();

      await expect(table.getByRole("columnheader", { name: /^Free/ })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /^Growth/ })).toHaveCount(0);
      await planSwitch.locator("label", { hasText: "Growth" }).click();
      await expect(table.getByRole("columnheader", { name: /^Growth/ })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /^Free/ })).toHaveCount(0);
      await expect(table.getByRole("row", { name: /Monthly deliveries/ }).getByRole("cell", { name: "25,000" })).toBeVisible();

      const widths = await comparison.locator("[aria-label='Scrollable plan comparison']").evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
      expect(widths.document).toBeLessThanOrEqual(width);
    });
  }

  test("pricing comparison stays one table on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/pricing");
    const comparison = page.getByRole("region", { name: "Compare plans and pricing info" });
    await expect(comparison.getByRole("group", { name: "Plan to compare" })).toHaveCount(0);
    for (const plan of ["Free", "Creator", "Growth", "Agency"]) {
      await expect(comparison.getByRole("columnheader", { name: new RegExp(`^${plan}`) })).toHaveCount(1);
    }
  });
});

/** The mocked analytics the beforeEach serves, for pages in an owner's own context. */
async function mockInsights(page: Page) {
  await page.route("**/api/insights?**", (route) => route.fulfill({ json: insightsFixture }));
}

/**
 * A real automation in the owner's own workspace: the automation list and
 * Home render from the database on the server, so a browser mock cannot
 * stand in for them.
 */
async function seedAutomation(owner: Owner, name = "Responsive launch campaign") {
  const account = await owner.connectInstagram("mybrand");
  const response = await owner.page.request.post("/api/automations", {
    data: {
      provider: "INSTAGRAM",
      instagramAccountId: account.igUserId,
      name,
      status: "DRAFT",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["launch"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Here is the launch guide" }],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
}

test("mobile settings stacks connection copy above its action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Phones drill in: /settings is the list of sections, a section is its own page.
  await page.goto("/settings?section=connections");
  // The empty Facebook Page row (the mocked workspace has only Instagram).
  const row = page.locator('[data-channel-card="facebook"] .prefs-row').first();
  const copy = await row.locator(".prefs-row-copy").boundingBox();
  const action = await row.locator(".prefs-row-control").boundingBox();
  expect(copy).not.toBeNull();
  expect(action).not.toBeNull();
  expect(copy!.width).toBeGreaterThan(220);
  expect(action!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
});

test("mobile automation controls wrap inside their row", async ({ owner }) => {
  await seedAutomation(owner);
  const { page } = owner;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/automations");
  const row = page.getByRole("article", { name: "Responsive launch campaign" });
  const actions = row.getByRole("group", { name: "Actions for Responsive launch campaign" });
  await expect(actions).toBeVisible();
  const rowBox = await row.boundingBox();
  const actionBox = await actions.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.x).toBeGreaterThanOrEqual(rowBox!.x);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
  const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});

test("authenticated tablet navigation keeps a full-size app target", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/dashboard");
  const menu = await page.getByRole("button", { name: "Open navigation" }).boundingBox();
  expect(menu).not.toBeNull();
  expect(menu!.width).toBeGreaterThanOrEqual(44);
  expect(menu!.height).toBeGreaterThanOrEqual(44);
});

test("profile dashboard keeps cards aligned with a compact vertical rhythm", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profile");
  const identityRegion = page.getByRole("region", { name: "Profile identity" });
  const actionsRegion = page.getByRole("region", { name: "Account actions" });
  const supportRegion = page.getByRole("complementary", { name: "Profile supporting information" });
  // The channel list loads after hydration; measure once it has settled.
  await expect(supportRegion.getByRole("status", { name: "Instagram connected" })).toBeVisible();
  const identity = await identityRegion.boundingBox();
  const actions = await actionsRegion.boundingBox();
  const support = await supportRegion.boundingBox();
  expect(identity).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(support).not.toBeNull();
  // Identity spans the top; the account actions and the supporting column
  // start together on one line beneath it, side by side.
  expect(actions!.y).toBeGreaterThan(identity!.y + identity!.height);
  expect(actions!.y - (identity!.y + identity!.height)).toBeLessThanOrEqual(48);
  expect(Math.abs(actions!.y - support!.y)).toBeLessThanOrEqual(2);
  expect(support!.x).toBeGreaterThan(actions!.x + actions!.width);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-profile-redesign.png", fullPage: true });
});

test("settings desktop overview is bounded and balanced", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const instagramGroup = page.locator('[data-channel-card="instagram"]');
  const facebookGroup = page.locator('[data-channel-card="facebook"]');
  await expect(instagramGroup.getByText("@mybrand")).toBeVisible();
  const navBox = await nav.boundingBox();
  const instagram = await instagramGroup.boundingBox();
  const facebook = await facebookGroup.boundingBox();
  expect(navBox).not.toBeNull();
  expect(instagram).not.toBeNull();
  expect(facebook).not.toBeNull();
  // Section list on the left, the open section beside it in one bounded
  // column: both channel groups share its width and left edge.
  expect(instagram!.x).toBeGreaterThan(navBox!.x + navBox!.width);
  expect(Math.abs(instagram!.x - facebook!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(instagram!.width - facebook!.width)).toBeLessThanOrEqual(2);
  expect(facebook!.y).toBeGreaterThanOrEqual(instagram!.y + instagram!.height);
  expect(instagram!.width).toBeLessThanOrEqual(900);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-settings-redesign.png", fullPage: true });
});

test("home and insights share one headline-figure treatment", async ({ owner }) => {
  await seedAutomation(owner);
  const { page } = owner;
  await mockInsights(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  const figureStyle = (element: Element) => {
    const style = getComputedStyle(element);
    return { size: style.fontSize, weight: style.fontWeight, numbers: style.fontVariantNumeric };
  };
  const homeItems = page.getByRole("list", { name: "Performance summary" }).getByRole("listitem");
  await expect(homeItems).toHaveCount(3);
  const homeStyle = await homeItems.first().locator(".perf-figure-value").evaluate(figureStyle);
  expect(homeStyle.numbers).toContain("tabular-nums");
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-home-stats-redesign.png", fullPage: true });

  await page.goto("/insights");
  const items = page.getByRole("list", { name: "Performance summary" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  const boxes = await items.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width };
  }));
  // The two series figures sit side by side as the chart's legend.
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(2);
  expect(await items.first().locator(".perf-figure-value").evaluate(figureStyle)).toEqual(homeStyle);
  if (process.env.VISUAL_REVIEW) {
    await page.screenshot({ path: "/tmp/linkar-insights-redesign.png", fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: "/tmp/linkar-insights-redesign-dark.png", fullPage: true });
  }
});

test("workspace navigation keeps pricing out of the sidebar and policies in settings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/insights");
  const accountNavigation = page.getByRole("navigation", { name: "Account" });
  await expect(accountNavigation.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(accountNavigation.getByRole("link", { name: "Pricing" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Workspace resources" })).toHaveCount(0);
  // The copyright footer was dropped on purpose: the sidebar is the only chrome.
  await expect(page.locator(".app-footer")).toHaveCount(0);

  await page.goto("/settings");
  await page.getByRole("button", { name: /Policies/ }).click();
  const policies = page.getByRole("region", { name: "Policies and support" });
  // Support (2) and every policy page (7).
  await expect(policies.getByRole("link")).toHaveCount(9);
  await expect(policies.getByRole("link", { name: /Privacy policy/ })).toHaveAttribute("href", "/privacy");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const sidebar = page.getByLabel("Workspace sidebar");
  await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Pricing" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-app-links-mobile.png", fullPage: true });
});

test("conversation actions form one compact desktop toolbar", async ({ page }) => {
  await page.route("**/api/inbox**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/inbox") return route.fulfill({ json: { data: { contacts: [{
      id: "contact_toolbar",
      username: "aanya",
      avatarUrl: null,
      preview: "Send me the guide",
      lastMessageAt: "2026-09-04T10:00:00.000Z",
      canMessage: true,
      unread: false,
      leadStatus: "ENGAGED",
      tags: [],
      inboxStatus: "OPEN",
      favorite: false,
    }], members: [{ userId: "owner_1", email: "owner@example.com", role: "OWNER" }] } } });
    return route.fulfill({ json: { data: { messages: [] } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/activity");
  await page.getByRole("button", { name: /open conversation with @aanya/i }).click();
  const toolbar = page.getByRole("toolbar", { name: "Conversation actions" });
  await expect(toolbar).toBeVisible();
  // The thread pane is narrower than 860px at this width, so the actions take
  // their own full-width row under the contact (a container query): what
  // stays compact is one row of 34px controls that never spills out of it.
  const layout = await toolbar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const head = element.parentElement!.getBoundingClientRect();
    const items = Array.from(element.children).map((child) => child.getBoundingClientRect()).filter((rect) => rect.width > 0);
    return {
      height: box.height,
      tallest: Math.max(...items.map((rect) => rect.height)),
      rows: new Set(items.map((rect) => Math.round(rect.top + rect.height / 2))).size,
      overflow: Math.max(...items.map((rect) => rect.right)) - Math.min(box.right, head.right),
    };
  });
  expect(layout.height).toBeLessThanOrEqual(46);
  expect(layout.tallest).toBeLessThanOrEqual(36);
  expect(layout.rows).toBe(1);
  expect(layout.overflow).toBeLessThanOrEqual(1);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-inbox-toolbar-redesign.png", fullPage: true });
});

test("inbox channel switching uses compact underline tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/activity");
  const tabs = page.getByRole("tablist", { name: "Inbox channels" });
  const activeTab = tabs.getByRole("tab", { name: "Instagram" });
  await expect(tabs).toBeVisible();
  await expect(activeTab).toHaveAttribute("aria-selected", "true");
  // Underline tabs sized to their labels, not a full-width bar.
  const tabsWidth = await tabs.evaluate((element) => {
    const rects = Array.from(element.querySelectorAll('[role="tab"]')).map((tab) => tab.getBoundingClientRect());
    return Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left));
  });
  expect(tabsWidth).toBeLessThan(520);
  await page.getByRole("tab", { name: "Facebook" }).click();
  await expect(tabs.getByRole("tab", { name: "Facebook" })).toHaveAttribute("aria-selected", "true");
  await expect(activeTab).toHaveAttribute("aria-selected", "false");
  await activeTab.click();
  await expect(activeTab).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await tabs.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeGreaterThanOrEqual(16);
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(374);
  for (const tab of await tabs.getByRole("tab").all()) {
    const box = await tab.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  if (process.env.VISUAL_REVIEW) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: "/tmp/linkar-inbox-tabs-dark.png", fullPage: true });
  }
});

test("jade connection status stays vivid and calm in dark mode", async ({ page }) => {
  // Set in this page's own storage only, so no other spec inherits dark mode.
  await page.addInitScript(() => localStorage.setItem("linkar-theme", "dark"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profile");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const status = page.getByRole("status", { name: "Instagram connected" });
  await expect(status).toBeVisible();
  const colors = await status.evaluate((element) => {
    const dot = element.querySelector<HTMLElement>(".signal-dot");
    const resolve = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return {
      jade: resolve("var(--status-ok)"),
      muted: resolve("var(--muted)"),
      text: getComputedStyle(element).color,
      dot: dot ? getComputedStyle(dot).backgroundColor : "",
      dotAnimation: dot ? getComputedStyle(dot).animationName : "",
    };
  });
  // Vivid: the dot carries the dark theme's jade. Calm: it does not pulse,
  // and the words stay in the quiet text colour.
  expect(colors.dot).toBe(colors.jade);
  expect(colors.dotAnimation).toBe("none");
  expect(colors.text).toBe(colors.muted);
  expect(colors.text).not.toBe(colors.jade);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-profile-redesign-dark.png", fullPage: true });
});

test("mobile and tablet builder progress keeps descriptive labels", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/automations/new?type=classic");
    await expect(page.locator(".builder-stepper-current")).toContainText("When it runs");
  }
});

test("mobile sequence edit actions remain comfortably tappable", async ({ page }) => {
  await page.route("**/api/sequences", (route) => route.fulfill({
    json: {
      data: [{
        id: "sequence_1",
        name: "Nurture",
        status: "DRAFT",
        steps: [{ id: "step_1", delayHours: 0, text: "Hello" }],
        enrolledCount: 0,
      }],
    },
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/automations/sequences");
  await page.getByRole("button", { name: "Edit Nurture" }).click();
  const cancel = await page.getByRole("button", { name: "Cancel editing" }).boundingBox();
  expect(cancel).not.toBeNull();
  expect(cancel!.height).toBeGreaterThanOrEqual(44);
});

test("desktop chart fills the content field", async ({ owner }) => {
  await seedAutomation(owner);
  const { page } = owner;
  await mockInsights(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  const panelLocator = page.getByRole("region", { name: "Performance over time" });
  await expect(panelLocator.locator(".perf-chart")).toBeVisible();
  const panel = await panelLocator.boundingBox();
  const plot = await panelLocator.locator(".perf-chart").boundingBox();
  expect(panel).not.toBeNull();
  expect(plot).not.toBeNull();
  expect(plot!.width).toBeGreaterThan(panel!.width * 0.9);
});

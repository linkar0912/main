import { expect, test } from "@playwright/test";

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
  await page.route("**/api/insights?**", (route) => route.fulfill({
    json: {
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
    },
  }));
});

for (const viewport of viewports) {
  test(`authenticated routes stay contained at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator(".page-wrap")).toBeVisible();
      const width = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(width.document, route).toBeLessThanOrEqual(width.viewport);
    }
  });
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
      await page.goto("/");
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
      await page.goto("/");
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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

    const headingNames = [
      "The best conversations should keep working after you log off.",
      "One spark. A conversation that knows what comes next.",
      "Meet people where the conversation starts.",
      "Less inbox chasing. More conversations worth joining.",
      "Build the path your audience actually needs.",
      "From first connection to live flow in three clear steps.",
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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

    await expect(page.locator("#how-it-works [data-desktop-stage] figcaption")).toBeHidden();
  });

  test("public tablet navigation keeps a full-size menu target", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    const menu = await page.getByRole("button", { name: "Open menu" }).boundingBox();
    expect(menu).not.toBeNull();
    expect(menu!.width).toBeGreaterThanOrEqual(44);
    expect(menu!.height).toBeGreaterThanOrEqual(44);
  });
});

test("mobile settings stacks connection copy above its action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const copy = await page.locator(".settings-copy").first().boundingBox();
  const action = await page.locator(".settings-action").first().boundingBox();
  expect(copy).not.toBeNull();
  expect(action).not.toBeNull();
  expect(copy!.width).toBeGreaterThan(220);
  expect(action!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
});

test("mobile automation controls wrap inside their row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/automations");
  const row = page.getByRole("article", { name: "" }).filter({ hasText: "Responsive launch campaign" });
  const actions = row.locator(".automation-actions");
  const rowBox = await row.boundingBox();
  const actionBox = await actions.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.x).toBeGreaterThanOrEqual(rowBox!.x);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
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
  await page.waitForTimeout(600);
  const identity = await page.getByLabel("Account overview").boundingBox();
  const connection = await page.getByLabel("Connected channels").boundingBox();
  const security = await page.getByLabel("Security").boundingBox();
  expect(identity).not.toBeNull();
  expect(connection).not.toBeNull();
  expect(security).not.toBeNull();
  expect(security!.y).toBeGreaterThan(identity!.y + identity!.height);
  expect(Math.abs(security!.y - connection!.y)).toBeLessThanOrEqual(2);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-profile-redesign.png", fullPage: true });
});

test("settings desktop overview is bounded and balanced", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  await page.waitForTimeout(600);
  const connection = await page.locator(".instagram-settings-card").boundingBox();
  const facebook = await page.locator(".facebook-settings-card").boundingBox();
  expect(connection).not.toBeNull();
  expect(facebook).not.toBeNull();
  expect(Math.abs(connection!.y - facebook!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(connection!.width - facebook!.width)).toBeLessThanOrEqual(2);
  expect(facebook!.x).toBeGreaterThan(connection!.x + connection!.width);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-settings-redesign.png", fullPage: true });
});

test("home and insights share one quiet performance-stat treatment", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  const homeRow = page.locator(".stat-row").first();
  const homeStat = homeRow.locator(".stat-block").first();
  await expect(homeStat).toBeVisible();
  const homeStyle = await homeStat.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderWidth, radius: style.borderRadius, padding: style.padding };
  });
  expect(await homeRow.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-home-stats-redesign.png", fullPage: true });

  await page.goto("/insights");
  const items = page.getByRole("list", { name: "Performance summary" }).getByRole("listitem");
  await expect(items).toHaveCount(4);
  const boxes = await items.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width };
  }));
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
  expect(Math.abs(boxes[0].y - boxes[3].y)).toBeLessThanOrEqual(2);
  const insightsRow = page.getByRole("list", { name: "Performance summary" });
  const insightsStat = insightsRow.locator(".stat-block").first();
  await expect(insightsStat).toBeVisible();
  const insightsStyle = await insightsStat.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderWidth, radius: style.borderRadius, padding: style.padding };
  });
  expect(await insightsRow.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
  expect(insightsStyle).toEqual(homeStyle);
  if (process.env.VISUAL_REVIEW) {
    await page.screenshot({ path: "/tmp/linkar-insights-redesign.png", fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: "/tmp/linkar-insights-redesign-dark.png", fullPage: true });
  }
});

test("workspace navigation exposes pricing and public resources without crowding the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/insights");
  const accountNavigation = page.getByRole("navigation", { name: "Account" });
  await expect(accountNavigation.getByRole("link", { name: "Pricing" })).toBeVisible();
  const resources = page.getByRole("navigation", { name: "Workspace resources" });
  await expect(resources.getByRole("link")).toHaveCount(8);
  const footer = page.locator(".app-footer");
  await expect(footer).toBeVisible();
  const footerBox = await footer.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.width).toBeGreaterThan(900);
  if (process.env.VISUAL_REVIEW) {
    await page.screenshot({ path: "/tmp/linkar-app-links-desktop.png", fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: "/tmp/linkar-app-links-dark.png", fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByLabel("Workspace sidebar").getByRole("link", { name: "Pricing" })).toBeVisible();
  await page.keyboard.press("Escape");
  await footer.scrollIntoViewIfNeeded();
  const mobileFooterBox = await footer.boundingBox();
  expect(mobileFooterBox).not.toBeNull();
  expect(mobileFooterBox!.width).toBeLessThanOrEqual(354);
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
  const box = await toolbar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(46);
  expect(box!.width).toBeLessThanOrEqual(440);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-inbox-toolbar-redesign.png", fullPage: true });
});

test("inbox channel switching uses the compact segmented control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/activity");
  const tabs = page.getByRole("tablist", { name: "Inbox channels" });
  const activeTab = tabs.getByRole("tab", { name: "Instagram conversations" });
  await expect(tabs).toBeVisible();
  const layout = await tabs.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const active = element.querySelector<HTMLElement>('[aria-selected="true"]');
    const style = getComputedStyle(element);
    return {
      width: box.width,
      radius: parseFloat(style.borderRadius),
      background: style.backgroundColor,
      activeBackground: active ? getComputedStyle(active).backgroundColor : "",
    };
  });
  expect(layout.width).toBeLessThan(520);
  expect(layout.radius).toBeGreaterThanOrEqual(20);
  expect(layout.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(layout.activeBackground).not.toBe("rgba(0, 0, 0, 0)");
  await expect(activeTab).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await tabs.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeGreaterThanOrEqual(16);
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(374);
  if (process.env.VISUAL_REVIEW) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: "/tmp/linkar-inbox-tabs-dark.png", fullPage: true });
  }
});

test("jade connection status stays vivid and calm in dark mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("linkar-theme", "dark"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profile");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const status = page.getByRole("status", { name: "Instagram connected" });
  await expect(status).toBeVisible();
  const colors = await status.evaluate((element) => {
    const dot = element.querySelector<HTMLElement>(".signal-dot");
    return {
      text: getComputedStyle(element).color,
      dot: dot ? getComputedStyle(dot).backgroundColor : "",
    };
  });
  expect(colors.text).toBe("rgb(98, 230, 185)");
  expect(colors.dot).toBe("rgb(98, 230, 185)");
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-profile-redesign-dark.png", fullPage: true });
});

test("mobile and tablet builder progress keeps descriptive labels", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/automations/new?type=classic");
    await expect(page.locator(".wizard-progress-label").first()).toBeVisible();
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

test("desktop chart fills the content field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  const panel = await page.locator(".chart-panel").boundingBox();
  const plot = await page.locator(".chart-plot").boundingBox();
  expect(panel).not.toBeNull();
  expect(plot).not.toBeNull();
  expect(plot!.width).toBeGreaterThan(panel!.width * 0.9);
});

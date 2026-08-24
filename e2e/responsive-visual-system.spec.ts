import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/automations",
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
  await page.route("**/api/insights", (route) => route.fulfill({
    json: {
      timeseries: {
        sentPerDay: dailyPoints,
        participantsPerDay: dailyPoints.map((point) => ({ ...point, count: Math.max(1, point.count - 2) })),
      },
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

test("mobile settings stacks connection copy above its action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const copy = await page.locator(".settings-copy").first().boundingBox();
  const action = await page.locator(".settings-action").first().boundingBox();
  expect(copy).not.toBeNull();
  expect(action).not.toBeNull();
  expect(copy!.width).toBeGreaterThan(300);
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

test("profile sections use a compact vertical rhythm", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profile");
  const panels = page.locator(".profile-main > .panel");
  const first = await panels.nth(0).boundingBox();
  const second = await panels.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(second!.y - (first!.y + first!.height)).toBeLessThanOrEqual(24);
});

test("mobile builder progress keeps descriptive labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/automations/new?type=classic");
  await expect(page.locator(".wizard-progress-label").first()).toBeVisible();
});

test("desktop chart fills the content field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const panel = await page.locator(".chart-panel").boundingBox();
  const plot = await page.locator(".chart-plot").boundingBox();
  expect(panel).not.toBeNull();
  expect(plot).not.toBeNull();
  expect(plot!.width).toBeGreaterThan(panel!.width * 0.9);
});

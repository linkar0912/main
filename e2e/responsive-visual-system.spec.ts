import { expect, test } from "@playwright/test";

const routes = [
  "/dashboard",
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

test.describe("public marketing route", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const viewport of viewports) {
    test(`marketing home stays contained at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", {
        level: 1,
        name: /Turn attention into conversations that keep moving/i,
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
  const identity = await page.getByLabel("Account summary").boundingBox();
  const connection = await page.getByLabel("Connected Instagram").boundingBox();
  const security = await page.getByLabel("Security").boundingBox();
  expect(identity).not.toBeNull();
  expect(connection).not.toBeNull();
  expect(security).not.toBeNull();
  expect(Math.abs(identity!.y - connection!.y)).toBeLessThanOrEqual(2);
  expect(security!.y - (Math.max(identity!.y + identity!.height, connection!.y + connection!.height))).toBeLessThanOrEqual(24);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-profile-redesign.png", fullPage: true });
});

test("settings desktop overview is bounded and balanced", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  await page.waitForTimeout(600);
  const connection = await page.locator(".instagram-settings-card").boundingBox();
  const webhook = await page.getByLabel("Webhook health").boundingBox();
  expect(connection).not.toBeNull();
  expect(webhook).not.toBeNull();
  expect(Math.abs(connection!.y - webhook!.y)).toBeLessThanOrEqual(2);
  expect(connection!.width).toBeGreaterThan(webhook!.width);
  expect(connection!.width + webhook!.width).toBeGreaterThan(850);
  if (process.env.VISUAL_REVIEW) await page.screenshot({ path: "/tmp/linkar-settings-redesign.png", fullPage: true });
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

import { expect, test } from "@playwright/test";

test.describe("unauthenticated visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("workspace requires authentication", async ({ page, request }) => {
    for (const path of ["/", "/profile", "/help"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    }

    const response = await request.get("/api/automations");
    expect(response.status()).toBe(401);
  });
});

test("owner can sign out", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`signout-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("replyconnect-e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/automations$/);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

test("member can sign up and sign back in", async ({ page }) => {
  const email = `member-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("replyconnect-e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/automations$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("replyconnect-e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Hello,/ })).toBeVisible();
});

test("dashboard and automation list are reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sidebar-brand")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Hello,/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance over time" })).toBeVisible();
  await page.getByRole("link", { name: "Automations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
});

test("classic builder creates a keyword autoresponder", async ({ page }) => {
  await page.goto("/automations/new?type=classic");
  await expect(page.getByRole("heading", { name: /Build a reply flow/i })).toBeVisible();

  await page.getByLabel("Automation name").fill(`E2E Autoresponder ${Date.now()}`);
  await page.getByLabel("Trigger source").selectOption("message");
  await page.getByLabel("Keywords").fill("price");
  await page.getByLabel("Message text").fill("Here is the pricing you asked for.");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");

  await page.goto("/automations");
  await expect(page.getByText(/DM contains price/).first()).toBeVisible();
});

test("basic template gallery sets up a ready-to-edit automation", async ({ page }) => {
  await page.goto("/automations/templates");
  await expect(page.getByRole("heading", { name: "Automation", exact: true })).toBeVisible();

  // Every recipe ships runnable — nothing is BETA or unavailable any more.
  const followCard = page.locator(".template-card", { hasText: "Say hi to new followers" });
  await expect(followCard.getByRole("link", { name: "Set Up" })).toBeVisible();
  await expect(page.getByText(/Unavailable for now\./)).toHaveCount(0);
  await expect(page.getByText("BETA")).toHaveCount(0);

  const startersCard = page.locator(".template-card", { hasText: "Conversation Starters" });
  await startersCard.getByRole("link", { name: "Set Up" }).click();
  await expect(page.getByRole("heading", { name: /Build a reply flow/i })).toBeVisible();
  await expect(page.getByLabel("Automation name")).toHaveValue("Conversation starters");

  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");

  await page.goto("/automations");
  await expect(page.getByText(/DM contains price/).first()).toBeVisible();
});

test("guided builder saves an automation", async ({ page }) => {
  // `/automations/new` now always opens the version 2 campaign builder (see the
  // "guided builder creates a follow-gated Reel campaign" test below); the
  // legacy single-response version 1 builder is only reachable by editing an
  // existing version 1 automation, so exercise that path directly here.
  // `page.request` shares the signed-in page's cookies; the standalone `request`
  // fixture does not, and would get 401s here.
  const created = await page.request.post("/api/automations", {
    data: {
      name: "E2E guide delivery",
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "Here is the guide: https://example.com/guide" }],
      },
    },
  });
  expect(created.ok()).toBeTruthy();
  const { data } = (await created.json()) as { data: { id: string } };

  await page.goto(`/automations/${data.id}/edit`);
  await expect(page.getByRole("heading", { name: "Tune this automation" })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");
});

test("guided builder creates a follow-gated Reel campaign", async ({ page }) => {
  const automationName = `E2E Reel guide ${Date.now()}`;
  const reelFixture = {
    id: "media_1",
    caption: "Test Reel",
    mediaType: "VIDEO",
    mediaProductType: "REELS",
    permalink: "https://www.instagram.com/reel/demo/",
    thumbnailUrl: "https://cdn.example/reel.jpg",
    timestamp: "2026-08-21T00:00:00.000Z",
  } as const;
  await page.route("**/api/meta/media", (route) =>
    route.fulfill({ json: { data: [reelFixture], paging: {} } }),
  );

  await page.goto("/automations");
  await page.getByRole("link", { name: "New automation" }).click();
  await expect(page.getByRole("heading", { name: "Pick a starting point." })).toBeVisible();
  await page.getByRole("link", { name: /Build campaign/i }).click();
  await expect(page.getByRole("heading", { name: "Build a follow-gated Reel campaign" })).toBeVisible();

  await page.getByLabel("Automation name").fill(automationName);
  await page.getByRole("checkbox", { name: /test reel/i }).check();
  await page.getByLabel("Keywords").fill("guide");
  await page.getByLabel("Opening message text").fill("Reply guide! Tap below and I will send it over.");
  await page.getByLabel("Delivery message").fill("You are verified — here is your guide.");
  await page.getByLabel("Delivery link").fill("http://localhost/guide");

  // Review the follow gate before saving: the gate is enabled by default and
  // the review step summarizes it explicitly.
  await page.getByLabel("Not-following prompt").fill("Follow us first, then tap I followed to unlock this.");
  await expect(page.getByLabel("Recheck button label")).toHaveValue("I followed");
  await expect(page.getByTestId("review-summary")).toContainText(
    "Opening DM asks for a follow before delivering anything",
  );

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");

  await page.goto("/automations");
  const row = page.getByRole("article").filter({ hasText: automationName });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: /activity/i })).toBeVisible();
});

test("sequence load failures are visible", async ({ page }) => {
  await page.route("**/api/sequences", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Sequence service unavailable" }),
  }));

  await page.goto("/automations/sequences");

  await expect(page.locator(".form-error")).toContainText("Sequence service unavailable");
  await expect(page.getByText(/No sequences yet/)).toHaveCount(0);
});

test("sequence source links can be cleared explicitly", async ({ page }) => {
  let patchBody: unknown;
  const sequence = {
    id: "sequence_1",
    name: "Lead nurture",
    status: "DRAFT",
    steps: [{ id: "step_1", delayHours: 0, text: "Welcome" }],
    sourceAutomationId: "automation_1",
    enrolledCount: 0,
  };
  await page.route("**/api/sequences", (route) => route.fulfill({ json: { data: [sequence] } }));
  await page.route("**/api/automations", (route) => route.fulfill({
    json: { data: [{ id: "automation_1", name: "Email capture", version: 1 }] },
  }));
  await page.route("**/api/sequences/sequence_1", async (route) => {
    patchBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: { ...sequence, sourceAutomationId: undefined } } });
  });

  await page.goto("/automations/sequences");
  await page.getByRole("button", { name: "Edit Lead nurture" }).click();
  await page.getByLabel("Enroll leads captured by").selectOption("");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => patchBody).toMatchObject({ sourceAutomationId: null });
});

test("activity export stays scoped to the selected automation", async ({ page }) => {
  await page.route("**/api/automations/automation_1/activity", (route) => route.fulfill({
    json: { data: [], summary: { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 } },
  }));
  await page.route("**/api/insights?automationId=automation_1", (route) => route.fulfill({
    json: { timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] }, mediaPerformance: [] },
  }));

  await page.goto("/automations/automation_1/activity");

  await expect(page.getByRole("link", { name: /export csv/i }))
    .toHaveAttribute("href", "/api/insights/export?automationId=automation_1");
});

test("Facebook review pages are reachable", async ({ page }) => {
  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/data-deletion", "Data deletion"], ["/support", "Support"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

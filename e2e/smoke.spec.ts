import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("replyconnect-e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("owner workspace requires authentication", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);

  const response = await request.get("/api/automations");
  expect(response.status()).toBe(401);
});

test("owner can sign out", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("dashboard and automation list are reachable", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("ReplyConnect", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Make every signal useful." })).toBeVisible();
  await page.getByRole("link", { name: "Automations" }).first().click();
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
});

test("guided builder saves an automation", async ({ page }) => {
  // `/automations/new` now always opens the version 2 campaign builder (see the
  // "guided builder creates a follow-gated Reel campaign" test below); the
  // legacy single-response version 1 builder is only reachable by editing an
  // existing version 1 automation, so exercise that path directly here.
  await signIn(page);
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
  };
  await page.route("**/api/meta/media", (route) =>
    route.fulfill({ json: { data: [reelFixture], paging: {} } }),
  );

  await signIn(page);
  await page.goto("/automations");
  await page.getByRole("link", { name: "New automation" }).click();
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

  await page.getByRole("link", { name: "Back to automations" }).click();
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  const row = page.getByRole("article").filter({ hasText: automationName });
  await expect(row.getByRole("link", { name: /activity/i })).toBeVisible();
});

test("Facebook review pages are reachable", async ({ page }) => {
  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/data-deletion", "Data deletion"], ["/support", "Support"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

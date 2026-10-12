import { expect, test, type Owner } from "./fixtures";

// Pages that render from the database on the server (the automation list,
// Home, an automation's own pages) are exercised in a workspace of their own
// (the `owner` fixture) with real rows; client-fetched Meta endpoints are
// still mocked because the seeded account has no usable Meta token.

const KEYWORD_DM = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["price"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Here is the pricing you asked for." }],
};

/** Connects an Instagram account and answers the builder's account lookup with it. */
async function connectInstagram(owner: Owner) {
  const instagram = await owner.connectInstagram("testbrand");
  await owner.page.route("**/api/meta/connection", (route) => route.fulfill({
    json: { data: [{ id: instagram.id, igUserId: instagram.igUserId, username: instagram.username, status: "CONNECTED", connectedAt: "2026-09-01T00:00:00.000Z" }] },
  }));
  return instagram;
}

/** Creates a real automation through the API, pinned to a connected account. */
async function createAutomation(owner: Owner, name: string): Promise<{ id: string }> {
  const instagram = await connectInstagram(owner);
  const response = await owner.page.request.post("/api/automations", {
    data: { provider: "INSTAGRAM", instagramAccountId: instagram.igUserId, name, status: "DRAFT", definition: KEYWORD_DM },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { data } = (await response.json()) as { data: { id: string } };
  return { id: data.id };
}

test.describe("unauthenticated visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("workspace requires authentication", async ({ page, request }) => {
    for (const path of ["/dashboard", "/profile", "/help"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    }

    const response = await request.get("/api/automations");
    expect(response.status()).toBe(401);
  });

  test("public home exposes the hero and signup path", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", {
      level: 1,
      name: /Reply to every opportunity. Even when you are away./i,
    })).toBeVisible();
    await page.getByRole("link", { name: "Create your first reply" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("public mobile navigation and FAQ work without an account", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const opener = page.getByRole("button", { name: "Open menu" });
    await opener.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
    await expect(opener).toBeFocused();

    const question = page.getByRole("button", { name: "How does Linkar protect my account?" });
    await question.scrollIntoViewIfNeeded();
    await expect(question).toHaveAttribute("aria-expanded", "false");
    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/encrypts stored access tokens/i)).toBeVisible();
  });
});

// Signs out a workspace of its own: logging out revokes that session, which
// must never be the one every other spec shares.
test("owner can sign out", async ({ owner }) => {
  const { page } = owner;
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test("new signup requires email confirmation", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const email = `member-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("linkar-e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\?sent=1/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await context.close();
});

test("dashboard and automation list are reachable", async ({ owner }) => {
  const { page } = owner;
  const name = `E2E Home row ${Date.now()}`;
  await createAutomation(owner, name);
  await page.goto("/dashboard");
  await expect(page.locator(".sidebar-brand")).toBeVisible();
  // "Hello, <name>" once a name is known, "Welcome back" otherwise.
  await expect(page.getByRole("heading", { level: 1, name: /^(Hello, |Welcome back)/ })).toBeVisible();
  await expect(page.getByLabel("Performance over time")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your automations" }).getByText(name)).toBeVisible();
  await page.getByRole("link", { name: "Automations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Automations", exact: true })).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: name })).toBeVisible();
});

test("automation delivery problems are visible without recipient payloads", async ({ owner }) => {
  const { page } = owner;
  const automation = await createAutomation(owner, "Diagnostics");
  // The list asks for recent delivery problems after it renders.
  await page.route("**/api/automations/deliveries**", (route) => route.fulfill({
    json: { data: [{
      kind: "LEAD_WEBHOOK",
      state: "UNKNOWN",
      attemptCount: 1,
      automationId: automation.id,
      lastError: "Provider connection closed before a response",
      updatedAt: "2026-08-23T12:00:00.000Z",
    }] },
  }));
  await page.goto("/automations");
  const issues = page.getByRole("region", { name: "Delivery issues" });
  await expect(issues.getByText("Needs review")).toBeVisible();
  await expect(issues.getByText("Provider connection closed before a response")).toBeVisible();
  await expect(page.getByText(/recipientId|payload|access-token-secret/)).toHaveCount(0);
});

/** Walks a wizard-style builder to its final step by clicking "Next" until the
 * target save button is rendered (the footer swaps Next for Save on review).
 * Tolerates the transient render gap right after each step change. */
async function nextUntil(page: import("@playwright/test").Page, saveName: string | RegExp) {
   
  for (;;) {
    const save = page.getByRole("button", { name: saveName });
    if (await save.isVisible().catch(() => false)) return;
    const next = page.getByRole("button", { name: "Next", exact: true });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
    }
    await page.waitForTimeout(120);
  }
}

// The builder saves through the real API, so the list afterwards shows the
// row the server stored.
test("classic builder creates a keyword autoresponder", async ({ owner }) => {
  const { page } = owner;
  const name = `E2E Autoresponder ${Date.now()}`;
  await connectInstagram(owner);
  await page.goto("/automations/new?type=classic");
  await expect(page.getByRole("heading", { name: /New automatic reply/i })).toBeVisible();

  await page.getByLabel("Automation name").fill(name);
  await page.getByLabel("Starts when").selectOption("message");
  await page.getByLabel("Words to look for").fill("price");
  // Action step: Trigger → Condition → Action.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Message text").fill("Here is the pricing you asked for.");
  await nextUntil(page, "Save and turn on");
  await page.getByRole("button", { name: "Save and turn on" }).click();
  await expect(page.getByText("Saved and turned on.", { exact: false })).toBeVisible();

  await page.goto("/automations");
  const row = page.getByRole("article").filter({ hasText: name });
  await expect(row).toBeVisible();
  // The row says what starts it: the trigger, then its keywords, as chips.
  await expect(row.getByText("DM", { exact: true })).toBeVisible();
  await expect(row.getByText("price", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: `Pause ${name}` })).toHaveAttribute("aria-pressed", "true");
});

test("basic template gallery sets up a ready-to-edit automation", async ({ owner }) => {
  const { page } = owner;
  await connectInstagram(owner);
  await page.goto("/automations");
  await page.getByRole("button", { name: /new automation/i }).click();

  const dialog = page.getByRole("dialog");
  const startersTile = dialog.locator(".template-picker-tile", { hasText: "Answer common questions" });
  await expect(startersTile).toBeVisible();
  await expect(dialog.getByText(/Unavailable for now\./)).toHaveCount(0);
  await expect(dialog.getByText("BETA")).toHaveCount(0);
  await startersTile.click();

  await expect(page.getByRole("heading", { name: /New automatic reply/i })).toBeVisible();
  await expect(page.getByLabel("Automation name")).toHaveValue("Answer common questions");

  await nextUntil(page, "Save and turn on");
  await page.getByRole("button", { name: "Save and turn on" }).click();
  await expect(page.getByText("Saved and turned on.", { exact: false })).toBeVisible();

  await page.goto("/automations");
  await expect(page.getByRole("article").filter({ hasText: "Answer common questions" })).toBeVisible();
});

test("guided builder saves an automation draft", async ({ page }) => {
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/meta/connection", (route) => route.fulfill({ json: { data: [{ id: "connection_1", igUserId: "ig_1", username: "testbrand", status: "CONNECTED", connectedAt: "2026-09-01T00:00:00.000Z" }] } }));
  await page.route("**/api/automations", (route) => { saved = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { data: { id: "automation_draft", ...saved } } }); });
  await page.goto("/automations/new?type=classic");
  await page.getByLabel("Automation name").fill("E2E guide delivery");
  await page.getByLabel("Words to look for", { exact: true }).fill("guide");
  await nextUntil(page, "Save and turn on");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace as a draft.");
  expect(saved?.name).toBe("E2E guide delivery");
});

test("guided builder creates a follow-gated Reel campaign", async ({ owner }) => {
  const { page } = owner;
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
  await connectInstagram(owner);

  await page.goto("/automations");
  await page.getByRole("button", { name: /new automation/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Send a link after someone follows you")).toBeVisible();
  await dialog.locator(".template-picker-tile", { hasText: "Send a link after someone follows you" }).click();
  await expect(page.getByRole("heading", { name: /Send a link after someone follows you/i })).toBeVisible();

  await page.getByLabel("Automation name").fill(automationName);
  // Posts step: pick the mocked Reel.
  await page.getByRole("checkbox", { name: /test reel/i }).click();
  // Comments step.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Words to look for", { exact: true }).fill("guide");
  await page.getByLabel("Reply 1", { exact: true }).fill("Check your DMs for the guide.");
  // First DM step.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("First message", { exact: true }).fill("Reply guide! Tap below and I will send it over.");
  await page.getByLabel("Message for people who don’t follow you yet").fill("Follow us first, then tap I followed to unlock this.");
  // Delivery step.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Message to send with the link").fill("You are verified - here is your guide.");
  await page.getByLabel("Link to send").fill("https://example.com/guide");
  // Guardrails, then Review.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Review the follow gate before saving: the gate is enabled by default and
  // the review step summarizes it explicitly.
  await expect(page.getByTestId("review-summary")).toContainText(
    "If they don’t follow you yet, it asks them to follow first",
  );

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your workspace.");

  await page.goto("/automations");
  const row = page.getByRole("article").filter({ hasText: automationName });
  await expect(row).toBeVisible();
  // A campaign has an activity feed, reached from the row's overflow menu.
  await row.getByRole("button", { name: `More actions for ${automationName}` }).click();
  await expect(page.getByRole("menuitem", { name: `View activity for ${automationName}` })).toBeVisible();
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
    json: { data: [{ id: "automation_1", name: "Email capture", version: 1, definition: { version: 1 } }] },
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

// An automation's pages render only for a row the workspace owns, so this
// one is real; its (empty) activity comes from the real API.
test("activity export stays scoped to the selected automation", async ({ owner }) => {
  const { page } = owner;
  const automation = await createAutomation(owner, "Export scope");

  await page.goto(`/automations/${automation.id}/activity`);

  await expect(page.getByRole("link", { name: /export csv/i }))
    .toHaveAttribute("href", `/api/insights/export?automationId=${encodeURIComponent(automation.id)}`);
});

test("Facebook review pages are reachable", async ({ page }) => {
  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/data-deletion", "Data deletion"], ["/support", "Support"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

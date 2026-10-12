import { expect, test } from "./fixtures";

const AUTOMATION_NAME = "Reply when a comment includes chosen words";

// The whole Facebook Page comment journey against the real API, in a
// workspace of its own with one connected Page: pick the template, set the
// matching and limits, save a draft, turn it on from the list, reopen it in
// the editor, and read its (Page-only, no Messenger) activity.
test("creates, reopens, activates, and renders a Facebook Page comment automation", async ({ owner }) => {
  const { page } = owner;
  const facebookPage = await owner.connectFacebookPage("Linkar Demo Page");
  // Health is checked live with Meta; the seeded Page has no real token.
  await page.route("**/api/facebook/connection/health**", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/automations/suggest-keywords**", (route) => route.fulfill({ json: { data: ["price", "details"] } }));

  await page.goto("/automations");
  await page.getByRole("button", { name: "New automation" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Choose a template" });
  await dialog.getByRole("group", { name: "Automation channel" }).getByRole("button", { name: "Facebook" }).click();
  // The only connected Page is chosen for you.
  await expect(dialog.getByLabel("Facebook Page")).toHaveValue(facebookPage.pageId);
  await dialog.getByRole("button", { name: new RegExp(`^${AUTOMATION_NAME}`) }).click();

  // Step 1: where and when.
  await expect(page.getByRole("heading", { level: 1, name: "New automatic reply" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Facebook Page/ })).toBeChecked();
  await expect(page.getByRole("main").getByRole("combobox", { name: "Facebook Page" })).toHaveValue(facebookPage.pageId);
  await page.getByRole("radio", { name: /^Only posts I choose/ }).check();
  await page.getByRole("textbox", { name: "Post IDs" }).fill("post_1");
  await page.getByText("More matching options").click();
  await page.getByLabel("How should the words match?").selectOption("all");
  await page.getByLabel("Words to ignore").fill("spam");
  await page.getByLabel("Reply once per person").check();
  const next = page.getByRole("button", { name: "Next", exact: true });
  await next.click();

  // Step 2: no extra check. Step 3: a second reply version.
  await expect(page.getByRole("heading", { level: 2, name: "Who should it reply to?" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { level: 2, name: "What should it reply publicly?" })).toBeVisible();
  await page.getByRole("button", { name: "Add another version" }).click();
  await page.getByLabel("Reply 2", { exact: true }).fill("Happy to help with those details.");
  await next.click();

  // Step 4: limits and priority.
  await expect(page.getByRole("heading", { level: 2, name: "Any limits on when or how often?" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Daily limit" }).fill("100");
  await page.getByText("If another automation also matches").click();
  await page.getByRole("spinbutton", { name: "Priority" }).fill("7");
  await next.click();

  // Step 5: review names the Page, then save a draft for real.
  await expect(page.getByRole("heading", { level: 2, name: "Review and turn on" })).toBeVisible();
  await expect(page.getByText(`“${AUTOMATION_NAME}” on your Facebook Page Linkar Demo Page`)).toBeVisible();
  const created = page.waitForResponse((response) => response.url().endsWith("/api/automations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save draft" }).click();
  const saved = await created;
  expect(saved.status()).toBe(201);
  const { data: automation } = (await saved.json()) as { data: { id: string; provider: string; facebookPageId: string; priority: number; status: string; definition: Record<string, unknown> } };
  expect(automation).toMatchObject({ provider: "FACEBOOK", facebookPageId: facebookPage.pageId, priority: 7, status: "DRAFT" });
  expect(JSON.stringify(automation.definition)).toContain("Happy to help with those details.");
  expect(JSON.stringify(automation.definition)).toContain("post_1");
  expect(JSON.stringify(automation.definition)).toContain("spam");

  // Turn it on from the (server-rendered) list.
  await page.goto("/automations");
  const row = page.getByRole("article", { name: AUTOMATION_NAME });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Turn on ${AUTOMATION_NAME}` }).click();
  await expect(row.getByRole("button", { name: `Pause ${AUTOMATION_NAME}` })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => {
    const response = await page.request.get(`/api/automations/${automation.id}`);
    return ((await response.json()) as { data: { status: string } }).data.status;
  }).toBe("ACTIVE");

  // Reopen it in the editor: the Page and priority come back.
  await page.goto(`/automations/${automation.id}/edit`);
  await expect(page.getByRole("main").getByRole("combobox", { name: "Facebook Page" })).toHaveValue(facebookPage.pageId);
  await page.getByRole("navigation", { name: "Builder steps" }).getByRole("button", { name: /^Step 4:/ }).click();
  const priority = page.getByRole("spinbutton", { name: "Priority" });
  if (!(await priority.isVisible())) await page.getByText("If another automation also matches").click();
  await expect(priority).toHaveValue("7");

  // Facebook activity is Page replies only - no Messenger conversation.
  await page.route(`**/api/automations/${automation.id}/activity`, (route) => route.fulfill({ json: {
    channel: { provider: "FACEBOOK", surface: "COMMENT", connectionName: "Linkar Demo Page" },
    data: [{ id: "execution_1", provider: "FACEBOOK", surface: "COMMENT", connectionName: "Linkar Demo Page", eventType: "comment.created", result: "SENT", authorName: "Aanya", commentPreview: "Price and details?", replyPreview: "Happy to help with those details.", createdAt: "2026-09-01T01:00:00.000Z" }],
  } }));
  await page.route("**/api/insights?**", (route) => route.fulfill({
    json: { timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] }, mediaPerformance: [] },
  }));
  await page.goto(`/automations/${automation.id}/activity`);
  await expect(page.getByRole("heading", { level: 1, name: AUTOMATION_NAME })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Replies on Linkar Demo Page" })).toBeVisible();
  await expect(page.getByText("Happy to help with those details.")).toBeVisible();
  await expect(page.getByText(/do not open a Messenger conversation/i)).toBeVisible();
});

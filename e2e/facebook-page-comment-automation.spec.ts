import { expect, test, type Page } from "@playwright/test";

async function advance(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(80);
}

test("creates, reopens, activates, and renders a Facebook Page comment automation", async ({ page }) => {
  let savedBody: Record<string, unknown> | null = null;
  let savedStatus = "DRAFT";
  const facebookPage = { id: "page_record_1", pageId: "page_1", pageName: "Linkar Demo Page", status: "CONNECTED", connectedAt: "2026-09-01T00:00:00.000Z" };

  await page.route("**/api/facebook/connection**", (route) => route.fulfill({ json: { data: [facebookPage] } }));
  await page.route("**/api/meta/connection**", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/meta/media**", (route) => route.fulfill({ json: { data: [], paging: {} } }));
  await page.route("**/api/automations/suggest-keywords**", (route) => route.fulfill({ json: { data: ["price", "details"] } }));
  await page.route("**/api/automations/simulate", (route) => route.fulfill({ json: {
    data: { result: { matched: true, actions: [{ type: "private_reply", summary: "Public Page reply" }] }, issues: [] },
  } }));
  await page.route("**/api/automations", async (route) => {
    if (route.request().method() === "POST") {
      savedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: { data: { id: "automation_fb", ...savedBody, status: "DRAFT", version: 1, priority: 7 } } });
      return;
    }
    await route.fulfill({ json: { data: savedBody ? [{ id: "automation_fb", ...savedBody, status: savedStatus, version: 1, priority: 7 }] : [] } });
  });
  await page.route("**/api/automations/automation_fb", async (route) => {
    if (route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON() as { status?: string };
      if (patch.status) savedStatus = patch.status;
    }
    await route.fulfill({ json: { data: { id: "automation_fb", ...savedBody, status: savedStatus, version: 1, priority: 7, provider: "FACEBOOK", facebookPageId: "page_1" } } });
  });

  await page.goto("/automations");
  await page.getByRole("button", { name: "New automation" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Facebook" }).click();
  await dialog.getByLabel("Facebook Page").selectOption("page_1");
  await dialog.getByText("Keyword comment reply", { exact: true }).click();

  await expect(page.getByLabel("Channel")).toHaveValue("FACEBOOK");
  await expect(page.getByLabel("Facebook Page")).toHaveValue("page_1");
  await page.getByLabel("Post IDs").fill("post_1");
  await page.getByLabel("Keywords", { exact: true }).fill("price, details");
  await page.getByLabel("Keyword logic").selectOption("all");
  await page.getByLabel("Exclude keywords").fill("spam");
  await page.getByLabel("Reply once per person").check();
  await page.getByLabel("Sample event type").selectOption("comment.created");
  await page.getByLabel("Sample event text").fill("price and details");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/would fire 1 action/i)).toBeVisible();
  await advance(page);
  await advance(page);
  await page.getByRole("button", { name: "Add reply variation" }).click();
  await page.getByLabel("Public Page reply variation 2").fill("Happy to help with those details.");
  await advance(page);
  await page.getByLabel("Priority").fill("7");
  await page.getByLabel("Daily send limit").fill("100");
  await advance(page);
  await expect(page.getByText(/Facebook · Page comments · Linkar Demo Page/)).toBeVisible();
  await page.getByRole("button", { name: /save automation/i }).click();
  await expect.poll(() => savedBody).not.toBeNull();

  if (!savedBody) throw new Error("The automation save request was not captured");
  const definition = (savedBody as { definition: Record<string, unknown> }).definition;
  await page.getByRole("link", { name: "Back to automations" }).click();
  await page.getByRole("button", { name: /Activate Facebook keyword comment reply/i }).click();
  await expect.poll(() => savedStatus).toBe("ACTIVE");
  await page.goto("/automations/automation_fb/edit");
  await expect(page.getByLabel("Facebook Page")).toHaveValue("page_1");
  await expect(page.getByLabel("Priority")).toHaveValue("7");

  await page.route("**/api/automations/automation_fb/activity", (route) => route.fulfill({ json: {
    channel: { provider: "FACEBOOK", surface: "COMMENT", connectionName: "Linkar Demo Page" },
    data: [{ id: "execution_1", provider: "FACEBOOK", surface: "COMMENT", connectionName: "Linkar Demo Page", eventType: "comment.created", result: "SENT", replyPreview: "Happy to help with those details.", createdAt: "2026-09-01T01:00:00.000Z" }],
  } }));
  await page.goto("/automations/automation_fb/activity");
  await expect(page.getByText("Public Page reply")).toBeVisible();
  await expect(page.getByText("Happy to help with those details.")).toBeVisible();
  await expect(page.getByText(/do not open a Messenger conversation/i)).toBeVisible();
});
